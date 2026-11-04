import { readFile } from "node:fs/promises";
import path from "node:path";
import { findMarkerDirectory } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const RUFF_EXTENSIONS = [".py", ".pyi"];
const RUFF_WORKSPACE_FILES = ["ruff.toml", ".ruff.toml"];

async function findRuffWorkspaceDirectory(file: string, projectDirectory: string): Promise<string | undefined> {
  let currentDirectory = path.dirname(file);
  while (true) {
    if ((await findMarkerDirectory(currentDirectory, currentDirectory, RUFF_WORKSPACE_FILES)) !== undefined) {
      return currentDirectory;
    }
    const pyproject = await readFile(path.join(currentDirectory, "pyproject.toml"), "utf8").catch(() => "");
    if (/^\[tool\.ruff[\].]/m.test(pyproject)) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (currentDirectory === projectDirectory || parentDirectory === currentDirectory) {
      return undefined;
    }
    currentDirectory = parentDirectory;
  }
}

export const ruff: ServerDefinition = {
  id: "ruff",
  extensions: RUFF_EXTENSIONS,
  findWorkspaceDirectory: findRuffWorkspaceDirectory,
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("ruff", workspaceDirectory);
    return binary ? buildLaunchConfig(binary, ["server"]) : buildBinaryNotFound("ruff");
  },
};
