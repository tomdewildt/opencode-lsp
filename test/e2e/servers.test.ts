import { afterAll, describe, expect, it } from "bun:test";
import path from "node:path";
import { LspManager } from "../../src/lsp/manager.ts";
import { buildTools, type OpencodeTool } from "../../src/tools/builder.ts";
import { DEFAULT_TOOL_DEFINITIONS } from "../../src/tools/registry.ts";
import { E2E_BIN_DIRECTORIES, E2E_LEGACY_NODE_MODULES, E2E_NODE_MODULES } from "./environment.ts";
import { createFakeProject } from "./fixtures/project.ts";
import { FAKE_TOOL_CONTEXT, FAKE_TOOL_PERMISSION } from "./fixtures/tool-api.ts";

// Add the E2E bin directories to the PATH so that the language servers can be found.
process.env.PATH = [...E2E_BIN_DIRECTORIES, process.env.PATH].join(path.delimiter);

export interface TestCase {
  testName: string;
  serverID: string;
  filePath: string;
  fixtureName?: string;
  expectedDiagnosticMessage?: string;
  absentDiagnosticMessage?: string;
  symbolName?: string;
  isSymbolLookupByPosition?: boolean;
  nodeModulesDirectory?: string;
  pluginOptions?: object;
}

const MANAGERS: LspManager[] = [];
const DIAGNOSTICS_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 120_000;
const TEST_CASES: TestCase[] = [
  {
    testName: "ansible",
    serverID: "ansible",
    filePath: "playbooks/site.yml",
    expectedDiagnosticMessage: "should be named",
  },
  {
    testName: "clojure-lsp",
    serverID: "clojure-lsp",
    filePath: "src/app/core.clj",
    expectedDiagnosticMessage: "missing-value",
    symbolName: "greet",
  },
  {
    testName: "eslint",
    serverID: "eslint",
    filePath: "main.js",
    expectedDiagnosticMessage: "unused",
    nodeModulesDirectory: E2E_NODE_MODULES,
  },
  {
    testName: "gopls",
    serverID: "gopls",
    filePath: "main.go",
    expectedDiagnosticMessage: "cannot use",
    symbolName: "Greet",
  },
  {
    testName: "gopls-staticcheck",
    serverID: "gopls",
    filePath: "main.go",
    expectedDiagnosticMessage: "return value is ignored",
  },
  {
    testName: "gopls-staticcheck-off",
    serverID: "gopls",
    filePath: "main.go",
    fixtureName: "gopls-staticcheck",
    absentDiagnosticMessage: "return value is ignored",
    pluginOptions: { servers: { gopls: { options: { staticcheck: false } } } },
  },
  {
    testName: "oxlint",
    serverID: "oxlint",
    filePath: "main.js",
    expectedDiagnosticMessage: "debugger",
    nodeModulesDirectory: E2E_NODE_MODULES,
  },
  {
    testName: "pyright",
    serverID: "pyright",
    filePath: "main.py",
    expectedDiagnosticMessage: "not assignable",
    symbolName: "greet",
  },
  {
    testName: "ruff",
    serverID: "ruff",
    filePath: "main.py",
    expectedDiagnosticMessage: "imported but unused",
  },
  {
    testName: "rust",
    serverID: "rust",
    filePath: "src/main.rs",
    expectedDiagnosticMessage: "missing_value",
    symbolName: "greet",
  },
  {
    testName: "rust-clippy",
    serverID: "rust",
    filePath: "src/main.rs",
    expectedDiagnosticMessage: "equal expressions",
  },
  {
    testName: "rust-clippy-off",
    serverID: "rust",
    filePath: "src/main.rs",
    fixtureName: "rust-clippy",
    absentDiagnosticMessage: "equal expressions",
    pluginOptions: { servers: { rust: { options: { check: { command: "check" } } } } },
  },
  {
    testName: "terraform",
    serverID: "terraform",
    filePath: "main.tf",
    symbolName: "greeting",
    isSymbolLookupByPosition: true,
  },
  {
    testName: "tflint",
    serverID: "tflint",
    filePath: "main.tf",
    expectedDiagnosticMessage: "declared but not used",
  },
  {
    testName: "ty",
    serverID: "ty",
    filePath: "main.py",
    expectedDiagnosticMessage: "not assignable",
    symbolName: "greet",
    pluginOptions: { servers: { ty: {} } },
  },
  {
    testName: "typescript",
    serverID: "typescript",
    filePath: "main.ts",
    expectedDiagnosticMessage: "not assignable",
    symbolName: "greet",
    nodeModulesDirectory: E2E_NODE_MODULES,
  },
  {
    testName: "typescript-legacy",
    serverID: "typescript",
    filePath: "main.ts",
    expectedDiagnosticMessage: "not assignable",
    symbolName: "greet",
    nodeModulesDirectory: E2E_LEGACY_NODE_MODULES,
  },
];

