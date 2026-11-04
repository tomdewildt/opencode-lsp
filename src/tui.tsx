import { Plugin } from "@opencode/plugin/tui";
import { LspRpc } from "./rpc.ts";
import {
  EMPTY_PLUGIN_SNAPSHOT,
  isPluginSnapshot,
  PLUGIN_ID,
  type PluginSnapshot,
  type PluginSnapshotServerStatus,
  type ServerState,
} from "./shared.ts";

const SIDEBAR_LABEL_BY_STATE: Readonly<Record<ServerState, string>> = {
  connected: "active",
  starting: "starting",
  idle: "inactive",
  error: "error",
  unavailable: "not installed",
};

export default Plugin.define({
  id: PLUGIN_ID,
  setup(context) {
    // Every tui receives the snapshots of all project directories, so they are kept per project directory.
    const [storage, updateStorage] = context.storage.memory("lsp", {
      initial: { snapshotsByProjectDirectory: {} as Record<string, PluginSnapshot> },
    });
    const lspRpc = context.client.rpc(LspRpc);

    const disposeUpdatedListener = lspRpc.events.on("updated", (event) => {
      if (isPluginSnapshot(event.data)) {
        const snapshot = event.data;
        updateStorage((draft) => void (draft.snapshotsByProjectDirectory[event.location.directory] = snapshot));
      }
    });

    const getSnapshotForSession = (sessionID: string): PluginSnapshot => {
      const projectDirectory = context.data.session.get(sessionID)?.location.directory;
      return projectDirectory ? getSnapshotForProjectDirectory(projectDirectory) : EMPTY_PLUGIN_SNAPSHOT;
    };

    // The first time a project directory is shown its snapshot is requested, after that the events keep it current.
    const requestedProjectDirectories = new Set<string>();
    const getSnapshotForProjectDirectory = (projectDirectory: string): PluginSnapshot => {
      if (!requestedProjectDirectories.has(projectDirectory)) {
        requestedProjectDirectories.add(projectDirectory);
        lspRpc
          .snapshot({}, { location: { directory: projectDirectory } })
          .then((snapshot) => {
            // An update event that arrived in the meantime is newer than this answer, so it is kept.
            if (isPluginSnapshot(snapshot)) {
              updateStorage((draft) => void (draft.snapshotsByProjectDirectory[projectDirectory] ??= snapshot));
            }
          })
          .catch(() => undefined);
      }
      return storage.snapshotsByProjectDirectory[projectDirectory] ?? EMPTY_PLUGIN_SNAPSHOT;
    };

    const renderServerRows = (snapshot: PluginSnapshot) => {
      const nameColumnWidth = Math.max(...snapshot.servers.map((server) => formatServerName(server).length)) + 2;
      return snapshot.servers.map((server) => renderServerRow(server, nameColumnWidth));
    };

    const formatServerName = (server: PluginSnapshotServerStatus) =>
      server.workspaceDirectory === "." ? server.id : `${server.id} ${server.workspaceDirectory}`;

    const renderServerRow = (server: PluginSnapshotServerStatus, nameColumnWidth: number) => (
      <text fg={context.theme.text.muted}>
        {formatServerName(server).padEnd(nameColumnWidth)}
        <span style={{ fg: getStateColor(server.state) }}>{SIDEBAR_LABEL_BY_STATE[server.state]}</span>
      </text>
    );

    const getStateColor = (state: ServerState) => {
      if (state === "connected") {
        return context.theme.text.feedback.success.base;
      }
      if (state === "error") {
        return context.theme.text.feedback.error.base;
      }
      return context.theme.text.muted;
    };

    const formatNoServersText = (snapshot: PluginSnapshot) =>
      snapshot.enabled ? "LSPs will activate as files are read" : "LSP is disabled";

    const disposeSlot = context.ui.slot({
      append: "sidebar.content",
      render: (props) => {
        const snapshot = () => getSnapshotForSession(props.sessionID);
        return (
          <box>
            <text fg={context.theme.text.base}>
              <b>LSP</b>
            </text>
            {snapshot().servers.length > 0 ? (
              renderServerRows(snapshot())
            ) : (
              <text fg={context.theme.text.muted}>{formatNoServersText(snapshot())}</text>
            )}
          </box>
        );
      },
    });

    return () => {
      disposeUpdatedListener();
      disposeSlot();
    };
  },
});
