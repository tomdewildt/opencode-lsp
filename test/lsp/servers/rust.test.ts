import { describe, expect, it } from "bun:test";
import path from "node:path";
import { rust } from "../../../src/lsp/definitions/rust.ts";
import { createFakeProject } from "../../fixtures/project.ts";

describe("rust", () => {
  it("uses the cargo workspace as the workspace directory", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({
      "Cargo.toml": '[workspace]\nmembers = ["crate"]\n',
      "crate/Cargo.toml": '[package]\nname = "crate"\n',
      "crate/src/lib.rs": "",
    });

    // Act
    const workspaceDirectory = await rust.findWorkspaceDirectory(
      path.join(projectDirectory, "crate/src/lib.rs"),
      projectDirectory,
    );

    // Assert
    expect(workspaceDirectory).toBe(projectDirectory);
  });

  it("uses the crate directory outside a workspace", async () => {
    // Arrange
    const projectDirectory = await createFakeProject({
      "crate/Cargo.toml": '[package]\nname = "crate"\n',
      "crate/src/lib.rs": "",
    });

    // Act
    const workspaceDirectory = await rust.findWorkspaceDirectory(
      path.join(projectDirectory, "crate/src/lib.rs"),
      projectDirectory,
    );

    // Assert
    expect(workspaceDirectory).toBe(path.join(projectDirectory, "crate"));
  });
});
