import { DiagnosticSeverity } from "vscode-languageserver-protocol";

export interface ServerOverride {
  disabled?: boolean;
  command?: string[];
  extensions?: string[];
  env?: Record<string, string>;
  options?: Record<string, unknown>;
}

export interface HookOverride {
  disabled?: boolean;
}

export interface ToolOverride {
  disabled?: boolean;
}

export interface Options {
  enabled: boolean;
  severity: DiagnosticSeverity;
  diagnosticsTimeoutMs: number;
  idleTimeoutMs: number;
  servers: Record<string, ServerOverride>;
  hooks: Record<string, HookOverride>;
  tools: Record<string, ToolOverride>;
}

const SEVERITY_BY_NAME: Readonly<Record<string, DiagnosticSeverity>> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};
const DEFAULT_IDLE_TIMEOUT_MS = 600_000;
const DEFAULT_DIAGNOSTICS_TIMEOUT_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function parseNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseServer(value: unknown): ServerOverride | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const server: ServerOverride = {};
  if (value.disabled === true) {
    server.disabled = true;
  }
  if (isStringArray(value.command) && value.command.length > 0) {
    server.command = value.command;
  }
  if (isStringArray(value.extensions)) {
    server.extensions = value.extensions;
  }
  if (isStringRecord(value.env)) {
    server.env = value.env;
  }
  if (isRecord(value.options)) {
    server.options = value.options;
  }

  return server;
}

function parseServers(value: unknown): Record<string, ServerOverride> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([id, entry]) => {
      const server = parseServer(entry);
      return server ? [[id, server]] : [];
    }),
  );
}

export function parseOptions(raw: unknown): Options {
  const options = isRecord(raw) ? raw : {};

  return {
    enabled: options.enabled !== false,
    severity: (typeof options.severity === "string" && SEVERITY_BY_NAME[options.severity]) || DiagnosticSeverity.Error,
    diagnosticsTimeoutMs: parseNonNegativeNumber(options.diagnosticsTimeout, DEFAULT_DIAGNOSTICS_TIMEOUT_MS),
    idleTimeoutMs: parseNonNegativeNumber(options.idleTimeout, DEFAULT_IDLE_TIMEOUT_MS),
    servers: parseServers(options.servers),
    tools: parseDisabledOverrides(options.tools),
    hooks: parseDisabledOverrides(options.hooks),
  };
}

function parseDisabledOverrides(value: unknown): Record<string, HookOverride | ToolOverride> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([name, entry]) =>
      isRecord(entry) ? [[name, entry.disabled === true ? { disabled: true } : {}]] : [],
    ),
  );
}
