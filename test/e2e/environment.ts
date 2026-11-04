import path from "node:path";

export const E2E_DIRECTORY = path.resolve(import.meta.dir, "..", "..", ".e2e");
export const E2E_BIN_DIRECTORIES = [
  path.join(E2E_DIRECTORY, "bin"),
  path.join(E2E_DIRECTORY, "node_modules", ".bin"),
  path.join(E2E_DIRECTORY, "venv", "bin"),
];
export const E2E_NODE_MODULES = path.join(E2E_DIRECTORY, "node_modules");
export const E2E_LEGACY_NODE_MODULES = path.join(E2E_DIRECTORY, "legacy", "node_modules");
