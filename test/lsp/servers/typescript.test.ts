import { describe, expect, it } from "bun:test";
import path from "node:path";
import { typescript } from "../../../src/lsp/definitions/typescript.ts";
import { createFakeProject } from "../../fixtures/project.ts";

describe("typescript", () => {
  it("uses the native language server of TypeScript 7", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({
      "node_modules/typescript/package.json": JSON.stringify({ version: "7.0.2" }),
    });

    // Act
    const launchConfig = await typescript.findLaunchConfig(projectDirectory, projectDirectory);

    // Assert
    expect(launchConfig).toEqual({
      command: [path.join(projectDirectory, "node_modules/typescript/bin/tsc"), "--lsp", "--stdio"],
    });
  });

  it("reports TypeScript 5 without tsserver as not installed", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({
      "node_modules/typescript/package.json": JSON.stringify({ version: "5.9.3" }),
    });

    // Act
    const launchConfig = await typescript.findLaunchConfig(projectDirectory, projectDirectory);

    // Assert
    expect(launchConfig).toEqual({
      reason: "typescript not installed in project",
    });
  });

  it("reports a project without TypeScript as not installed", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({});

    // Act
    const launchConfig = await typescript.findLaunchConfig(projectDirectory, projectDirectory);

    // Assert
    expect(launchConfig).toEqual({
      reason: "typescript not installed in project",
    });
  });
});
