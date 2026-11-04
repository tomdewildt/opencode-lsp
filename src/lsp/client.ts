import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createMessageConnection,
  MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import {
  CancellationTokenSource,
  type ClientCapabilities,
  ConfigurationRequest,
  type Diagnostic,
  DiagnosticRefreshRequest,
  type DiagnosticRegistrationOptions,
  DidChangeTextDocumentNotification,
  DidChangeWatchedFilesNotification,
  DidOpenTextDocumentNotification,
  DidSaveTextDocumentNotification,
  DocumentDiagnosticReportKind,
  DocumentDiagnosticRequest,
  ExitNotification,
  FileChangeType,
  InitializedNotification,
  InitializeRequest,
  LSPErrorCodes,
  type ProgressToken,
  PublishDiagnosticsNotification,
  RegistrationRequest,
  type RequestParam,
  type RequestType,
  ResponseError,
  type ServerCapabilities,
  ShutdownRequest,
  TextDocumentSyncKind,
  UnregistrationRequest,
  WorkDoneProgressCreateRequest,
  WorkspaceFoldersRequest,
} from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { LaunchConfig } from "./definitions/server.ts";
import { LANGUAGE_IDS } from "./language.ts";

type ServerMessageEvent = "diagnosticsPush" | "serverWorkEnd" | "diagnosticRegistrationChange";

interface PushedDiagnostics {
  diagnostics: Diagnostic[];
  version?: number;
  receivedAt: number;
}

const CLIENT_CAPABILITIES: ClientCapabilities = {
  window: { workDoneProgress: true },
  workspace: {
    configuration: true,
    didChangeWatchedFiles: { dynamicRegistration: true },
    diagnostics: { refreshSupport: false },
  },
  textDocument: {
    diagnostic: { dynamicRegistration: true, relatedDocumentSupport: true },
    publishDiagnostics: { versionSupport: false },
  },
};

const DIAGNOSTICS_DEBOUNCE_MS = 150;
const DIAGNOSTICS_REQUEST_TIMEOUT_MS = 3000;

const SERVER_INITIALIZE_TIMEOUT_MS = 45_000;
const SERVER_REQUEST_TIMEOUT_MS = 15_000;
const SERVER_REQUEST_RETRYABLE_ERROR_CODES: readonly number[] = [
  LSPErrorCodes.ContentModified,
  LSPErrorCodes.ServerCancelled,
];
const SERVER_REQUEST_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000];
const SERVER_IDLE_SETTLE_MS = 300;
const SERVER_SHUTDOWN_TIMEOUT_MS = 1000;

export function deduplicateDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seenKeys = new Set<string>();

  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify([
      diagnostic.code,
      diagnostic.severity,
      diagnostic.message,
      diagnostic.source,
      diagnostic.range,
    ]);

    if (seenKeys.has(key)) {
      return false;
    }
    seenKeys.add(key);

    return true;
  });
}

export class LspClient {
  readonly serverID: string;
  readonly #workspaceDirectory: string;
  readonly #launchConfig: LaunchConfig;

  readonly #diagnosticsTimeoutMs: number;

  readonly #serverProcess: ChildProcessWithoutNullStreams;
  readonly #serverProcessSpawned: Promise<void>;
  readonly #serverProcessExited: Promise<void>;
  readonly #serverConnection: MessageConnection;
  #serverCapabilities: ServerCapabilities | undefined;
  readonly #serverWorkInProgress = new Set<ProgressToken>();
  readonly #serverMessageEvents = new EventEmitter<Record<ServerMessageEvent, []>>();
  readonly #serverExitListeners = new Set<() => void>();

  readonly #syncedFiles = new Map<string, TextDocument>();
  readonly #pushedDiagnosticsByFile = new Map<string, PushedDiagnostics>();
  readonly #pulledDiagnosticsByFile = new Map<string, Diagnostic[]>();
  readonly #diagnosticSourcesByRegistrationID = new Map<string, DiagnosticRegistrationOptions>();

  static async start(
    serverID: string,
    workspaceDirectory: string,
    launchConfig: LaunchConfig,
    diagnosticsTimeoutMs: number,
  ): Promise<LspClient> {
    const client = new LspClient(serverID, workspaceDirectory, launchConfig, diagnosticsTimeoutMs);
    await client.#initialize();
    return client;
  }

