import type { Position, Range, SymbolInformation, WorkspaceSymbol } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";

export interface QualifiedSymbolName {
  name: string;
  container?: string;
}

export type WorkspaceSymbolResult = SymbolInformation | WorkspaceSymbol;

const MAX_LISTED_MATCHING_SYMBOLS = 10;

export function parseQualifiedSymbolName(symbol: string): QualifiedSymbolName {
  const nameParts = symbol
    .trim()
    .split(/::|[.#]/)
    .filter(Boolean);
  const name = nameParts.at(-1) ?? symbol.trim();
  const container = nameParts.at(-2);

  return container ? { name, container } : { name };
}

export function findMatchingSymbols(
  symbols: readonly WorkspaceSymbolResult[],
  qualifiedName: QualifiedSymbolName,
): WorkspaceSymbolResult[] {
  const matchingSymbolsByLocation = new Map<string, WorkspaceSymbolResult>();

  for (const symbol of symbols) {
    const range = getSymbolRange(symbol);
    if (symbol.name !== qualifiedName.name || !range) {
      continue;
    }
    if (qualifiedName.container && !isInNamedContainer(symbol, qualifiedName.container)) {
      continue;
    }

    // Several servers can report the same symbol, so one per file and line is kept.
    const location = `${symbol.location.uri}:${range.start.line}`;
    if (!matchingSymbolsByLocation.has(location)) {
      matchingSymbolsByLocation.set(location, symbol);
    }
  }

  return [...matchingSymbolsByLocation.values()];
}

export function getSymbolRange(symbol: WorkspaceSymbolResult): Range | undefined {
  return "range" in symbol.location ? symbol.location.range : undefined;
}

function isInNamedContainer(symbol: WorkspaceSymbolResult, container: string): boolean {
  return (symbol.containerName ?? "").split(/::|[./#\s]/).includes(container);
}

export function formatMatchingSymbols(
  symbols: readonly WorkspaceSymbolResult[],
  getRelativePath: (uri: string) => string,
): string {
  const lines = symbols.slice(0, MAX_LISTED_MATCHING_SYMBOLS).map((symbol) => {
    const position = getSymbolRange(symbol)!.start;
    const containerNote = symbol.containerName ? ` (in ${symbol.containerName})` : "";
    const location = `${getRelativePath(symbol.location.uri)}:${position.line + 1}:${position.character + 1}`;
    return `- ${symbol.name}${containerNote} at ${location}`;
  });

  const hiddenCount = symbols.length - MAX_LISTED_MATCHING_SYMBOLS;
  const hiddenNote = hiddenCount > 0 ? `\n... and ${hiddenCount} more` : "";

  return lines.join("\n") + hiddenNote;
}

export function findSymbolNamePosition(text: string, range: Range, name: string): Position {
  const document = TextDocument.create("", "", 0, text);
  const nameOffset = document.getText(range).indexOf(name);
  return nameOffset === -1 ? range.start : document.positionAt(document.offsetAt(range.start) + nameOffset);
}
