import { describe, expect, it } from "bun:test";
import { parseOptions } from "../../src/options.ts";
import { DEFAULT_TOOL_DEFINITIONS, getToolDefinitions } from "../../src/tools/registry.ts";

describe("getToolDefinitions", () => {
  it("returns every default tool when none is disabled", () => {
    // Arrange
    const options = parseOptions({});

    // Act
    const toolDefinitions = getToolDefinitions(DEFAULT_TOOL_DEFINITIONS, options);

    // Assert
    expect(toolDefinitions).toEqual([...DEFAULT_TOOL_DEFINITIONS]);
  });

  it("leaves out disabled tools", () => {
    // Arrange
    const options = parseOptions({ tools: { lsp_hover: { disabled: true }, lsp_references: {} } });

    // Act
    const toolNames = getToolDefinitions(DEFAULT_TOOL_DEFINITIONS, options).map((tool) => tool.name);

    // Assert
    expect(toolNames).not.toContain("lsp_hover");
    expect(toolNames).toContain("lsp_references");
    expect(toolNames).toHaveLength(DEFAULT_TOOL_DEFINITIONS.length - 1);
  });
});
