import type { Plugin } from "@opencode/plugin";
import path from "node:path";
import type { LspManager } from "../../lsp/manager.ts";
import { getToolField } from "../adapter.ts";

export function registerReadHook(toolApi: Plugin.Context["tool"], manager: LspManager, projectDirectory: string) {
  // After a read, starts the file's servers in the background, so they are ready when the agent edits it.
  return toolApi.hook("execute.after", (event) => {
    if (event.status !== "completed" || event.tool !== "read") {
      return;
    }

    const file = getToolField(event.input, "path");
    if (typeof file === "string") {
      void manager.syncFileToServers(path.resolve(projectDirectory, file), false).catch(() => undefined);
    }
  });
}
