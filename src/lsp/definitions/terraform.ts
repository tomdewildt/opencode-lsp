import { getMarkerDirectoryForFileOrDefault } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const TERRAFORM_EXTENSIONS = [".tf", ".tfvars"];
const TERRAFORM_WORKSPACE_FILES = [".terraform.lock.hcl", "terraform.tfstate", "*.tf"];

export const terraform: ServerDefinition = {
  id: "terraform",
  extensions: TERRAFORM_EXTENSIONS,
  findWorkspaceDirectory: (file, projectDirectory) =>
    getMarkerDirectoryForFileOrDefault(file, projectDirectory, TERRAFORM_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("terraform-ls", workspaceDirectory);
    return binary ? buildLaunchConfig(binary, ["serve"]) : buildBinaryNotFound("terraform-ls");
  },
};
