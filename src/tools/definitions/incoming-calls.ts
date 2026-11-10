import { CallHierarchyIncomingCallsRequest } from "vscode-languageserver-protocol";
import { findCallHierarchyItem, type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const incomingCalls: ToolDefinition = {
  name: "lsp_incoming_calls",
  capability: "callHierarchyProvider",
  description: "Find all functions and methods that call the function at a position.",
  input: POSITION_INPUT,
  position: true,
  request: async (client, target) => {
    const item = await findCallHierarchyItem(client, target);
    return item ? client.sendRequest(CallHierarchyIncomingCallsRequest.type, { item }) : [];
  },
};