async function executeToolByName(opencodeTools: OpencodeTool[], toolName: string, toolInput: object): Promise<string> {
  const opencodeTool = opencodeTools.find(({ name }) => name === toolName)!;
  const toolResult = await opencodeTool.execute(toolInput as never, FAKE_TOOL_CONTEXT);
  return String(toolResult.content);
}

function findToolInputPosition(fileText: string, symbolName: string) {
  const lines = fileText.split("\n");
  const line = lines.findIndex((lineText) => lineText.includes(symbolName));
  return { line: line + 1, character: lines[line]!.indexOf(symbolName) + 1 };
}

afterAll(async () => {
  await Promise.all(MANAGERS.map((manager) => manager.dispose()));
});

describe("language servers", async () => {
  for (const { testCase, projectDirectory, definition, file, unavailableReason } of await Promise.all(
    TEST_CASES.map(createFakeProject),
  )) {
    const skippedNote = unavailableReason ? ` (skipped: ${unavailableReason})` : "";

    it.skipIf(unavailableReason !== undefined)(
      `${testCase.testName} reports diagnostics and answers requests${skippedNote}`,
      async () => {
        // Arrange
        const manager = new LspManager([definition], projectDirectory, {
          idleTimeoutMs: 0,
          diagnosticsTimeoutMs: DIAGNOSTICS_TIMEOUT_MS,
        });
        MANAGERS.push(manager);

        // Act
        const syncResult = await manager.syncFileToServers(file, true);
        const diagnosticsText = manager
          .getDiagnosticsForFile(file)
          .map((diagnostic) => diagnostic.message)
          .join("\n")
          .toLowerCase();

        // Assert
        expect(syncResult).toEqual({ failures: [] });
        if (testCase.expectedDiagnosticMessage !== undefined) {
          expect(diagnosticsText).toContain(testCase.expectedDiagnosticMessage.toLowerCase());
        }
        if (testCase.absentDiagnosticMessage !== undefined) {
          expect(diagnosticsText).not.toContain(testCase.absentDiagnosticMessage.toLowerCase());
        }

        // Act
        const [client] = (await manager.getServersForFile(file)).flatMap((server) => server.client ?? []);
        const opencodeTools = buildTools(DEFAULT_TOOL_DEFINITIONS, manager, projectDirectory, FAKE_TOOL_PERMISSION);
        let hoverText: string | undefined;
        let documentSymbolsText: string | undefined;
        if (testCase.symbolName && client!.hasCapability("hoverProvider")) {
          const isLookupBySymbol =
            client!.hasCapability("workspaceSymbolProvider") && !testCase.isSymbolLookupByPosition;
          const hoverInput = isLookupBySymbol
            ? { path: file, symbol: testCase.symbolName }
            : { path: file, ...findToolInputPosition(await Bun.file(file).text(), testCase.symbolName) };
          hoverText = await executeToolByName(opencodeTools, "lsp_hover", hoverInput);
        }
        if (client!.hasCapability("documentSymbolProvider")) {
          documentSymbolsText = await executeToolByName(opencodeTools, "lsp_document_symbols", { path: file });
        }

        // Assert
        if (hoverText !== undefined) {
          expect(hoverText).not.toContain("No results found");
        }
        if (documentSymbolsText !== undefined) {
          expect(documentSymbolsText).not.toBe("No results found");
        }
      },
      TEST_TIMEOUT_MS,
    );
  }
});
