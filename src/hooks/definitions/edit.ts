import type { Plugin } from "@opencode/plugin";
import path from "node:path";
import type { Diagnostic, DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { LspManager } from "../../lsp/manager.ts";
import type { Options } from "../../options.ts";
import { buildToolResultContent, getFilesEditedByToolCall } from "../adapter.ts";
import { formatDiagnosticsReport, formatDiagnosticsSignature, type FileDiagnostics } from "../format.ts";

function findOtherFilesWithChangedDiagnostics(
  diagnosticsBefore: ReadonlyMap<string, readonly Diagnostic[]>,
  diagnosticsAfter: ReadonlyMap<string, readonly Diagnostic[]>,
  editedFiles: readonly string[],
  severity: DiagnosticSeverity,
): FileDiagnostics[] {
  const otherFileDiagnostics: FileDiagnostics[] = [];

  for (const [file, diagnostics] of diagnosticsAfter) {
    if (editedFiles.includes(file)) {
      continue;
    }

    const signatureBefore = formatDiagnosticsSignature(diagnosticsBefore.get(file) ?? [], severity);
    const signatureAfter = formatDiagnosticsSignature(diagnostics, severity);
    if (signatureBefore !== signatureAfter) {
      otherFileDiagnostics.push({ file, diagnostics });
    }
  }

  return otherFileDiagnostics;
}

export function registerEditHook(
  toolApi: Plugin.Context["tool"],
  manager: Pick<LspManager, "getDiagnostics" | "getDiagnosticsForFile" | "syncFileToServers">,
  projectDirectory: string,
  options: Options,
) {
  // After an edit, write or patch, appends the LSP diagnostics of the edited files to the tool result.
  return toolApi.hook("execute.after", async (event) => {
    if (event.status !== "completed") {
      return;
    }

    const editedFiles = getFilesEditedByToolCall(event.tool, event.input, event.result.output, projectDirectory);
    if (editedFiles.length === 0) {
      return;
    }

    try {
      const diagnosticsBeforeSync = event.tool === "write" ? manager.getDiagnostics() : new Map();
      const editedFileDiagnostics = await Promise.all(
        editedFiles.map(async (file) => {
          const { failures } = await manager.syncFileToServers(file, true);
          const diagnostics = manager.getDiagnosticsForFile(file);
          return { file, label: path.relative(projectDirectory, file), diagnostics, failures };
        }),
      );

      // Only a write also reports other files, and only the ones whose diagnostics changed during the sync.
      const otherFileDiagnostics =
        event.tool === "write"
          ? findOtherFilesWithChangedDiagnostics(
              diagnosticsBeforeSync,
              manager.getDiagnostics(),
              editedFiles,
              options.severity,
            )
          : [];

      const diagnosticsReport = formatDiagnosticsReport(
        event.tool,
        editedFileDiagnostics,
        otherFileDiagnostics,
        options.severity,
      );
      event.result = { ...event.result, content: buildToolResultContent(event.result.content, diagnosticsReport) };
    } catch {
      // Diagnostics are best effort, never fail the edit that triggered them.
    }
  });
}
