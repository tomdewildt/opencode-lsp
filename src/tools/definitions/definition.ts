import { DefinitionRequest } from "vscode-languageserver-protocol";
import { type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const definition: ToolDefinition = {
  name: "lsp_definition",
  capability: "definitionProvider",
  description: "Find where the symbol at a position is defined.",
  input: POSITION_INPUT,
  position: true,
  request: (client, { textDocument, position }) =>
    client.sendRequest(DefinitionRequest.type, { textDocument, position }),
};
