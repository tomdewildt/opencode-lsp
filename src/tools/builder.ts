import type { Plugin } from "@opencode/plugin";
import type { LspManager } from "../lsp/manager.ts";
import type { ToolDefinition } from "./definitions/tool.ts";
import { executeTool } from "./executor.ts";

// The plugin package does not export its tool types, so they are derived from `ctx.tool.transform`.
type ToolEditor = Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0];
export type OpencodeTool = Parameters<ToolEditor["add"]>[0];

const POSITION_INPUT_DESCRIPTION =
  "Pass either `line` and `character` (1-based, as shown in editors) or `symbol` to look the symbol up by name.";
const UNSUPPORTED_FILE_DESCRIPTION = "An error is returned when no language server handles the file type.";

export function buildTools(
  toolDefinitions: readonly ToolDefinition[],
  manager: LspManager,
  projectDirectory: string,
  permission: Plugin.Context["permission"],
): OpencodeTool[] {
  return toolDefinitions.map((toolDefinition) => {
    const descriptionParts = [
      toolDefinition.description,
      ...(toolDefinition.position ? [POSITION_INPUT_DESCRIPTION] : []),
      UNSUPPORTED_FILE_DESCRIPTION,
    ];

    return {
      name: toolDefinition.name,
      description: descriptionParts.join(" "),
      input: toolDefinition.input,
      options: { codemode: false, permission: "lsp" },
      execute: (rawInput, context) =>
        executeTool(toolDefinition, rawInput, context, manager, projectDirectory, permission),
    };
  });
}
