import { cp, mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_SERVER_DEFINITIONS, getServerDefinitions } from "../../../src/lsp/registry.ts";
import { parseOptions } from "../../../src/options.ts";
import type { TestCase } from "../servers.test.ts";

const FILES_DIRECTORY = path.join(import.meta.dir, "files");

export async function createFakeProject(testCase: TestCase) {
  const projectDirectory = await realpath(await mkdtemp(path.join(tmpdir(), `opencode-lsp-e2e-${testCase.testName}-`)));
  await cp(path.join(FILES_DIRECTORY, testCase.fixtureName ?? testCase.testName), projectDirectory, {
    recursive: true,
  });

  if (testCase.nodeModulesDirectory) {
    await symlink(testCase.nodeModulesDirectory, path.join(projectDirectory, "node_modules"));
  }

  const options = parseOptions(testCase.pluginOptions ?? {});
  const definition = getServerDefinitions(DEFAULT_SERVER_DEFINITIONS, options).find(
    ({ id }) => id === testCase.serverID,
  )!;

  const file = path.join(projectDirectory, testCase.filePath);
  const workspaceDirectory = await definition.findWorkspaceDirectory(file, projectDirectory);
  const launchConfig = workspaceDirectory
    ? await definition.findLaunchConfig(workspaceDirectory, projectDirectory)
    : { reason: "no workspace directory" };
  const unavailableReason = "reason" in launchConfig ? launchConfig.reason : undefined;

  return { testCase, projectDirectory, definition, file, unavailableReason };
}
