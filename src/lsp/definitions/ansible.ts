import { findMarkerDirectoryForFile } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const ANSIBLE_EXTENSIONS = [".yml", ".yaml"];
const ANSIBLE_WORKSPACE_FILES = ["ansible.cfg", "galaxy.yml"];

export const ansible: ServerDefinition = {
  id: "ansible",
  extensions: ANSIBLE_EXTENSIONS,
  // Every .yml file is a candidate, so the server only starts for files inside a directory with an ansible.cfg or
  // galaxy.yml. Other YAML, like docker-compose files or CI workflows, does not start it.
  findWorkspaceDirectory: (file, projectDirectory) =>
    findMarkerDirectoryForFile(file, projectDirectory, ANSIBLE_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("ansible-language-server", workspaceDirectory);
    return binary
      ? buildLaunchConfig(binary, ["--stdio"], { languageId: "ansible" })
      : buildBinaryNotFound("ansible-language-server");
  },
};
