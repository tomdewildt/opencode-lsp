import type { ServerCapabilities, TextDocumentPositionParams } from "vscode-languageserver-protocol";
import type { LspClient } from "../../lsp/client.ts";
import type { OpencodeTool } from "../builder.ts";

export type ToolRequestTarget = TextDocumentPositionParams & { query: string };

export interface ToolDefinition {
  name: string;
  capability: keyof ServerCapabilities;
  description: string;
  input: OpencodeTool["input"];
  request: (client: LspClient, target: ToolRequestTarget) => Promise<unknown>;
  position?: boolean;
  workspace?: boolean;
}

export const FILE_INPUT = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "The absolute or relative path to the file",
    },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

export const POSITION_INPUT = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description:
        "The file to operate on. With `symbol`, any file in the same project and language, used to pick the language server.",
    },
    line: {
      type: "integer",
      minimum: 1,
      description: "The line number (1-based, as shown in editors)",
    },
    character: {
      type: "integer",
      minimum: 1,
      description: "The character offset (1-based, as shown in editors)",
    },
    symbol: {
      type: "string",
      description:
        "Symbol name instead of line and character, optionally qualified with its container: `SqlBuilder.toCommand`, `pkg.Handler`, `Type::member`.",
    },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

export const WORKSPACE_INPUT = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Any file in the project with the language to search. Used to select and start the language server.",
    },
    query: {
      type: "string",
      description: "Query to filter symbols by. Empty string requests all symbols.",
    },
  },
  required: ["path", "query"],
  additionalProperties: false,
} as const;
