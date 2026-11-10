import { Plugin } from "@opencode/plugin";
import { DEFAULT_HOOK_DEFINITIONS, getHookDefinitions } from "./hooks/registry.ts";
import { LspManager } from "./lsp/manager.ts";
import { DEFAULT_SERVER_DEFINITIONS, getServerDefinitions } from "./lsp/registry.ts";
import { parseOptions } from "./options.ts";
import { LspRpc } from "./rpc.ts";
import { PLUGIN_ID } from "./shared.ts";
import { buildTools } from "./tools/builder.ts";
import { DEFAULT_TOOL_DEFINITIONS, getToolDefinitions } from "./tools/registry.ts";

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    const options = parseOptions(ctx.options);
    const projectDirectory = ctx.location.directory;

    if (!options.enabled) {
      const rpcRegistration = await ctx.rpc.register(LspRpc, {
        snapshot: async () => ({ enabled: false, servers: [] }),
      });
      return () => rpcRegistration.dispose();
    }

    const manager = new LspManager(
      getServerDefinitions(DEFAULT_SERVER_DEFINITIONS, options),
      projectDirectory,
      options,
    );

    const rpcRegistration = await ctx.rpc.register(LspRpc, {
      snapshot: async () => manager.getPluginSnapshot(),
    });
    manager.addServerChangeListener(
      () => void rpcRegistration.events.emit("updated", manager.getPluginSnapshot()).catch(() => undefined),
    );

    const hookRegistrations = await Promise.all(
      getHookDefinitions(DEFAULT_HOOK_DEFINITIONS, options).map((hookDefinition) =>
        hookDefinition.register(ctx.tool, manager, projectDirectory, options),
      ),
    );

    const toolDefinitions = getToolDefinitions(DEFAULT_TOOL_DEFINITIONS, options);
    const tools = buildTools(toolDefinitions, manager, projectDirectory, ctx.permission);
    const toolsRegistration = await ctx.tool.transform((toolEditor) => {
      for (const tool of tools) {
        toolEditor.add(tool);
      }
    });

    return async () => {
      await Promise.all(hookRegistrations.map((hookRegistration) => hookRegistration.dispose()));
      await toolsRegistration.dispose();
      await manager.dispose();
      await rpcRegistration.dispose();
    };
  },
});
