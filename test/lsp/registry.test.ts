import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import path from "node:path";
import type { ServerDefinition } from "../../src/lsp/definitions/server.ts";
import { LANGUAGE_IDS } from "../../src/lsp/language.ts";
import { DEFAULT_SERVER_DEFINITIONS, getServerDefinitions } from "../../src/lsp/registry.ts";
import { parseOptions } from "../../src/options.ts";
import { createFakeProject } from "../fixtures/project.ts";
import { createFakeServerBinDirectory, FAKE_SERVER_DEFINITIONS } from "../fixtures/server.ts";

function getServerIDs(serverDefinitions: readonly ServerDefinition[]): string[] {
  return serverDefinitions.map((serverDefinition) => serverDefinition.id);
}

function findServerDefinition(serverDefinitions: readonly ServerDefinition[], serverID: string) {
  return serverDefinitions.find((serverDefinition) => serverDefinition.id === serverID);
}

async function findDefaultLaunchConfig(
  projectDirectory: string,
  serverID: string,
  serverOverrides: Record<string, unknown> = {},
) {
  const options = parseOptions({ servers: { ty: {}, ...serverOverrides } });
  const definition = findServerDefinition(getServerDefinitions(DEFAULT_SERVER_DEFINITIONS, options), serverID);
  const launchConfig = await definition!.findLaunchConfig(projectDirectory, projectDirectory);
  if ("reason" in launchConfig) {
    throw new Error(`${serverID} has no launch config: ${launchConfig.reason}`);
  }
  return launchConfig;
}

describe("getServerDefinitions", () => {
  it("leaves servers that are disabled by default off", () => {
    // Arrange
    const options = parseOptions({});

    // Act
    const serverDefinitions = getServerDefinitions(FAKE_SERVER_DEFINITIONS, options);

    // Assert
    expect(getServerIDs(serverDefinitions)).toEqual(["pyright", "rust"]);
  });

  it("replaces pyright when ty is enabled", () => {
    // Arrange
    const options = parseOptions({ servers: { ty: {} } });

    // Act
    const serverDefinitions = getServerDefinitions(FAKE_SERVER_DEFINITIONS, options);

    // Assert
    expect(getServerIDs(serverDefinitions)).toEqual(["ty", "rust"]);
  });

  it("removes disabled servers", () => {
    // Arrange
    const options = parseOptions({ servers: { rust: { disabled: true } } });

    // Act
    const serverDefinitions = getServerDefinitions(FAKE_SERVER_DEFINITIONS, options);

    // Assert
    expect(getServerIDs(serverDefinitions)).toEqual(["pyright"]);
  });

  it("merges env and options into a default server launch", async () => {
    // Arrange
    const options = parseOptions({
      servers: {
        pyright: { env: { A: "1" }, options: { extra: true } },
      },
    });

    // Act
    const pyrightDefinition = findServerDefinition(getServerDefinitions(FAKE_SERVER_DEFINITIONS, options), "pyright")!;
    const launchConfig = await pyrightDefinition.findLaunchConfig("/project", "/project");

    // Assert
    expect(launchConfig).toEqual({
      command: ["pyright-langserver", "--stdio"],
      env: { A: "1" },
      initialization: { mode: "default", extra: true },
      settings: { python: { pythonPath: "/venv" } },
    });
  });

  it("uses the configured command instead of detection", async () => {
    // Arrange
    const options = parseOptions({ servers: { rust: { command: ["/opt/rust-analyzer"] } } });

    // Act
    const rustDefinition = findServerDefinition(getServerDefinitions(FAKE_SERVER_DEFINITIONS, options), "rust")!;
    const launchConfig = await rustDefinition.findLaunchConfig("/project", "/project");

    // Assert
    expect(launchConfig).toEqual({ command: ["/opt/rust-analyzer"] });
  });

  it("adds custom servers and drops ones without a command", async () => {
    // Arrange
    const options = parseOptions({
      servers: { custom: { command: ["custom", "--stdio"], extensions: [".x"] }, empty: { extensions: [".y"] } },
    });

    // Act
    const serverDefinitions = getServerDefinitions(FAKE_SERVER_DEFINITIONS, options);

    // Assert
    expect(getServerIDs(serverDefinitions)).toEqual(["pyright", "rust", "custom"]);

    // Act
    const customDefinition = findServerDefinition(serverDefinitions, "custom")!;
    const customWorkspaceDirectory = await customDefinition.findWorkspaceDirectory("/project/src/a.x", "/project");

    // Assert
    expect(customWorkspaceDirectory).toBe("/project");
  });
});

