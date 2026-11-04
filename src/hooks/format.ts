import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { SyncFileToServersResult } from "../lsp/manager.ts";

export interface FileDiagnostics {
  file: string;
  diagnostics: readonly Diagnostic[];
}

export interface EditedFileDiagnostics extends FileDiagnostics {
  label: string;
  failures: SyncFileToServersResult["failures"];
}

const MAX_REPORTED_DIAGNOSTICS_PER_FILE = 20;
const MAX_REPORTED_OTHER_FILES = 5;
const MAX_REPORTED_OTHER_FILE_DIAGNOSTICS = 30;
const LABEL_BY_SEVERITY: Readonly<Record<DiagnosticSeverity, string>> = {
  [DiagnosticSeverity.Error]: "ERROR",
  [DiagnosticSeverity.Warning]: "WARN",
  [DiagnosticSeverity.Information]: "INFO",
  [DiagnosticSeverity.Hint]: "HINT",
};

export function formatDiagnosticsReport(
  toolName: string,
  editedFileDiagnostics: readonly EditedFileDiagnostics[],
  otherFileDiagnostics: readonly FileDiagnostics[],
  severity: DiagnosticSeverity,
): string {
  // A patch can edit several files, so each gets its own heading. An edit or write only edits "this file".
  const heading = (editedFile: EditedFileDiagnostics) =>
    toolName === "patch" ? `in ${editedFile.label}` : "in this file";

  const editedFilesReport = editedFileDiagnostics
    .map((editedFile) => formatEditedFileReport(editedFile, heading(editedFile), severity))
    .join("");

  return editedFilesReport + formatOtherFilesReport(otherFileDiagnostics, severity);
}

export function formatDiagnosticsSignature(diagnostics: readonly Diagnostic[], severity: DiagnosticSeverity): string {
  return filterBySeverity(diagnostics, severity).map(formatDiagnostic).sort().join("\n");
}

function formatEditedFileReport(
  editedFile: EditedFileDiagnostics,
  heading: string,
  severity: DiagnosticSeverity,
): string {
  const diagnosticsBlock = formatDiagnosticsBlock(
    editedFile.file,
    editedFile.diagnostics,
    severity,
    MAX_REPORTED_DIAGNOSTICS_PER_FILE,
  );

  const diagnosticsSection = diagnosticsBlock
    ? `\n\nLSP ${formatSeverityNoun(severity)} detected ${heading}, please fix:\n${diagnosticsBlock}`
    : "";

  return diagnosticsSection + formatFailureNotes(editedFile);
}

function formatOtherFilesReport(otherFiles: readonly FileDiagnostics[], severity: DiagnosticSeverity): string {
  const otherFileSections: string[] = [];

  let remainingDiagnostics = MAX_REPORTED_OTHER_FILE_DIAGNOSTICS;
  for (const otherFile of otherFiles) {
    const limit = Math.min(MAX_REPORTED_DIAGNOSTICS_PER_FILE, remainingDiagnostics);
    const diagnosticsBlock = formatDiagnosticsBlock(otherFile.file, otherFile.diagnostics, severity, limit);
    if (!diagnosticsBlock) {
      continue;
    }

    otherFileSections.push(`\n\nLSP ${formatSeverityNoun(severity)} detected in other files:\n${diagnosticsBlock}`);
    remainingDiagnostics -= Math.min(filterBySeverity(otherFile.diagnostics, severity).length, limit);
    if (otherFileSections.length >= MAX_REPORTED_OTHER_FILES || remainingDiagnostics <= 0) {
      break;
    }
  }

  return otherFileSections.join("");
}

function formatFailureNotes(editedFile: EditedFileDiagnostics): string {
  return editedFile.failures
    .map(
      (failure) =>
        `\n\nLSP diagnostics for ${editedFile.label} are incomplete (${failure.serverID}: ${failure.reason}). Re-check later or run the project's type checker.`,
    )
    .join("");
}

function formatDiagnosticsBlock(
  file: string,
  diagnostics: readonly Diagnostic[],
  severity: DiagnosticSeverity,
  limit: number,
): string {
  const reportedDiagnostics = filterBySeverity(diagnostics, severity);
  if (reportedDiagnostics.length === 0 || limit <= 0) {
    return "";
  }

  const hiddenCount = reportedDiagnostics.length - limit;
  const hiddenNote = hiddenCount > 0 ? `\n... and ${hiddenCount} more` : "";
  const lines = reportedDiagnostics.slice(0, limit).map(formatDiagnostic).join("\n");

  return `<diagnostics file="${file}">\n${lines}${hiddenNote}\n</diagnostics>`;
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const severityLabel = LABEL_BY_SEVERITY[diagnostic.severity ?? DiagnosticSeverity.Error];
  const { line, character } = diagnostic.range.start;
  return `${severityLabel} [${line + 1}:${character + 1}] ${diagnostic.message}`;
}

function formatSeverityNoun(severity: DiagnosticSeverity): string {
  return severity === DiagnosticSeverity.Error ? "errors" : "diagnostics";
}

function filterBySeverity(diagnostics: readonly Diagnostic[], severity: DiagnosticSeverity): Diagnostic[] {
  return diagnostics.filter((diagnostic) => (diagnostic.severity ?? DiagnosticSeverity.Error) <= severity);
}
