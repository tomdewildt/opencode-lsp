import { CallHierarchyOutgoingCallsRequest } from "vscode-languageserver-protocol";
import { findCallHierarchyItem, type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const outgoingCalls: ToolDefinition = {
  name: "lsp_outgoing_calls",
  capability: "callHierarchyProvider",
  description: "Find all functions and methods called by the function at a position.",
  input: POSITION_INPUT,
  position: true,
  request: async (client, target) => {
    const item = await findCallHierarchyItem(client, target);
    return item ? client.sendRequest(CallHierarchyOutgoingCallsRequest.type, { item }) : [];
  },
};
