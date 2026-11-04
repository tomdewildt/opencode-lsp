import { CallHierarchyIncomingCallsRequest, CallHierarchyPrepareRequest } from "vscode-languageserver-protocol";
import { type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const incomingCalls: ToolDefinition = {
  name: "lsp_incoming_calls",
  capability: "callHierarchyProvider",
  description: "Find all functions and methods that call the function at a position.",
  input: POSITION_INPUT,
  position: true,
  request: async (client, { textDocument, position }) => {
    const callHierarchyItems = await client.sendRequest(CallHierarchyPrepareRequest.type, { textDocument, position });
    const callHierarchyItem = callHierarchyItems?.[0];
    return callHierarchyItem
      ? client.sendRequest(CallHierarchyIncomingCallsRequest.type, { item: callHierarchyItem })
      : [];
  },
};
