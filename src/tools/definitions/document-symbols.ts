import { DocumentSymbolRequest } from "vscode-languageserver-protocol";
import { FILE_INPUT, type ToolDefinition } from "./tool.ts";

export const documentSymbols: ToolDefinition = {
  name: "lsp_document_symbols",
  capability: "documentSymbolProvider",
  description: "List all symbols (functions, classes, variables) in a file.",
  input: FILE_INPUT,
  request: (client, { textDocument }) => client.sendRequest(DocumentSymbolRequest.type, { textDocument }),
};
