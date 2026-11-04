import path from "node:path";
import { pathToFileURL } from "node:url";
import { findMarkerDirectoryForFile } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, findNodeModule, type ServerDefinition } from "./server.ts";

const ESLINT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue"];
const ESLINT_WORKSPACE_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
];

// The server asks the client for these settings and stays silent without them; the defaults editors send. The rules
// themselves still come from the project's ESLint config.
function buildEslintClientSettings(workspaceDirectory: string) {
  return {
    validate: "on",
    run: "onType",
    format: false,
    quiet: false,
    onIgnoredFiles: "off",
    rulesCustomizations: [],
    problems: { shortenToSingleLine: false },
    nodePath: "",
    useFlatConfig: true,
    experimental: {},
    codeAction: {
      disableRuleComment: { enable: true, location: "separateLine" },
      showDocumentation: { enable: true },
    },
    codeActionOnSave: { enable: false, mode: "all" },
    workingDirectory: { mode: "location" },
    workspaceFolder: { uri: pathToFileURL(workspaceDirectory).href, name: path.basename(workspaceDirectory) },
  };
}

export const eslint: ServerDefinition = {
  id: "eslint",
  extensions: ESLINT_EXTENSIONS,
  findWorkspaceDirectory: (file, projectDirectory) =>
    findMarkerDirectoryForFile(file, projectDirectory, ESLINT_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    if (!(await findNodeModule(workspaceDirectory, path.join("eslint", "package.json")))) {
      return { reason: "eslint not installed in project" };
    }

    const binary = await findBinary("vscode-eslint-language-server", workspaceDirectory);
    return binary
      ? buildLaunchConfig(binary, ["--stdio"], { settings: buildEslintClientSettings(workspaceDirectory) })
      : buildBinaryNotFound("vscode-eslint-language-server");
  },
};
