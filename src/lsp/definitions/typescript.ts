import path from "node:path";
import { getMarkerDirectoryForFileOrDefault } from "../workspace.ts";
import { buildBinaryNotFound, buildLaunchConfig, findBinary, findNodeModule, type ServerDefinition } from "./server.ts";

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const TYPESCRIPT_WORKSPACE_FILES = ["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"];

export const typescript: ServerDefinition = {
  id: "typescript",
  extensions: TYPESCRIPT_EXTENSIONS,
  findWorkspaceDirectory: (file, projectDirectory) =>
    getMarkerDirectoryForFileOrDefault(file, projectDirectory, TYPESCRIPT_WORKSPACE_FILES),
  async findLaunchConfig(workspaceDirectory) {
    const manifest = await findNodeModule(workspaceDirectory, path.join("typescript", "package.json"));
    if (!manifest) {
      return { reason: "typescript not installed in project" };
    }

    // TypeScript 7 is the native compiler: it ships its own language server and no tsserver.js.
    const { version } = (await Bun.file(manifest).json()) as { version?: string };
    if (Number.parseInt(version ?? "", 10) >= 7) {
      return buildLaunchConfig(path.join(path.dirname(manifest), "bin", "tsc"), ["--lsp", "--stdio"]);
    }

    const tsserver = path.join(path.dirname(manifest), "lib", "tsserver.js");
    if (!(await Bun.file(tsserver).exists())) {
      return { reason: "typescript not installed in project" };
    }

    const binary = await findBinary("typescript-language-server", workspaceDirectory);
    return binary
      ? buildLaunchConfig(binary, ["--stdio"], { initialization: { tsserver: { path: tsserver } } })
      : buildBinaryNotFound("typescript-language-server");
  },
};
