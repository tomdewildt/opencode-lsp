import { afterEach, describe, expect, it } from "bun:test";
import path from "node:path";
import type { ServerDefinition } from "../../src/lsp/definitions/server.ts";
import { LspManager } from "../../src/lsp/manager.ts";
import { createFakeProject } from "../fixtures/project.ts";
import { buildFakeMissingServerDefinition, buildFakeServerDefinition } from "../fixtures/server.ts";

const MANAGERS: LspManager[] = [];

async function createManager(serverDefinitions: ServerDefinition[]) {
  const projectDirectory = await createFakeProject({ "main.ts": "const a = 1;\n" });
  const manager = new LspManager(serverDefinitions, projectDirectory, { idleTimeoutMs: 0, diagnosticsTimeoutMs: 500 });
  MANAGERS.push(manager);
  return { manager, file: path.join(projectDirectory, "main.ts") };
}

function waitForServerError(manager: LspManager): Promise<void> {
  return new Promise((resolve) => {
    const resolveOnError = () => {
      if (manager.getPluginSnapshot().servers[0]?.state === "error") {
        manager.removeServerChangeListener(resolveOnError);
        resolve();
      }
    };
    manager.addServerChangeListener(resolveOnError);
  });
}

afterEach(async () => {
  await Promise.all(MANAGERS.splice(0).map((manager) => manager.dispose()));
});

describe("LspManager", () => {
  it("starts one server when a file is synced concurrently", async () => {
    // Arrange
    const launchedServerIDs: string[] = [];
    const { manager, file } = await createManager([buildFakeServerDefinition("push", launchedServerIDs)]);

    // Act
    await Promise.all([manager.syncFileToServers(file, false), manager.syncFileToServers(file, false)]);

    // Assert
    expect(launchedServerIDs).toEqual(["fake-push"]);
    expect(manager.getPluginSnapshot().servers).toEqual([
      { id: "fake-push", workspaceDirectory: ".", state: "connected" },
    ]);
  });

  it("collects diagnostics after a sync", async () => {
    // Arrange
    const { manager, file } = await createManager([buildFakeServerDefinition("push")]);

    // Act
    const syncResult = await manager.syncFileToServers(file, true);

    // Assert
    expect(syncResult).toEqual({ failures: [] });
    expect(manager.getDiagnosticsForFile(file).map((diagnostic) => diagnostic.message)).toEqual(["version 0"]);
  });

  it("reports a failure for servers that send no diagnostics", async () => {
    // Arrange
    const { manager, file } = await createManager([buildFakeServerDefinition("silent")]);

    // Act
    const syncResult = await manager.syncFileToServers(file, true);

    // Assert
    expect(syncResult).toEqual({
      failures: [{ serverID: "fake-silent", reason: "did not respond within 0.5s" }],
    });
  });

  it("marks servers without a binary as unavailable and does not retry them", async () => {
    // Arrange
    const launchedServerIDs: string[] = [];
    const { manager, file } = await createManager([buildFakeMissingServerDefinition(launchedServerIDs)]);

    // Act
    await manager.syncFileToServers(file, false);
    await manager.syncFileToServers(file, false);
    const servers = await manager.getServersForFile(file);

    // Assert
    expect(launchedServerIDs).toEqual(["missing"]);
    expect(servers.map(({ serverID, state, reason }) => ({ serverID, state, reason }))).toEqual([
      { serverID: "missing", state: "unavailable", reason: "missing-lsp not found" },
    ]);
    expect(manager.getPluginSnapshot().servers).toEqual([
      { id: "missing", workspaceDirectory: ".", state: "unavailable", reason: "missing-lsp not found" },
    ]);
  });

  it("restarts a crashed server three times and then gives up", async () => {
    // Arrange
    const launchedServerIDs: string[] = [];
    const { manager, file } = await createManager([buildFakeServerDefinition("crash", launchedServerIDs)]);

    // Act
    for (let attempt = 0; attempt < 4; attempt++) {
      const serverError = waitForServerError(manager);
      await manager.syncFileToServers(file, false);
      await serverError;
    }

    // Assert
    expect(launchedServerIDs).toHaveLength(4);

    // Act
    const syncResult = await manager.syncFileToServers(file, false);

    // Assert
    expect(syncResult).toEqual({
      failures: [{ serverID: "fake-crash", reason: "crashed 4 times" }],
    });
    expect(launchedServerIDs).toHaveLength(4);
  });

  it("ignores files outside the project directory", async () => {
    // Arrange
    const launchedServerIDs: string[] = [];
    const { manager } = await createManager([buildFakeServerDefinition("push", launchedServerIDs)]);

    // Act
    await manager.syncFileToServers("/elsewhere/main.ts", false);

    // Assert
    expect(launchedServerIDs).toEqual([]);
  });
});
