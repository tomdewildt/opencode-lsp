import { afterEach, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { HoverRequest } from "vscode-languageserver-protocol";
import { LspClient } from "../../src/lsp/client.ts";
import { createFakeProject } from "../fixtures/project.ts";
import type { FakeMode } from "../fixtures/scripts/run-server.ts";
import { buildFakeLaunchConfig } from "../fixtures/server.ts";

const DIAGNOSTICS_TIMEOUT_MS = 500;
const HOVER_PARAMS = { textDocument: { uri: "file:///main.ts" }, position: { line: 0, character: 0 } };

const clients: LspClient[] = [];

function getDiagnosticMessages(client: LspClient, file: string) {
  return client.getDiagnosticsForFile(file).map((diagnostic) => diagnostic.message);
}

async function startClient(mode: FakeMode, extras: Parameters<typeof buildFakeLaunchConfig>[1] = {}) {
  const workspaceDirectory = await createFakeProject({ "main.ts": "const a = 1;\n" });
  const launchConfig = buildFakeLaunchConfig(mode, extras);
  const client = await LspClient.start("fake", workspaceDirectory, launchConfig, DIAGNOSTICS_TIMEOUT_MS);
  clients.push(client);
  return { client, file: path.join(workspaceDirectory, "main.ts") };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
});

describe("LspClient", () => {
  it("waits for pushed diagnostics when a file is opened", async () => {
    // Arrange
    const { client, file } = await startClient("push");

    // Act
    const isDiagnosticsComplete = await client.syncFile(file, true);

    // Assert
    expect(isDiagnosticsComplete).toBe(true);
    expect(getDiagnosticMessages(client, file)).toEqual(["version 0"]);
  });

  it("bumps the version and replaces diagnostics when a file is opened again", async () => {
    // Arrange
    const { client, file } = await startClient("push");
    await client.syncFile(file, true);
    await writeFile(file, "const a = 2;\n");

    // Act
    const isDiagnosticsComplete = await client.syncFile(file, true);

    // Assert
    expect(isDiagnosticsComplete).toBe(true);
    expect(getDiagnosticMessages(client, file)).toEqual(["version 1"]);
  });

  it("uses pull diagnostics when the server supports them", async () => {
    // Arrange
    const { client, file } = await startClient("pull");

    // Act
    const isDiagnosticsComplete = await client.syncFile(file, true);

    // Assert
    expect(isDiagnosticsComplete).toBe(true);
    expect(getDiagnosticMessages(client, file)).toEqual(["pulled"]);
  });

  it("reports incomplete diagnostics when the server stays silent", async () => {
    // Arrange
    const { client, file } = await startClient("silent");
    const startedAt = Date.now();

    // Act
    const isDiagnosticsComplete = await client.syncFile(file, true);

    // Assert
    expect(isDiagnosticsComplete).toBe(false);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(DIAGNOSTICS_TIMEOUT_MS - 10);
  });

  it("reports the capabilities the server advertised", async () => {
    // Arrange
    const { client } = await startClient("push");

    // Act
    const hasHoverCapability = client.hasCapability("hoverProvider");
    const hasDefinitionCapability = client.hasCapability("definitionProvider");

    // Assert
    expect(hasHoverCapability).toBe(true);
    expect(hasDefinitionCapability).toBe(false);
  });

  it("forwards requests to the server", async () => {
    // Arrange
    const { client } = await startClient("push");

    // Act
    const hover = await client.sendRequest(HoverRequest.type, HOVER_PARAMS);

    // Assert
    expect(hover).toEqual({ contents: "hovered 1" });
  });

  it("answers configuration requests from the settings, with an empty object for unknown sections", async () => {
    // Arrange
    const settings = { python: { analysis: { strict: true } } };
    const { client } = await startClient("configuration", { settings });

    // Act
    const hover = await client.sendRequest(HoverRequest.type, HOVER_PARAMS);

    // Assert
    expect(hover).toEqual({
      contents: JSON.stringify([{ strict: true }, {}, {}, settings]),
    });
  });

  it("retries requests while the server reports content modified", async () => {
    // Arrange
    const { client } = await startClient("busy");

    // Act
    const hover = await client.sendRequest(HoverRequest.type, HOVER_PARAMS);

    // Assert
    expect(hover).toEqual({ contents: "hovered 3" });
  });

  it("notifies exit listeners when the server crashes", async () => {
    // Arrange
    const { client, file } = await startClient("crash");
    const exited = new Promise<void>((resolve) => client.addServerExitListener(resolve));

    // Act
    await client.syncFile(file, false).catch(() => undefined);

    // Assert
    await expect(exited).resolves.toBeUndefined();
  });

  it("rejects when the server exits during initialize", async () => {
    // Arrange
    const workspaceDirectory = await createFakeProject({});

    // Act
    const promise = LspClient.start("fake", workspaceDirectory, buildFakeLaunchConfig("die"), DIAGNOSTICS_TIMEOUT_MS);

    // Assert
    await expect(promise).rejects.toThrow("exited");
  });
});
