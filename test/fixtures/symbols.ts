import { SymbolKind } from "vscode-languageserver-protocol";
import type { WorkspaceSymbolResult } from "../../src/tools/symbols.ts";

export function buildFakeWorkspaceSymbolResult(
  name: string,
  uri: string,
  line: number,
  containerName?: string,
): WorkspaceSymbolResult {
  const range = { start: { line, character: 0 }, end: { line: line + 2, character: 1 } };
  return { name, kind: SymbolKind.Function, location: { uri, range }, ...(containerName ? { containerName } : {}) };
}
