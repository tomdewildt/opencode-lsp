import { SymbolKind, WorkspaceSymbolRequest } from "vscode-languageserver-protocol";
import type { WorkspaceSymbolResult } from "../symbols.ts";
import { type ToolDefinition, WORKSPACE_INPUT } from "./tool.ts";

const WORKSPACE_SYMBOL_LIMIT = 10;
const WORKSPACE_SYMBOL_KINDS: readonly SymbolKind[] = [
  SymbolKind.Class,
  SymbolKind.Method,
  SymbolKind.Enum,
  SymbolKind.Interface,
  SymbolKind.Function,
  SymbolKind.Variable,
  SymbolKind.Constant,
  SymbolKind.Struct,
];

export const workspaceSymbols: ToolDefinition = {
  name: "lsp_workspace_symbols",
  capability: "workspaceSymbolProvider",
  description: "List project-wide symbols (classes, functions, methods, variables) matching a query.",
  input: WORKSPACE_INPUT,
  workspace: true,
  request: async (client, { query }) => {
    const symbols: WorkspaceSymbolResult[] = (await client.sendRequest(WorkspaceSymbolRequest.type, { query })) ?? [];
    return symbols.filter((symbol) => WORKSPACE_SYMBOL_KINDS.includes(symbol.kind)).slice(0, WORKSPACE_SYMBOL_LIMIT);
  },
};
