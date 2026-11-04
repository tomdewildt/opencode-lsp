import { findMarkerDirectoryForFile } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const TFLINT_EXTENSIONS = [".tf", ".tfvars"];
const TFLINT_WORKSPACE_FILES = [".tflint.hcl"];

export const tflint: ServerDefinition = {
  id: "tflint",
  extensions: TFLINT_EXTENSIONS,
  findWorkspaceDirectory: (file, projectDirectory) =>
    findMarkerDirectoryForFile(file, projectDirectory, TFLINT_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("tflint", workspaceDirectory);
    return binary ? buildLaunchConfig(binary, ["--langserver"]) : buildBinaryNotFound("tflint");
  },
};