  private constructor(
    serverID: string,
    workspaceDirectory: string,
    launchConfig: LaunchConfig,
    diagnosticsTimeoutMs: number,
  ) {
    this.serverID = serverID;
    this.#workspaceDirectory = workspaceDirectory;
    this.#launchConfig = launchConfig;

    this.#diagnosticsTimeoutMs = diagnosticsTimeoutMs;

    const [command, ...args] = launchConfig.command;
    const serverProcess = spawn(command!, args, {
      cwd: workspaceDirectory,
      env: { ...process.env, ...launchConfig.env },
      stdio: "pipe",
    });
    serverProcess.stderr.resume();
    this.#serverProcess = serverProcess;
    this.#serverProcessExited = new Promise<void>((resolve) => serverProcess.once("exit", () => resolve()));
    this.#serverProcessSpawned = new Promise<void>((resolve, reject) => {
      serverProcess.once("spawn", resolve);
      serverProcess.once("error", reject);
    });

    this.#serverConnection = createMessageConnection(
      new StreamMessageReader(serverProcess.stdout),
      new StreamMessageWriter(serverProcess.stdin),
    );
    this.#registerMessageHandlers();
    this.#serverConnection.listen();
  }

  getDiagnostics(): Map<string, Diagnostic[]> {
    const files = new Set([...this.#pushedDiagnosticsByFile.keys(), ...this.#pulledDiagnosticsByFile.keys()]);
    return new Map([...files].map((file) => [file, this.getDiagnosticsForFile(file)]));
  }

  getDiagnosticsForFile(file: string): Diagnostic[] {
    return deduplicateDiagnostics([
      ...(this.#pushedDiagnosticsByFile.get(file)?.diagnostics ?? []),
      ...(this.#pulledDiagnosticsByFile.get(file) ?? []),
    ]);
  }

  hasCapability(capability: keyof ServerCapabilities): boolean {
    return Boolean(this.#serverCapabilities?.[capability]);
  }

  addServerExitListener(listener: () => void): void {
    this.#serverExitListeners.add(listener);
  }

  removeServerExitListener(listener: () => void): void {
    this.#serverExitListeners.delete(listener);
  }

  async syncFile(file: string, waitForDiagnostics: boolean): Promise<boolean> {
    const syncedAt = Date.now();
    const documentVersion = await this.#sendFileContent(file);
    return waitForDiagnostics ? this.#waitForFileDiagnostics(file, documentVersion, syncedAt) : true;
  }

  async sendRequest<Params, Result>(
    type: RequestType<Params, Result, unknown>,
    params: RequestParam<Params>,
  ): Promise<Result | null> {
    for (let attempt = 0; attempt <= SERVER_REQUEST_RETRY_DELAYS_MS.length; attempt++) {
      const requestCancellation = new CancellationTokenSource();

      try {
        const response = this.#serverConnection.sendRequest(type, params, requestCancellation.token);

        return await this.#applyTimeout(response, SERVER_REQUEST_TIMEOUT_MS);
      } catch (error) {
        requestCancellation.cancel();

        const retryDelayMs = SERVER_REQUEST_RETRY_DELAYS_MS[attempt];
        const isRetryableError =
          error instanceof ResponseError && SERVER_REQUEST_RETRYABLE_ERROR_CODES.includes(error.code);
        if (!isRetryableError || retryDelayMs === undefined) {
          return null;
        }

        await Bun.sleep(retryDelayMs);
      } finally {
        requestCancellation.dispose();
      }
    }

    return null;
  }

  async dispose(): Promise<void> {
    this.#serverExitListeners.clear();

    try {
      await this.#applyTimeout(this.#serverConnection.sendRequest(ShutdownRequest.type), SERVER_SHUTDOWN_TIMEOUT_MS);
      await this.#serverConnection.sendNotification(ExitNotification.type);
    } catch {
      // The server is already gone or does not answer. It is killed below.
    }

    this.#serverConnection.end();
    this.#serverConnection.dispose();
    await this.#applyTimeout(this.#serverProcessExited, SERVER_SHUTDOWN_TIMEOUT_MS).catch(() =>
      this.#serverProcess.kill("SIGKILL"),
    );
  }

  async #initialize(): Promise<void> {
    const rootUri = this.#getUriForFile(this.#workspaceDirectory);
    const initializeParams = {
      processId: this.#serverProcess.pid ?? null,
      rootUri,
      workspaceFolders: [{ name: "workspace", uri: rootUri }],
      initializationOptions: this.#launchConfig.initialization ?? {},
      capabilities: CLIENT_CAPABILITIES,
    };

    const initializeResponse = this.#serverProcessSpawned.then(() =>
      this.#serverConnection.sendRequest(InitializeRequest.type, initializeParams),
    );
    // A server that dies while starting fails right away instead of after the whole initialize timeout.
    const serverExitedEarly = this.#serverProcessExited.then(() =>
      Promise.reject(new Error(`exited with code ${this.#serverProcess.exitCode}`)),
    );

    try {
      const { capabilities } = await this.#applyTimeout(
        Promise.race([initializeResponse, serverExitedEarly]),
        SERVER_INITIALIZE_TIMEOUT_MS,
      );
      this.#serverCapabilities = capabilities;
    } catch (error) {
      this.#serverConnection.dispose();
      this.#serverProcess.kill();
      throw error;
    }

    // Servers ask for their settings themselves. Also sending 'didChangeConfiguration' makes gopls reload everything.
    await this.#serverConnection.sendNotification(InitializedNotification.type, {});

    void this.#serverProcessExited.then(() => this.#serverExitListeners.forEach((listener) => listener()));
  }

  #registerMessageHandlers(): void {
    const connection = this.#serverConnection;

    connection.onNotification(PublishDiagnosticsNotification.type, ({ uri, version, diagnostics }) => {
      const file = this.#getFileForUri(uri);
      if (!file) {
        return;
      }

      this.#pushedDiagnosticsByFile.set(file, { diagnostics, version, receivedAt: Date.now() });
      this.#serverMessageEvents.emit("diagnosticsPush");
    });

    connection.onNotification("$/progress", ({ token, value }: { token: ProgressToken; value?: { kind?: string } }) => {
      if (value?.kind === "begin") {
        this.#serverWorkInProgress.add(token);
      } else if (value?.kind === "end") {
        this.#serverWorkInProgress.delete(token);
        this.#serverMessageEvents.emit("serverWorkEnd");
      }
    });

    connection.onRequest(RegistrationRequest.type, ({ registrations }) => {
      for (const { id, method, registerOptions } of registrations) {
        if (method === DocumentDiagnosticRequest.method) {
          this.#diagnosticSourcesByRegistrationID.set(id, registerOptions as DiagnosticRegistrationOptions);
          this.#serverMessageEvents.emit("diagnosticRegistrationChange");
        }
      }
    });

    connection.onRequest(UnregistrationRequest.type, ({ unregisterations }) => {
      for (const { id, method } of unregisterations) {
        if (method === DocumentDiagnosticRequest.method) {
          this.#diagnosticSourcesByRegistrationID.delete(id);
          this.#serverMessageEvents.emit("diagnosticRegistrationChange");
        }
      }
    });

    connection.onRequest(ConfigurationRequest.type, ({ items }) =>
      items.map((item) => this.#getLaunchConfigSection(item.section)),
    );
    connection.onRequest(WorkspaceFoldersRequest.type, () => [
      { name: "workspace", uri: this.#getUriForFile(this.#workspaceDirectory) },
    ]);

    connection.onRequest(WorkDoneProgressCreateRequest.type, () => {});
    connection.onRequest(DiagnosticRefreshRequest.type, () => {});
  }

  #getLaunchConfigSection(section?: string): unknown {
    const settings = this.#launchConfig.settings;
    if (!section) {
      return settings ?? {};
    }

    const value = section.split(".").reduce<unknown>((current, key) => {
      if (typeof current !== "object" || current === null || !(key in current)) {
        return undefined;
      }
      return (current as Record<string, unknown>)[key];
    }, settings);

    return value ?? {};
  }

  #getFileForUri(uri: string): string | undefined {
    return uri.startsWith("file://") ? fileURLToPath(uri) : undefined;
  }

  #getUriForFile(file: string): string {
    return pathToFileURL(file).href;
  }

  #isPushForSyncedContent(push: PushedDiagnostics, documentVersion: number, syncedAt: number): boolean {
    if (push.version !== undefined) {
      return push.version === documentVersion;
    }

    // Servers that leave out the version are matched by time instead: the push has to arrive after the sync.
    return push.receivedAt >= syncedAt;
  }

  async #sendFileContent(file: string): Promise<number> {
    const text = await readFile(file, "utf8");
    const uri = this.#getUriForFile(file);
    const syncedDocument = this.#syncedFiles.get(file);

    if (syncedDocument) {
      // Diagnostics are kept on purpose some servers (clangd) only re-publish when the content really changed.
      const oldText = syncedDocument.getText();
      const wholeOldTextRange = { start: { line: 0, character: 0 }, end: syncedDocument.positionAt(oldText.length) };
      // `update` changes the document in place, so the old text and its range are read first.
      const { version } = TextDocument.update(syncedDocument, [{ text }], syncedDocument.version + 1);

      // Servers that asked for incremental changes get one change that replaces the whole old text.
      const textDocumentSync = this.#serverCapabilities?.textDocumentSync;
      const textDocumentSyncKind = typeof textDocumentSync === "number" ? textDocumentSync : textDocumentSync?.change;
      const contentChanges =
        textDocumentSyncKind === TextDocumentSyncKind.Incremental ? [{ range: wholeOldTextRange, text }] : [{ text }];

      await this.#serverConnection.sendNotification(DidChangeWatchedFilesNotification.type, {
        changes: [{ uri, type: FileChangeType.Changed }],
      });
      await this.#serverConnection.sendNotification(DidChangeTextDocumentNotification.type, {
        textDocument: { uri, version },
        contentChanges,
      });

      // Some servers (rust-analyzer) only run their full check on save.
      if (text !== oldText) {
        await this.#notifyServerOfSave(uri, text);
      }

      return version;
    }

    // Diagnostics reported before the first open came from an older copy of the file on disk, so they are dropped.
    this.#pushedDiagnosticsByFile.delete(file);
    this.#pulledDiagnosticsByFile.delete(file);
    const languageId = this.#launchConfig.languageId ?? LANGUAGE_IDS[path.extname(file)] ?? "plaintext";
    this.#syncedFiles.set(file, TextDocument.create(uri, languageId, 0, text));

    await this.#serverConnection.sendNotification(DidChangeWatchedFilesNotification.type, {
      changes: [{ uri, type: FileChangeType.Created }],
    });
    await this.#serverConnection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId, version: 0, text },
    });
    await this.#notifyServerOfSave(uri, text);

    return 0;
  }

  async #notifyServerOfSave(uri: string, text: string): Promise<void> {
    const textDocumentSync = this.#serverCapabilities?.textDocumentSync;
    const saveOptions = typeof textDocumentSync === "object" ? textDocumentSync.save : undefined;
    if (!saveOptions) {
      return;
    }

    const isTextRequestedByServer = typeof saveOptions === "object" && saveOptions.includeText === true;
    await this.#serverConnection.sendNotification(DidSaveTextDocumentNotification.type, {
      textDocument: { uri },
      ...(isTextRequestedByServer ? { text } : {}),
    });
  }

  async #pullDocumentDiagnosticsFromAllSources(file: string): Promise<boolean> {
    const documentDiagnosticSources = [...this.#diagnosticSourcesByRegistrationID.values()].filter(
      (source) => !source.workspaceDiagnostics,
    );
    const isPullDiagnosticsSupported =
      Boolean(this.#serverCapabilities?.diagnosticProvider) || documentDiagnosticSources.length > 0;
    if (!isPullDiagnosticsSupported) {
      return false;
    }

    // One pull per source: 'undefined' is the server's default source, the rest are registered by identifier.
    const diagnosticSourceIdentifiers = [
      undefined,
      ...new Set(documentDiagnosticSources.flatMap((source) => source.identifier ?? [])),
    ];
    const diagnosticPulls = diagnosticSourceIdentifiers.map((identifier) =>
      this.#pullDocumentDiagnosticsFromSource(file, identifier),
    );

    // A pull with diagnostics ends the race right away; one without waits for all pulls to finish instead.
    const allPullsFinished = Promise.all(diagnosticPulls).then((results) => results.some(Boolean));
    const pullOutcomes = diagnosticPulls.map((pull) =>
      pull.then((hasDiagnostics) => (hasDiagnostics ? true : allPullsFinished)),
    );
    return Promise.race(pullOutcomes);
  }

  async #pullDocumentDiagnosticsFromSource(file: string, identifier?: string): Promise<boolean> {
    const diagnosticsRequest = this.#serverConnection.sendRequest(DocumentDiagnosticRequest.type, {
      textDocument: { uri: this.#getUriForFile(file) },
      identifier,
    });
    const diagnosticsResponse = await this.#applyTimeout(diagnosticsRequest, DIAGNOSTICS_REQUEST_TIMEOUT_MS).catch(
      () => null,
    );
    if (!diagnosticsResponse) {
      return false;
    }

    // Only a "full" response carries diagnostics. "unchanged" means the stored ones are still current.
    const hasDiagnosticsForFile = diagnosticsResponse.kind === DocumentDiagnosticReportKind.Full;
    if (hasDiagnosticsForFile) {
      this.#pulledDiagnosticsByFile.set(file, deduplicateDiagnostics(diagnosticsResponse.items));
    }

    // The response can also carry other files whose diagnostics changed, e.g. files that import this one.
    for (const [relatedUri, relatedResponse] of Object.entries(diagnosticsResponse.relatedDocuments ?? {})) {
      const relatedFile = this.#getFileForUri(relatedUri);
      if (relatedFile && relatedResponse.kind === DocumentDiagnosticReportKind.Full) {
        this.#pulledDiagnosticsByFile.set(relatedFile, deduplicateDiagnostics(relatedResponse.items));
      }
    }

    return hasDiagnosticsForFile;
  }

  async #applyTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  async #waitForFileDiagnostics(file: string, documentVersion: number, syncedAt: number): Promise<boolean> {
    const diagnosticsDeadline = syncedAt + this.#diagnosticsTimeoutMs;
    const pushedDiagnosticsWait = this.#waitForPushedDiagnostics(file, documentVersion, syncedAt, diagnosticsDeadline);

    while (Date.now() < diagnosticsDeadline) {
      if (await this.#pullDocumentDiagnosticsFromAllSources(file)) {
        // A pull answered mid-check can miss errors, so pull once more after the server has gone idle.
        const isServerIdle = await this.#waitForServerIdle(diagnosticsDeadline);
        if (isServerIdle) {
          await this.#pullDocumentDiagnosticsFromAllSources(file);
        }
        return isServerIdle;
      }

      // No pull answer: wait for a push, or pull again if the server enables pull diagnostics meanwhile.
      const pushOutcome = pushedDiagnosticsWait.then((haveDiagnosticsArrived) =>
        haveDiagnosticsArrived ? "diagnosticsPush" : "deadlinePassed",
      );
      const registrationOutcome = this.#waitForEvent("diagnosticRegistrationChange", diagnosticsDeadline).then(
        (hasRegistrationChanged) => (hasRegistrationChanged ? "diagnosticRegistrationChange" : "deadlinePassed"),
      );

      const nextEvent = await Promise.race([pushOutcome, registrationOutcome]);
      if (nextEvent === "diagnosticRegistrationChange") {
        continue;
      }
      return nextEvent === "diagnosticsPush";
    }

    return false;
  }

  async #waitForPushedDiagnostics(
    file: string,
    documentVersion: number,
    syncedAt: number,
    diagnosticsDeadline: number,
  ): Promise<boolean> {
    while (Date.now() < diagnosticsDeadline) {
      const diagnosticsPush = this.#pushedDiagnosticsByFile.get(file);
      if (!diagnosticsPush || !this.#isPushForSyncedContent(diagnosticsPush, documentVersion, syncedAt)) {
        await this.#waitForEvent("diagnosticsPush", diagnosticsDeadline);
        continue;
      }

      // Servers often push more than once per change (a quick check, then a full one): wait until pushes stop for a bit.
      const diagnosticsDebounceEndsAt = diagnosticsPush.receivedAt + DIAGNOSTICS_DEBOUNCE_MS;
      if (Date.now() < diagnosticsDebounceEndsAt) {
        await Bun.sleep(Math.min(diagnosticsDebounceEndsAt, diagnosticsDeadline) - Date.now());
        continue;
      }

      // Pushes sent while the server is still checking are provisional.
      return this.#serverWorkInProgress.size === 0 || this.#waitForServerIdle(diagnosticsDeadline);
    }

    return false;
  }

  #waitForEvent(event: ServerMessageEvent, deadline: number): Promise<boolean> {
    const signal = AbortSignal.timeout(Math.max(0, deadline - Date.now()));

    return once(this.#serverMessageEvents, event, { signal }).then(
      () => true,
      () => false,
    );
  }

  async #waitForServerIdle(deadline: number): Promise<boolean> {
    while (Date.now() < deadline) {
      if (this.#serverWorkInProgress.size > 0) {
        await this.#waitForEvent("serverWorkEnd", deadline);
        continue;
      }

      // Servers work in phases with short gaps between them, so idle means no new work during the settle period.
      await Bun.sleep(Math.min(SERVER_IDLE_SETTLE_MS, deadline - Date.now()));
      if (this.#serverWorkInProgress.size === 0) {
        return true;
      }
    }

    return false;
  }
}
