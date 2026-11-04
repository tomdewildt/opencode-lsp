import type { Plugin } from "@opencode/plugin";
import type { LspManager } from "../lsp/manager.ts";
import type { Options } from "../options.ts";
import { registerEditHook } from "./definitions/edit.ts";
import { registerReadHook } from "./definitions/read.ts";

export interface HookDefinition {
  name: string;
  register: (
    toolApi: Plugin.Context["tool"],
    manager: LspManager,
    projectDirectory: string,
    options: Options,
  ) => ReturnType<Plugin.Context["tool"]["hook"]>;
}

export const DEFAULT_HOOK_DEFINITIONS: readonly HookDefinition[] = [
  { name: "edit", register: registerEditHook },
  { name: "read", register: registerReadHook },
];

export function getHookDefinitions(defaultDefinitions: readonly HookDefinition[], options: Options): HookDefinition[] {
  return defaultDefinitions.filter((hookDefinition) => !options.hooks[hookDefinition.name]?.disabled);
}
