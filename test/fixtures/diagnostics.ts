import type { Diagnostic, DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { EditedFileDiagnostics } from "../../src/hooks/format.ts";

export function buildFakeDiagnostic(message: string, severity?: DiagnosticSeverity, line = 0): Diagnostic {
  return { range: { start: { line, character: 0 }, end: { line, character: 1 } }, severity, message };
}

export function buildFakeEditedFileDiagnostics(overrides: Partial<EditedFileDiagnostics> = {}): EditedFileDiagnostics {
  return { file: "/project/src/a.ts", label: "src/a.ts", diagnostics: [], failures: [], ...overrides };
}
