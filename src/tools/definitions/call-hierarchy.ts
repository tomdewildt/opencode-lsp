import { CallHierarchyPrepareRequest } from "vscode-languageserver-protocol";
import { type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const callHierarchy: ToolDefinition = {
  name: "lsp_call_hierarchy",
  capability: "callHierarchyProvider",
  description: "Get the call hierarchy item for the function or method at a position.",
  input: POSITION_INPUT,
  position: true,
  request: (client, { textDocument, position }) =>
    client.sendRequest(CallHierarchyPrepareRequest.type, { textDocument, position }),
};
