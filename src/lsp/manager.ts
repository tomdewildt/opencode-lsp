import path from "node:path";
import type { Diagnostic } from "vscode-languageserver-protocol";
import type { Options } from "../options.ts";
import type { PluginSnapshot, ServerState } from "../shared.ts";
import { deduplicateDiagnostics, LspClient } from "./client.ts";
import { type ServerDefinition, isFileHandledByServerDefinition } from "./definitions/server.ts";

export interface Server {
  serverID: string;
  workspaceDirectory: string;

  state: ServerState;
  reason?: string;

  client?: LspClient;
  clientStartup?: Promise<void>;
  crashCount: number;
  lastUsedAt: number;
}

export interface SyncFileToServersResult {
  failures: { serverID: string; reason: string }[];
}

const IDLE_CHECK_INTERVAL_MS = 60_000;
const MAX_SERVER_RESTARTS_AFTER_CRASH = 3;

export class LspManager {
  readonly #serverDefinitions: readonly ServerDefinition[];
  readonly #projectDirectory: string;

  readonly #serversByKey = new Map<string, Server>();
  readonly #serverChangeListeners = new Set<() => void>();

  readonly #diagnosticsTimeoutMs: number;

  readonly #idleTimeoutMs: number;
  readonly #idleCheckTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    serverDefinitions: readonly ServerDefinition[],
    projectDirectory: string,
    options: Pick<Options, "idleTimeoutMs" | "diagnosticsTimeoutMs">,
  ) {
    this.#serverDefinitions = serverDefinitions;
    this.#projectDirectory = projectDirectory;

    this.#diagnosticsTimeoutMs = options.diagnosticsTimeoutMs;

    this.#idleTimeoutMs = options.idleTimeoutMs;
    if (this.#idleTimeoutMs > 0) {
      this.#idleCheckTimer = setInterval(() => void this.#stopIdleServers(), IDLE_CHECK_INTERVAL_MS);
    } else {
      this.#idleCheckTimer = undefined;
    }
  }

  getDiagnostics(): Map<string, Diagnostic[]> {
    const diagnosticsByFile = new Map<string, Diagnostic[]>();

    for (const client of this.getConnectedClients()) {
      for (const [file, diagnostics] of client.getDiagnostics()) {
        diagnosticsByFile.set(file, [...(diagnosticsByFile.get(file) ?? []), ...diagnostics]);
      }
    }

    return new Map([...diagnosticsByFile].map(([file, diagnostics]) => [file, deduplicateDiagnostics(diagnostics)]));
  }

  getDiagnosticsForFile(file: string): Diagnostic[] {
    return deduplicateDiagnostics(this.getConnectedClients().flatMap((client) => client.getDiagnosticsForFile(file)));
  }

  async getServersForFile(file: string): Promise<readonly Server[]> {
    if (!this.#isFileInsideProjectDirectory(file)) {
      return [];
    }

    const servers = await Promise.all(
      this.#serverDefinitions
        .filter((definition) => isFileHandledByServerDefinition(file, definition))
        .map(async (definition) => {
          const workspaceDirectory = await definition.findWorkspaceDirectory(file, this.#projectDirectory);
          return workspaceDirectory ? this.#getOrStartServer(definition, workspaceDirectory) : undefined;
        }),
    );
    return servers.filter((server) => server !== undefined);
  }

  getConnectedClients(): LspClient[] {
    return [...this.#serversByKey.values()].flatMap((server) => server.client ?? []);
  }

  getPluginSnapshot(): PluginSnapshot {
    return {
      enabled: true,
      servers: [...this.#serversByKey.values()]
        .map((server) => ({
          id: server.serverID,
          workspaceDirectory: path.relative(this.#projectDirectory, server.workspaceDirectory) || ".",
          state: server.state,
          ...(server.reason ? { reason: server.reason } : {}),
        }))
        .toSorted(
          (first, second) =>
            first.id.localeCompare(second.id) || first.workspaceDirectory.localeCompare(second.workspaceDirectory),
        ),
    };
  }

  addServerChangeListener(listener: () => void): void {
    this.#serverChangeListeners.add(listener);
  }

  removeServerChangeListener(listener: () => void): void {
    this.#serverChangeListeners.delete(listener);
  }

  async syncFileToServers(file: string, waitForDiagnostics: boolean): Promise<SyncFileToServersResult> {
    const servers = await this.getServersForFile(file);
    const clients = servers.flatMap((server) => server.client ?? []);

    // A sync that throws is usually a crash, which is picked up below through the server's error state.
    const syncedClients = await Promise.all(
      clients.map(async (client) => ({
        client,
        areDiagnosticsComplete: await client.syncFile(file, waitForDiagnostics).catch(() => true),
      })),
    );

    const timeoutFailures = syncedClients
      .filter(({ areDiagnosticsComplete }) => !areDiagnosticsComplete)
      .map(({ client }) => ({
        serverID: client.serverID,
        reason: `did not respond within ${this.#diagnosticsTimeoutMs / 1000}s`,
      }));
    const serverFailures = servers
      .filter((server) => server.state === "error")
      .map((server) => ({ serverID: server.serverID, reason: server.reason ?? "error" }));

    return { failures: [...timeoutFailures, ...serverFailures] };
  }

  async dispose(): Promise<void> {
    clearInterval(this.#idleCheckTimer);

    this.#serverChangeListeners.clear();

    await Promise.all(this.getConnectedClients().map((client) => client.dispose()));

    this.#serversByKey.clear();
  }

  #isFileInsideProjectDirectory(file: string): boolean {
    const relativePath = path.relative(this.#projectDirectory, file);
    return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  }

  async #getOrStartServer(definition: ServerDefinition, workspaceDirectory: string): Promise<Server> {
    const serverKey = `${definition.id}\0${workspaceDirectory}`;
    const server: Server = this.#serversByKey.get(serverKey) ?? {
      serverID: definition.id,
      workspaceDirectory,
      state: "idle",
      crashCount: 0,
      lastUsedAt: Date.now(),
    };
    this.#serversByKey.set(serverKey, server);
    server.lastUsedAt = Date.now();

    const isCrashCountWithinRestartLimit =
      server.crashCount > 0 && server.crashCount <= MAX_SERVER_RESTARTS_AFTER_CRASH;
    const isServerAllowedToStart =
      server.state !== "unavailable" && (server.state !== "error" || isCrashCountWithinRestartLimit);

    if (!server.client && isServerAllowedToStart) {
      server.clientStartup ??= this.#startServer(definition, server).finally(() => {
        server.clientStartup = undefined;
      });
    }
    await server.clientStartup;

    return server;
  }

  async #startServer(definition: ServerDefinition, server: Server): Promise<void> {
    this.#setServerState(server, "starting");

    const launchConfig = await definition
      .findLaunchConfig(server.workspaceDirectory, this.#projectDirectory)
      .catch((error: unknown) => ({ reason: error instanceof Error ? error.message : String(error) }));
    if ("reason" in launchConfig) {
      this.#setServerState(server, "unavailable", launchConfig.reason);
      return;
    }

    try {
      const client = await LspClient.start(
        definition.id,
        server.workspaceDirectory,
        launchConfig,
        this.#diagnosticsTimeoutMs,
      );
      client.addServerExitListener(() => {
        server.client = undefined;
        server.crashCount += 1;
        const reason =
          server.crashCount > MAX_SERVER_RESTARTS_AFTER_CRASH
            ? `crashed ${server.crashCount} times`
            : `crashed, restarting on next use (${server.crashCount}/${MAX_SERVER_RESTARTS_AFTER_CRASH})`;
        this.#setServerState(server, "error", reason);
      });
      server.client = client;

      this.#setServerState(server, "connected");
    } catch (error) {
      server.crashCount = 0;

      this.#setServerState(server, "error", error instanceof Error ? error.message : String(error));
    }
  }

  #setServerState(server: Server, state: ServerState, reason?: string): void {
    server.state = state;
    server.reason = reason;
    for (const listener of this.#serverChangeListeners) {
      listener();
    }
  }

  async #stopIdleServers(): Promise<void> {
    const idleSince = Date.now() - this.#idleTimeoutMs;
    const idleServers = [...this.#serversByKey.values()].filter(
      (server) => server.client && !server.clientStartup && server.lastUsedAt < idleSince,
    );

    await Promise.all(
      idleServers.map(async (server) => {
        const client = server.client!;
        server.client = undefined;

        this.#setServerState(server, "idle");

        await client.dispose();
      }),
    );
  }
}
