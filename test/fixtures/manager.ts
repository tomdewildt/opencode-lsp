import type { Diagnostic } from "vscode-languageserver-protocol";
import type { LspManager } from "../../src/lsp/manager.ts";

export class FakeLspManager implements Pick<
  LspManager,
  "getDiagnostics" | "getDiagnosticsForFile" | "syncFileToServers"
> {
  diagnosticsByFile = new Map<string, Diagnostic[]>();
  diagnosticsAfterSync = new Map<string, Diagnostic[]>();

  getDiagnostics() {
    return new Map(this.diagnosticsByFile);
  }

  getDiagnosticsForFile(file: string) {
    return this.diagnosticsByFile.get(file) ?? [];
  }

  async syncFileToServers(): ReturnType<LspManager["syncFileToServers"]> {
    this.diagnosticsByFile = new Map(this.diagnosticsAfterSync);
    return { failures: [] };
  }
}
