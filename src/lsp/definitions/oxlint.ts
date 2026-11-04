import { findMarkerDirectoryForFile } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const OXLINT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".astro", ".svelte"];
const OXLINT_WORKSPACE_FILES = [".oxlintrc.json"];

export const oxlint: ServerDefinition = {
  id: "oxlint",
  extensions: OXLINT_EXTENSIONS,
  findWorkspaceDirectory: (file, projectDirectory) =>
    findMarkerDirectoryForFile(file, projectDirectory, OXLINT_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("oxlint", workspaceDirectory);
    if (binary) {
      const help = Bun.spawnSync([binary, "--help"], { stdout: "pipe", stderr: "ignore" });
      if (help.stdout.toString().includes("--lsp")) {
        return buildLaunchConfig(binary, ["--lsp"]);
      }
    }

    // Older oxlint releases ship the server as a separate binary.
    const legacyBinary = await findBinary("oxc_language_server", workspaceDirectory);
    return legacyBinary ? buildLaunchConfig(legacyBinary) : buildBinaryNotFound("oxlint");
  },
};
