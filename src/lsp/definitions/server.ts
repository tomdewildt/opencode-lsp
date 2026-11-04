import path from "node:path";
import { findMarkerDirectory } from "../workspace.ts";

export interface LaunchConfig {
  command: string[];
  languageId?: string;
  env?: Record<string, string>;
  initialization?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface ServerUnavailable {
  reason: string;
}

export interface ServerDefinition {
  id: string;
  extensions: readonly string[];
  disabledByDefault?: boolean;
  replacesServerIDs?: readonly string[];
  findWorkspaceDirectory(file: string, projectDirectory: string): Promise<string | undefined>;
  findLaunchConfig(workspaceDirectory: string, projectDirectory: string): Promise<LaunchConfig | ServerUnavailable>;
}

const IS_WINDOWS = process.platform === "win32";

export function buildBinaryNotFound(binary: string): ServerUnavailable {
  return { reason: `${binary} not found` };
}

export function buildLaunchConfig(
  binary: string,
  args: string[] = [],
  extras: Omit<LaunchConfig, "command"> = {},
): LaunchConfig {
  return { command: [binary, ...args], ...extras };
}

function buildVirtualEnvironmentBinaryPath(environment: string, name: string): string {
  return IS_WINDOWS ? path.join(environment, "Scripts", `${name}.exe`) : path.join(environment, "bin", name);
}

export async function findBinary(name: string, workspaceDirectory: string): Promise<string | undefined> {
  const nodeBinary = await findNodeModule(workspaceDirectory, path.join(".bin", IS_WINDOWS ? `${name}.cmd` : name));
  if (nodeBinary) {
    return nodeBinary;
  }

  const activeEnvironment = process.env.VIRTUAL_ENV;
  const environments = [
    ...(activeEnvironment ? [activeEnvironment] : []),
    path.join(workspaceDirectory, ".venv"),
    path.join(workspaceDirectory, "venv"),
  ];
  for (const environment of environments) {
    const environmentBinary = buildVirtualEnvironmentBinaryPath(environment, name);
    if (await Bun.file(environmentBinary).exists()) {
      return environmentBinary;
    }
  }

  return Bun.which(name, { PATH: process.env.PATH ?? "" }) ?? undefined;
}

export async function findNodeModule(workspaceDirectory: string, file: string): Promise<string | undefined> {
  const nodeModulePath = path.join("node_modules", file);
  const directory = await findMarkerDirectory(workspaceDirectory, path.parse(workspaceDirectory).root, [
    nodeModulePath,
  ]);
  return directory ? path.join(directory, nodeModulePath) : undefined;
}

export function isFileHandledByServerDefinition(file: string, definition: ServerDefinition): boolean {
  const extension = path.extname(file) || path.basename(file);
  return definition.extensions.length === 0 || definition.extensions.includes(extension);
}
