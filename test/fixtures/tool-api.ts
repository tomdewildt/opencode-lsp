import type { Plugin } from "@opencode/plugin";

interface FakeToolCallEvent {
  status: string;
  tool: string;
  input: unknown;
  result: { output: unknown; content: string };
}

export function buildFakeToolApi() {
  let registeredHook: ((event: FakeToolCallEvent) => Promise<void> | void) | undefined;
  const toolApi = {
    hook: async (_name: string, handler: (event: FakeToolCallEvent) => Promise<void> | void) => {
      registeredHook = handler;
      return { dispose: async () => undefined };
    },
  } as unknown as Plugin.Context["tool"];

  const runHook = async (event: Omit<FakeToolCallEvent, "status">): Promise<string> => {
    const toolCallEvent = { status: "completed", ...event };
    await registeredHook!(toolCallEvent);
    return toolCallEvent.result.content;
  };

  return { toolApi, runHook };
}
