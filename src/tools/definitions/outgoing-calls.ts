import { CallHierarchyOutgoingCallsRequest, CallHierarchyPrepareRequest } from "vscode-languageserver-protocol";
import { type ToolDefinition, POSITION_INPUT } from "./tool.ts";

export const outgoingCalls: ToolDefinition = {
  name: "lsp_outgoing_calls",
  capability: "callHierarchyProvider",
  description: "Find all functions and methods called by the function at a position.",
  input: POSITION_INPUT,
  position: true,
  request: async (client, { textDocument, position }) => {
    const callHierarchyItems = await client.sendRequest(CallHierarchyPrepareRequest.type, { textDocument, position });
    const callHierarchyItem = callHierarchyItems?.[0];
    return callHierarchyItem
      ? client.sendRequest(CallHierarchyOutgoingCallsRequest.type, { item: callHierarchyItem })
      : [];
  },
};
