import { ReferencesRequest } from "vscode-languageserver-protocol";
import { type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const references: ToolDefinition = {
  name: "lsp_references",
  capability: "referencesProvider",
  description: "Find all references to the symbol at a position, including its declaration.",
  input: POSITION_INPUT,
  position: true,
  request: (client, { textDocument, position }) =>
    client.sendRequest(ReferencesRequest.type, { textDocument, position, context: { includeDeclaration: true } }),
};
