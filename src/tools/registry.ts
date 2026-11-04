import type { Options } from "../options.ts";
import { callHierarchy } from "./definitions/call-hierarchy.ts";
import { definition } from "./definitions/definition.ts";
import { documentSymbols } from "./definitions/document-symbols.ts";
import { hover } from "./definitions/hover.ts";
import { implementation } from "./definitions/implementation.ts";
import { incomingCalls } from "./definitions/incoming-calls.ts";
import { outgoingCalls } from "./definitions/outgoing-calls.ts";
import { references } from "./definitions/references.ts";
import type { ToolDefinition } from "./definitions/tool.ts";
import { workspaceSymbols } from "./definitions/workspace-symbols.ts";

export const DEFAULT_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  definition,
  references,
  hover,
  implementation,
  documentSymbols,
  workspaceSymbols,
  callHierarchy,
  incomingCalls,
  outgoingCalls,
];

export function getToolDefinitions(defaultDefinitions: readonly ToolDefinition[], options: Options): ToolDefinition[] {
  return defaultDefinitions.filter((toolDefinition) => !options.tools[toolDefinition.name]?.disabled);
}
