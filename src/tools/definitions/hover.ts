import { HoverRequest } from "vscode-languageserver-protocol";
import { type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const hover: ToolDefinition = {
  name: "lsp_hover",
  capability: "hoverProvider",
  description: "Get hover information (documentation, type info) for the symbol at a position.",
  input: POSITION_INPUT,
  position: true,
  request: (client, { textDocument, position }) => client.sendRequest(HoverRequest.type, { textDocument, position }),
};
