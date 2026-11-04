import { findMarkerDirectoryForFile, getMarkerDirectoryForFileOrDefault } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const GOPLS_EXTENSIONS = [".go"];
const GOPLS_WORKSPACE_FILES = ["go.work", "go.mod", "go.sum"];

export const gopls: ServerDefinition = {
  id: "gopls",
  extensions: GOPLS_EXTENSIONS,
  // A go.work further up wins over the nearest go.mod: it joins several modules into one workspace.
  findWorkspaceDirectory: async (file, projectDirectory) =>
    (await findMarkerDirectoryForFile(file, projectDirectory, ["go.work"])) ??
    getMarkerDirectoryForFileOrDefault(file, projectDirectory, GOPLS_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("gopls", workspaceDirectory);
    // Staticcheck is on by default. gopls runs it a second after a change (`diagnosticsDelay`), which is after
    // the diagnostics wait so the delay is dropped.
    return binary
      ? buildLaunchConfig(binary, [], { initialization: { staticcheck: true, diagnosticsDelay: "0s" } })
      : buildBinaryNotFound("gopls");
  },
};
