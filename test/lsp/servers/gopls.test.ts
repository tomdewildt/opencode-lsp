import { describe, expect, it } from "bun:test";
import path from "node:path";
import { gopls } from "../../../src/lsp/definitions/gopls.ts";
import { createFakeProject } from "../../fixtures/project.ts";

describe("gopls", () => {
  it("prefers go.work over go.mod as the workspace directory", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({ "go.work": "", "service/go.mod": "", "service/main.go": "" });

    // Act
    const workspaceDirectory = await gopls.findWorkspaceDirectory(
      path.join(projectDirectory, "service/main.go"),
      projectDirectory,
    );

    // Assert
    expect(workspaceDirectory).toBe(projectDirectory);
  });

  it("uses the module directory without a go.work", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({ "service/go.mod": "", "service/main.go": "" });

    // Act
    const workspaceDirectory = await gopls.findWorkspaceDirectory(
      path.join(projectDirectory, "service/main.go"),
      projectDirectory,
    );

    // Assert
    expect(workspaceDirectory).toBe(path.join(projectDirectory, "service"));
  });
});
