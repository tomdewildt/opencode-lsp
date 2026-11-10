import type { Options, ServerOverride } from "../options.ts";
import { ansible } from "./definitions/ansible.ts";
import { clojureLsp } from "./definitions/clojure.ts";
import { eslint } from "./definitions/eslint.ts";
import { gopls } from "./definitions/gopls.ts";
import { oxlint } from "./definitions/oxlint.ts";
import { pyright } from "./definitions/pyright.ts";
import { ruff } from "./definitions/ruff.ts";
import { rust } from "./definitions/rust.ts";
import type { LaunchConfig, ServerDefinition } from "./definitions/server.ts";
import { terraform } from "./definitions/terraform.ts";
import { tflint } from "./definitions/tflint.ts";
import { ty } from "./definitions/ty.ts";
import { typescript } from "./definitions/typescript.ts";

export const DEFAULT_SERVER_DEFINITIONS: readonly ServerDefinition[] = [
  ansible,
  clojureLsp,
  eslint,
  gopls,
  oxlint,
  pyright,
  ruff,
  rust,
  terraform,
  tflint,
  ty,
  typescript,
];

function buildOverriddenLaunchConfig(command: string[], override: ServerOverride): LaunchConfig {
  return { command, env: override.env, initialization: override.options };
}

function buildCustomServerDefinition(id: string, override: ServerOverride, command: string[]): ServerDefinition {
  return {
    id,
    extensions: override.extensions ?? [],
    findWorkspaceDirectory: async (_file, projectDirectory) => projectDirectory,
    findLaunchConfig: async () => buildOverriddenLaunchConfig(command, override),
  };
}

function buildOverriddenServerDefinition(
  defaultDefinition: ServerDefinition,
  override: ServerOverride,
): ServerDefinition {
  return {
    ...defaultDefinition,
    extensions: override.extensions ?? defaultDefinition.extensions,
    findLaunchConfig: async (workspaceDirectory, projectDirectory) => {
      if (override.command) {
        return buildOverriddenLaunchConfig(override.command, override);
      }

      const launchConfig = await defaultDefinition.findLaunchConfig(workspaceDirectory, projectDirectory);
      if ("reason" in launchConfig) {
        return launchConfig;
      }

      return {
        ...launchConfig,
        env: { ...launchConfig.env, ...override.env },
        initialization: { ...launchConfig.initialization, ...override.options },
      };
    },
  };
}

export function getServerDefinitions(
  defaultDefinitions: readonly ServerDefinition[],
  options: Options,
): ServerDefinition[] {
  const serverOverrides = options.servers;
  const isDefinitionEnabled = (definition: ServerDefinition) => {
    const serverOverride = serverOverrides[definition.id];
    return serverOverride ? !serverOverride.disabled : !definition.disabledByDefault;
  };

  const enabledDefaultDefinitions = defaultDefinitions.filter(isDefinitionEnabled);
  const replacedServerIDs = new Set(
    enabledDefaultDefinitions.flatMap((definition) => definition.replacesServerIDs ?? []),
  );
  const activeDefaultDefinitions = enabledDefaultDefinitions
    .filter((definition) => !replacedServerIDs.has(definition.id))
    .map((definition) => {
      const serverOverride = serverOverrides[definition.id];
      return serverOverride ? buildOverriddenServerDefinition(definition, serverOverride) : definition;
    });

  const defaultServerIDs = new Set(defaultDefinitions.map((definition) => definition.id));
  const customDefinitions = Object.entries(serverOverrides).flatMap(([id, serverOverride]) =>
    !defaultServerIDs.has(id) && !serverOverride.disabled && serverOverride.command
      ? [buildCustomServerDefinition(id, serverOverride, serverOverride.command)]
      : [],
  );

  return [...activeDefaultDefinitions, ...customDefinitions];
}
