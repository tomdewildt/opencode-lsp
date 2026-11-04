import { describe, expect, it } from "bun:test";
import path from "node:path";
import { ansible } from "../../../src/lsp/definitions/ansible.ts";
import { createFakeProject } from "../../fixtures/project.ts";

describe("ansible", () => {
  it("starts inside an ansible project", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({ "infra/ansible.cfg": "", "infra/playbooks/site.yml": "" });

    // Act
    const workspaceDirectory = await ansible.findWorkspaceDirectory(
      path.join(projectDirectory, "infra/playbooks/site.yml"),
      projectDirectory,
    );

    // Assert
    expect(workspaceDirectory).toBe(path.join(projectDirectory, "infra"));
  });

  it("does not start for yaml outside an ansible project", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({ ".github/workflows/ci.yml": "" });

    // Act
    const workspaceDirectory = await ansible.findWorkspaceDirectory(
      path.join(projectDirectory, ".github/workflows/ci.yml"),
      projectDirectory,
    );

    // Assert
    expect(workspaceDirectory).toBeUndefined();
  });
});
