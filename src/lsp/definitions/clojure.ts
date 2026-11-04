import { getMarkerDirectoryForFileOrDefault } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, type ServerDefinition } from "./server.ts";

const CLOJURE_LSP_EXTENSIONS = [".clj", ".cljs", ".cljc", ".edn"];
const CLOJURE_LSP_WORKSPACE_FILES = ["deps.edn", "project.clj", "shadow-cljs.edn", "bb.edn", "build.boot"];

export const clojureLsp: ServerDefinition = {
  id: "clojure-lsp",
  extensions: CLOJURE_LSP_EXTENSIONS,
  findWorkspaceDirectory: (file, projectDirectory) =>
    getMarkerDirectoryForFileOrDefault(file, projectDirectory, CLOJURE_LSP_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const binary = await findBinary("clojure-lsp", workspaceDirectory);
    return binary ? buildLaunchConfig(binary, ["listen"]) : buildBinaryNotFound("clojure-lsp");
  },
};