describe("DEFAULT_SERVER_DEFINITIONS", () => {
  it("has a language id for every extension a server handles", () => {
    // Assert
    for (const definition of DEFAULT_SERVER_DEFINITIONS) {
      for (const extension of definition.extensions) {
        expect(LANGUAGE_IDS[extension], `${definition.id} ${extension}`).toBeDefined();
      }
    }
  });

  it("documents every server in the README", async () => {
    // Arrange
    const readme = await Bun.file(path.join(import.meta.dir, "..", "..", "README.md")).text();

    // Assert
    for (const definition of DEFAULT_SERVER_DEFINITIONS) {
      expect(readme).toContain(`\n#### ${definition.id}\n`);
    }
  });
});

describe("DEFAULT_SERVER_DEFINITIONS launch configs", () => {
  // ty is turned on in every launch below and replaces pyright, so pyright gets its own test.
  const SERVER_IDS_WITHOUT_PYRIGHT = DEFAULT_SERVER_DEFINITIONS.map((definition) => definition.id).filter(
    (id) => id !== "pyright",
  );
  // vscode-eslint needs client settings to run at all. They are plumbing, not defaults users override.
  const SERVER_IDS_WITHOUT_SETTINGS = SERVER_IDS_WITHOUT_PYRIGHT.filter((id) => id !== "eslint");

  let projectDirectory = "";
  let originalPath = "";

  beforeAll(async () => {
    projectDirectory = await createFakeProject({
      "node_modules/eslint/package.json": "{}",
      "node_modules/typescript/package.json": JSON.stringify({ version: "7.0.2" }),
      "node_modules/typescript/bin/tsc": "",
    });
    const fakeBinDirectory = await createFakeServerBinDirectory(projectDirectory);
    originalPath = process.env.PATH ?? "";
    process.env.PATH = `${fakeBinDirectory}${path.delimiter}${originalPath}`;
  });

  afterAll(() => {
    process.env.PATH = originalPath;
  });

  it.each(SERVER_IDS_WITHOUT_SETTINGS)(
    "%s sends its defaults only at startup, where user options can override them",
    async (serverID) => {
      // Act
      const launchConfig = await findDefaultLaunchConfig(projectDirectory, serverID);

      // Assert
      expect(launchConfig.settings).toBeUndefined();
    },
  );

  it.each(SERVER_IDS_WITHOUT_PYRIGHT)("%s lets user options override every default it sends", async (serverID) => {
    // Arrange
    const defaultInitialization = (await findDefaultLaunchConfig(projectDirectory, serverID)).initialization ?? {};
    const overriddenInitialization = Object.fromEntries(
      Object.keys(defaultInitialization).map((key) => [key, "overridden"]),
    );

    // Act
    const launchConfig = await findDefaultLaunchConfig(projectDirectory, serverID, {
      [serverID]: { options: overriddenInitialization },
    });

    // Assert
    expect(launchConfig.initialization ?? {}).toEqual({ ...defaultInitialization, ...overriddenInitialization });
  });

  it("pyright sends its defaults only at startup", async () => {
    // Act
    const launchConfig = await findDefaultLaunchConfig(projectDirectory, "pyright", { ty: { disabled: true } });

    // Assert
    expect(launchConfig.settings).toBeUndefined();
  });
});
