import { readFile } from "node:fs/promises";
import path from "node:path";
import { findMatchingDirectory, hasMarkerFile } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const RUFF_EXTENSIONS = [".py", ".pyi"];
const RUFF_WORKSPACE_FILES = ["ruff.toml", ".ruff.toml"];

async function isRuffWorkspaceDirectory(directory: string): Promise<boolean> {
  const markerResults = await Promise.all(RUFF_WORKSPACE_FILES.map((marker) => hasMarkerFile(directory, marker)));
  if (markerResults.includes(true)) {
    return true;
  }

  const pyproject = await readFile(path.join(directory, "pyproject.toml"), "utf8").catch(() => "");
  return /^\[tool\.ruff[\].]/m.test(pyproject);
}

export const ruff: ServerDefinition = {
  id: "ruff",
  extensions: RUFF_EXTENSIONS,
  findWorkspaceDirectory: (file, projectDirectory) =>
    findMatchingDirectory(path.dirname(file), projectDirectory, isRuffWorkspaceDirectory),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("ruff", workspaceDirectory);
    return binary ? buildLaunchConfig(binary, ["server"]) : buildBinaryNotFound("ruff");
  },
};
