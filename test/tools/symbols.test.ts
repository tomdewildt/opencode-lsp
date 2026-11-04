import { describe, expect, it } from "bun:test";
import {
  formatMatchingSymbols,
  findMatchingSymbols,
  findSymbolNamePosition,
  parseQualifiedSymbolName,
} from "../../src/tools/symbols.ts";
import { buildFakeWorkspaceSymbolResult } from "../fixtures/symbols.ts";

describe("parseQualifiedSymbolName", () => {
  it.each([
    ["add", { name: "add" }],
    ["SqlBuilder.toCommand", { name: "toCommand", container: "SqlBuilder" }],
    ["pkg.sub.Handler", { name: "Handler", container: "sub" }],
    ["Type::member", { name: "member", container: "Type" }],
    ["Class#method", { name: "method", container: "Class" }],
  ])("splits %p", (input, expected) => {
    // Act
    const qualifiedSymbolName = parseQualifiedSymbolName(input);

    // Assert
    expect(qualifiedSymbolName).toEqual(expected);
  });
});

describe("findMatchingSymbols", () => {
  const symbols = [
    buildFakeWorkspaceSymbolResult("toCommand", "file:///a.ts", 4, "SqlBuilder"),
    buildFakeWorkspaceSymbolResult("toCommand", "file:///b.ts", 9, "QueryBuilder"),
    buildFakeWorkspaceSymbolResult("toCommandLine", "file:///c.ts", 1),
  ];

  it("keeps only exact name matches", () => {
    // Act
    const matchingSymbols = findMatchingSymbols(symbols, { name: "toCommand" });

    // Assert
    expect(matchingSymbols).toHaveLength(2);
  });

  it("narrows matches by container", () => {
    // Act
    const [match, ...rest] = findMatchingSymbols(symbols, { name: "toCommand", container: "SqlBuilder" });

    // Assert
    expect(match?.location.uri).toBe("file:///a.ts");
    expect(rest).toEqual([]);
  });

  it("matches a container inside a package path", () => {
    // Arrange
    const go = [buildFakeWorkspaceSymbolResult("Handler", "file:///h.go", 3, "example.com/app/api")];

    // Act
    const matchingSymbols = findMatchingSymbols(go, { name: "Handler", container: "api" });

    // Assert
    expect(matchingSymbols).toHaveLength(1);
  });

  it("drops duplicates reported by several servers", () => {
    // Arrange
    const twice = [
      buildFakeWorkspaceSymbolResult("add", "file:///a.py", 0),
      buildFakeWorkspaceSymbolResult("add", "file:///a.py", 0),
    ];

    // Act
    const matchingSymbols = findMatchingSymbols(twice, { name: "add" });

    // Assert
    expect(matchingSymbols).toHaveLength(1);
  });
});

describe("findSymbolNamePosition", () => {
  it("finds the name inside a declaration range", () => {
    // Arrange
    const text = "export async function toCommand(query) {\n  return query;\n}\n";
    const range = { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } };

    // Act
    const symbolNamePosition = findSymbolNamePosition(text, range, "toCommand");

    // Assert
    expect(symbolNamePosition).toEqual({ line: 0, character: 22 });
  });

  it("falls back to the range start when the name is not in the range", () => {
    // Arrange
    const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } };

    // Act
    const symbolNamePosition = findSymbolNamePosition("a\nb c d\n", range, "missing");

    // Assert
    expect(symbolNamePosition).toEqual({ line: 1, character: 2 });
  });
});

describe("formatMatchingSymbols", () => {
  it("lists candidates with 1-based positions and their container", () => {
    // Arrange
    const candidates = [buildFakeWorkspaceSymbolResult("toCommand", "file:///a.ts", 4, "SqlBuilder")];

    // Act
    const formattedMatchingSymbols = formatMatchingSymbols(candidates, (uri) => uri.replace("file:///", ""));

    // Assert
    expect(formattedMatchingSymbols).toBe("- toCommand (in SqlBuilder) at a.ts:5:1");
  });
});
