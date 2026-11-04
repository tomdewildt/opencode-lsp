import { Rpc } from "@opencode/plugin/rpc";
import { PLUGIN_ID } from "./shared.ts";

const EMPTY_OBJECT_SCHEMA = { type: "object", additionalProperties: false } as const;

export const LspRpc = Rpc.define({
  id: PLUGIN_ID,
  methods: {
    snapshot: {
      input: EMPTY_OBJECT_SCHEMA,
      output: { type: "object" },
    },
  },
  events: {
    updated: { schema: { type: "object" } },
  },
});
