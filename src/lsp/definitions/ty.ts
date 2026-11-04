import { getMarkerDirectoryForFileOrDefault } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const TY_EXTENSIONS = [".py", ".pyi"];
const TY_WORKSPACE_FILES = [
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
  "pyrightconfig.json",
  "ty.toml",
];

export const ty: ServerDefinition = {
  id: "ty",
  extensions: TY_EXTENSIONS,
  disabledByDefault: true,
  replacesServerIDs: ["pyright"],
  findWorkspaceDirectory: (file, projectDirectory) =>
    getMarkerDirectoryForFileOrDefault(file, projectDirectory, TY_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("ty", workspaceDirectory);
    return binary ? buildLaunchConfig(binary, ["server"]) : buildBinaryNotFound("ty");
  },
};
