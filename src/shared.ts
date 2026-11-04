export const PLUGIN_ID = "tomdewildt.lsp";

export const SERVER_STATES = ["starting", "connected", "idle", "error", "unavailable"] as const;
export type ServerState = (typeof SERVER_STATES)[number];

export type PluginSnapshotServerStatus = {
  id: string;
  workspaceDirectory: string;
  state: ServerState;
  reason?: string;
};

export type PluginSnapshot = {
  enabled: boolean;
  servers: PluginSnapshotServerStatus[];
};

export const EMPTY_PLUGIN_SNAPSHOT: PluginSnapshot = { enabled: true, servers: [] };

function isPluginSnapshotServerStatus(value: unknown): value is PluginSnapshotServerStatus {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const server = value as Record<string, unknown>;
  return (
    typeof server.id === "string" &&
    typeof server.workspaceDirectory === "string" &&
    typeof server.state === "string" &&
    (SERVER_STATES as readonly string[]).includes(server.state) &&
    (server.reason === undefined || typeof server.reason === "string")
  );
}

export function isPluginSnapshot(value: unknown): value is PluginSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.enabled === "boolean" &&
    Array.isArray(snapshot.servers) &&
    snapshot.servers.every(isPluginSnapshotServerStatus)
  );
}
