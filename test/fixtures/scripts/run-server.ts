import {
  ConfigurationRequest,
  createProtocolConnection,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  type DocumentDiagnosticReport,
  DocumentDiagnosticReportKind,
  DocumentDiagnosticRequest,
  ExitNotification,
  HoverRequest,
  InitializeRequest,
  type InitializeResult,
  LSPErrorCodes,
  PublishDiagnosticsNotification,
  ResponseError,
  ShutdownRequest,
  StreamMessageReader,
  StreamMessageWriter,
  TextDocumentSyncKind,
} from "vscode-languageserver-protocol/node";
import { buildFakeDiagnostic } from "../diagnostics.ts";

/**
 * - `push`: publishes "version N" diagnostics after every sync
 * - `pull`: answers `textDocument/diagnostic` instead of publishing
 * - `silent`: never sends diagnostics
 * - `crash`: exits on the first sync
 * - `die`: exits before the connection is opened
 * - `busy`: fails the first two hovers with ContentModified
 * - `configuration`: answers hover with the client's answer to `workspace/configuration`
 */
export type FakeMode = "push" | "pull" | "silent" | "crash" | "die" | "busy" | "configuration";

const PUSH_DELAY_MS = 20;

const mode = (process.env.FAKE_MODE ?? "push") as FakeMode;
if (mode === "die") {
  process.exit(3);
}

const connection = createProtocolConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);
let hoverCount = 0;

function handleFileSync(uri: string, version: number): void {
  if (mode === "crash") {
    process.exit(1);
  }
  if (mode === "push") {
    const diagnostics = [buildFakeDiagnostic(`version ${version}`)];
    setTimeout(
      () => void connection.sendNotification(PublishDiagnosticsNotification.type, { uri, diagnostics }),
      PUSH_DELAY_MS,
    );
  }
}

connection.onRequest(InitializeRequest.type, (): InitializeResult => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Full,
    hoverProvider: true,
    ...(mode === "pull" ? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } } : {}),
  },
}));

connection.onNotification(DidOpenTextDocumentNotification.type, ({ textDocument }) =>
  handleFileSync(textDocument.uri, textDocument.version),
);
connection.onNotification(DidChangeTextDocumentNotification.type, ({ textDocument }) =>
  handleFileSync(textDocument.uri, textDocument.version),
);

connection.onRequest(DocumentDiagnosticRequest.type, (): DocumentDiagnosticReport => ({
  kind: DocumentDiagnosticReportKind.Full,
  items: [buildFakeDiagnostic("pulled")],
}));

connection.onRequest(HoverRequest.type, async () => {
  if (mode === "configuration") {
    const configuration = await connection.sendRequest(ConfigurationRequest.type, {
      items: [{ section: "python.analysis" }, { section: "css" }, { section: "python.missing" }, {}],
    });
    return { contents: JSON.stringify(configuration) };
  }

  hoverCount += 1;
  if (mode === "busy" && hoverCount <= 2) {
    throw new ResponseError(LSPErrorCodes.ContentModified, "content modified");
  }

  return { contents: `hovered ${hoverCount}` };
});

connection.onRequest(ShutdownRequest.type, () => undefined);
connection.onNotification(ExitNotification.type, () => process.exit(0));

connection.listen();
