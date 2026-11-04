import { ImplementationRequest } from "vscode-languageserver-protocol";
import { type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const implementation: ToolDefinition = {
  name: "lsp_implementation",
  capability: "implementationProvider",
  description: "Find implementations of the interface or abstract method at a position.",
  input: POSITION_INPUT,
  position: true,
  request: (client, { textDocument, position }) =>
    client.sendRequest(ImplementationRequest.type, { textDocument, position }),
};
