import { getMarkerDirectoryForFileOrDefault } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const PYRIGHT_EXTENSIONS = [".py", ".pyi"];
const PYRIGHT_WORKSPACE_FILES = [
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
  "pyrightconfig.json",
];

export const pyright: ServerDefinition = {
  id: "pyright",
  extensions: PYRIGHT_EXTENSIONS,
  findWorkspaceDirectory: (file, projectDirectory) =>
    getMarkerDirectoryForFileOrDefault(file, projectDirectory, PYRIGHT_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("pyright-langserver", workspaceDirectory);
    return binary ? buildLaunchConfig(binary, ["--stdio"]) : buildBinaryNotFound("pyright-langserver");
  },
};
