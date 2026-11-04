import { describe, expect, it } from "bun:test";
import { buildToolResultContent, getFilesEditedByToolCall } from "../../src/hooks/adapter.ts";

describe("getFilesEditedByToolCall", () => {
  it("resolves the edit path against the project", () => {
    // Act
    const editedFiles = getFilesEditedByToolCall("edit", { path: "src/a.ts" }, {}, "/project");

    // Assert
    expect(editedFiles).toEqual(["/project/src/a.ts"]);
  });

  it("uses the write target", () => {
    // Act
    const editedFiles = getFilesEditedByToolCall("write", { path: "a.ts" }, { target: "/project/b.ts" }, "/project");

    // Assert
    expect(editedFiles).toEqual(["/project/b.ts"]);
  });

  it("skips deleted files when a patch is applied", () => {
    // Arrange
    const output = {
      applied: [
        { type: "add", target: "/project/a.ts" },
        { type: "delete", target: "/project/b.ts" },
        { type: "update", target: "/project/c.ts" },
      ],
    };

    // Act
    const editedFiles = getFilesEditedByToolCall("patch", {}, output, "/project");

    // Assert
    expect(editedFiles).toEqual(["/project/a.ts", "/project/c.ts"]);
  });

  it("returns nothing when the tool does not change files", () => {
    // Act
    const editedFiles = getFilesEditedByToolCall("grep", { path: "a.ts" }, {}, "/project");

    // Assert
    expect(editedFiles).toEqual([]);
  });
});

describe("buildToolResultContent", () => {
  it("appends to string content", () => {
    // Act
    const toolResultContent = buildToolResultContent("Edited a.ts", "\n\nmore");

    // Assert
    expect(toolResultContent).toBe("Edited a.ts\n\nmore");
  });

  it("adds a text part when the content is a list", () => {
    // Act
    const toolResultContent = buildToolResultContent([{ type: "text", text: "a" }], "b");

    // Assert
    expect(toolResultContent).toEqual([
      { type: "text", text: "a" },
      { type: "text", text: "b" },
    ]);
  });

  it("leaves the content alone when there is nothing to add", () => {
    // Act
    const toolResultContent = buildToolResultContent("Edited a.ts", "");

    // Assert
    expect(toolResultContent).toBe("Edited a.ts");
  });
});
