import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMarkerDirectoryForFileOrDefault } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const RUST_EXTENSIONS = [".rs"];
const RUST_WORKSPACE_FILES = ["Cargo.toml", "Cargo.lock"];

async function findCargoWorkspaceDirectory(file: string, projectDirectory: string): Promise<string> {
  const crateDirectory = await getMarkerDirectoryForFileOrDefault(file, projectDirectory, RUST_WORKSPACE_FILES);

  let currentDirectory = crateDirectory;
  while (currentDirectory.startsWith(projectDirectory)) {
    const manifest = await readFile(path.join(currentDirectory, "Cargo.toml"), "utf8").catch(() => "");
    if (manifest.includes("[workspace]")) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }
  return crateDirectory;
}

export const rust: ServerDefinition = {
  id: "rust",
  extensions: RUST_EXTENSIONS,
  findWorkspaceDirectory: findCargoWorkspaceDirectory,
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("rust-analyzer", workspaceDirectory);
    if (!binary) {
      return buildBinaryNotFound("rust-analyzer");
    }

    // Clippy is the default on-save check when installed; without it `cargo clippy` would fail and hide every error.
    const isClippyInstalled = Bun.which("cargo-clippy", { PATH: process.env.PATH ?? "" }) !== null;

    return isClippyInstalled
      ? buildLaunchConfig(binary, [], { initialization: { check: { command: "clippy" } } })
      : buildLaunchConfig(binary);
  },
};
