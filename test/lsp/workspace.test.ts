import { beforeAll, describe, expect, it } from "bun:test";
import path from "node:path";
import { createFakeProject } from "../fixtures/project.ts";
import { findMarkerDirectoryForFile, getMarkerDirectoryForFileOrDefault } from "../../src/lsp/workspace.ts";

let projectDirectory = "";

beforeAll(async () => {
  projectDirectory = await createFakeProject({
    "packages/web/package-lock.json": "",
    "packages/web/src/app.ts": "",
    "deno/deno.json": "",
    "deno/main.ts": "",
    "swift/App.xcodeproj/project.pbxproj": "",
    "swift/Sources/main.swift": "",
  });
});

describe("getMarkerDirectoryForFileOrDefault", () => {
  it("returns the nearest directory with a marker", async () => {
    // Arrange
    const file = path.join(projectDirectory, "packages/web/src/app.ts");

    // Act
    const workspaceDirectory = await getMarkerDirectoryForFileOrDefault(file, projectDirectory, ["package-lock.json"]);

    // Assert
    expect(workspaceDirectory).toBe(path.join(projectDirectory, "packages/web"));
  });

  it("falls back to the project directory when no marker exists", async () => {
    // Arrange
    const file = path.join(projectDirectory, "deno/main.ts");

    // Act
    const workspaceDirectory = await getMarkerDirectoryForFileOrDefault(file, projectDirectory, ["Gemfile"]);

    // Assert
    expect(workspaceDirectory).toBe(projectDirectory);
  });

  it("matches glob markers", async () => {
    // Arrange
    const file = path.join(projectDirectory, "swift/Sources/main.swift");

    // Act
    const workspaceDirectory = await getMarkerDirectoryForFileOrDefault(file, projectDirectory, ["*.xcodeproj"]);

    // Assert
    expect(workspaceDirectory).toBe(path.join(projectDirectory, "swift"));
  });
});

describe("findMarkerDirectoryForFile", () => {
  it("returns undefined when no marker exists", async () => {
    // Arrange
    const file = path.join(projectDirectory, "deno/main.ts");

    // Act
    const workspaceDirectory = await findMarkerDirectoryForFile(file, projectDirectory, ["Gemfile"]);

    // Assert
    expect(workspaceDirectory).toBeUndefined();
  });
});
