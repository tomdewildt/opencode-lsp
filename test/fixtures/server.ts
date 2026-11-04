import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LaunchConfig, ServerDefinition } from "../../src/lsp/definitions/server.ts";
import type { FakeMode } from "./scripts/run-server.ts";

// The script is started as its own process. Importing a value from it would start it inside the test process.
export const FAKE_SERVER_SCRIPT = path.join(import.meta.dir, "scripts", "run-server.ts");

export const FAKE_SERVER_DEFINITIONS: readonly ServerDefinition[] = [
  {
    id: "pyright",
    extensions: [".py"],
    findWorkspaceDirectory: async () => "/project",
    findLaunchConfig: async () => ({
      command: ["pyright-langserver", "--stdio"],
      initialization: { mode: "default" },
      settings: { python: { pythonPath: "/venv" } },
    }),
  },
  {
    id: "ty",
    extensions: [".py"],
    disabledByDefault: true,
    replacesServerIDs: ["pyright"],
    findWorkspaceDirectory: async () => "/project",
    findLaunchConfig: async () => ({ command: ["ty", "server"] }),
  },
  {
    id: "rust",
    extensions: [".rs"],
    findWorkspaceDirectory: async () => "/project",
    findLaunchConfig: async () => ({ reason: "rust-analyzer not found" }),
  },
];

const FAKE_SERVER_BINARIES = [
  "ansible-language-server",
  "cargo-clippy",
  "clojure-lsp",
  "gopls",
  "pyright-langserver",
  "ruff",
  "rust-analyzer",
  "terraform-ls",
  "tflint",
  "ty",
  "typescript-language-server",
  "vscode-eslint-language-server",
];

export function buildFakeLaunchConfig(
  mode: FakeMode,
  extras: Omit<LaunchConfig, "command" | "env"> = {},
): LaunchConfig {
  return { command: [process.execPath, FAKE_SERVER_SCRIPT], env: { FAKE_MODE: mode }, ...extras };
}

export function buildFakeServerDefinition(mode: FakeMode, launchedServerIDs: string[] = []): ServerDefinition {
  const id = `fake-${mode}`;
  return {
    id,
    extensions: [".ts"],
    findWorkspaceDirectory: async (_file, projectDirectory) => projectDirectory,
    findLaunchConfig: async () => {
      launchedServerIDs.push(id);
      return buildFakeLaunchConfig(mode);
    },
  };
}

export function buildFakeMissingServerDefinition(launchedServerIDs: string[] = []): ServerDefinition {
  return {
    id: "missing",
    extensions: [".ts"],
    findWorkspaceDirectory: async (_file, projectDirectory) => projectDirectory,
    findLaunchConfig: async () => {
      launchedServerIDs.push("missing");
      return { reason: "missing-lsp not found" };
    },
  };
}

export async function createFakeServerBinDirectory(parentDirectory: string): Promise<string> {
  const fakeBinDirectory = path.join(parentDirectory, "fake-bin");
  await mkdir(fakeBinDirectory);
  for (const binary of FAKE_SERVER_BINARIES) {
    await writeFile(path.join(fakeBinDirectory, binary), "#!/bin/sh\n", { mode: 0o755 });
  }
  // oxlint is detected by `--lsp` in its help output.
  await writeFile(path.join(fakeBinDirectory, "oxlint"), "#!/bin/sh\necho --lsp\n", { mode: 0o755 });
  return fakeBinDirectory;
}
