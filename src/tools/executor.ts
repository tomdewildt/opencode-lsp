import type { Plugin } from "@opencode/plugin";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Position, type ServerCapabilities, WorkspaceSymbolRequest } from "vscode-languageserver-protocol";
import type { LspClient } from "../lsp/client.ts";
import type { LspManager, Server } from "../lsp/manager.ts";
import type { OpencodeTool } from "./builder.ts";
import type { ToolDefinition } from "./definitions/tool.ts";
import {
  findMatchingSymbols,
  findSymbolNamePosition,
  formatMatchingSymbols,
  getSymbolRange,
  parseQualifiedSymbolName,
  type WorkspaceSymbolResult,
} from "./symbols.ts";

type ToolContext = Parameters<OpencodeTool["execute"]>[1];

interface ToolInput {
  path: string;
  line?: number;
  character?: number;
  symbol?: string;
  query?: string;
}

interface RequestLocation {
  file: string;
  position: Position;
}

export async function executeTool(
  toolDefinition: ToolDefinition,
  rawInput: unknown,
  context: ToolContext,
  manager: LspManager,
  projectDirectory: string,
  permission: Plugin.Context["permission"],
): ReturnType<OpencodeTool["execute"]> {
  const input = rawInput as ToolInput;
  const file = path.resolve(projectDirectory, input.path);

  await assertPermission(permission, context, toolDefinition.name, file);
  await assertValidInput(toolDefinition, input, file);
  const clientsForFile = await getClientsForFile(manager, file, toolDefinition.capability);
  await manager.syncFileToServers(file, true);

  const symbol = toolDefinition.position ? input.symbol : undefined;
  const requestLocation = symbol
    ? await findSymbolLocation(symbol, clientsForFile, manager, projectDirectory)
    : getInputLocation(file, input);
  const requestClients = await getClientsForRequest(toolDefinition, manager, requestLocation, file, clientsForFile);
  const results = await sendRequestToClients(toolDefinition, requestClients, requestLocation, input.query ?? "");

  return buildToolResult(results, symbol, requestLocation, projectDirectory);
}

async function assertPermission(
  permission: Plugin.Context["permission"],
  context: ToolContext,
  toolName: string,
  file: string,
): Promise<void> {
  // 'assert' exists since opencode 2.0.29. Older hosts only honor deny rules through `options.permission`.
  await permission.assert?.({
    sessionID: context.sessionID,
    agent: context.agent,
    action: "lsp",
    resources: ["*"],
    save: ["*"],
    metadata: { tool: toolName, path: file },
    source: { type: "tool", messageID: context.messageID, id: context.id },
  });
}

async function assertValidInput(toolDefinition: ToolDefinition, input: ToolInput, file: string): Promise<void> {
  if (!(await Bun.file(file).exists())) {
    throw new Error(`File not found: ${file}`);
  }

  const hasLineAndCharacter = input.line !== undefined && input.character !== undefined;
  if (toolDefinition.position && input.symbol === undefined && !hasLineAndCharacter) {
    throw new Error("Pass either `symbol`, or both `line` and `character`.");
  }
}

async function getClientsForFile(
  manager: LspManager,
  file: string,
  capability: keyof ServerCapabilities,
): Promise<LspClient[]> {
  const servers = await manager.getServersForFile(file);
  const clientsForFile = servers.flatMap((server) => server.client ?? []);

  if (!clientsForFile.some((client) => client.hasCapability(capability))) {
    const serversWithoutClient = servers.filter((server) => !server.client);
    throw new Error(formatUnsupportedMessage(capability, clientsForFile, serversWithoutClient));
  }

  return clientsForFile;
}

export function formatUnsupportedMessage(
  capability: keyof ServerCapabilities,
  connectedClients: readonly Pick<LspClient, "serverID">[],
  serversWithoutClient: readonly Pick<Server, "serverID" | "state" | "reason">[],
): string {
  const feature = capability.replace(/Provider$/, "");
  const connectedServerIDs = connectedClients.map((client) => client.serverID).join(", ");
  const headline =
    connectedClients.length === 0
      ? "No LSP server available for this file type."
      : `No running LSP server for this file supports ${feature} (running: ${connectedServerIDs}).`;

  const unavailableServers = serversWithoutClient
    .map((server) => `${server.serverID}: ${server.reason ?? server.state}`)
    .join("; ");

  return unavailableServers ? `${headline} Not available: ${unavailableServers}.` : headline;
}

async function findSymbolLocation(
  symbol: string,
  clientsForFile: readonly LspClient[],
  manager: LspManager,
  projectDirectory: string,
): Promise<RequestLocation> {
  const symbolClients = clientsForFile.filter((client) => client.hasCapability("workspaceSymbolProvider"));
  if (symbolClients.length === 0) {
    throw new Error(
      "No running LSP server for this file can look symbols up by name. Pass line and character instead.",
    );
  }

  const qualifiedName = parseQualifiedSymbolName(symbol);
  const symbolsPerClient = await Promise.all(
    symbolClients.map((client) => client.sendRequest(WorkspaceSymbolRequest.type, { query: qualifiedName.name })),
  );
  const foundSymbols = symbolsPerClient.flatMap((symbols): WorkspaceSymbolResult[] => symbols ?? []);
  const matchingSymbols = findMatchingSymbols(foundSymbols, qualifiedName);

  const [matchingSymbol] = matchingSymbols;
  if (!matchingSymbol) {
    throw new Error(`No symbol named ${symbol} found. Check the spelling, or pass line and character instead.`);
  }
  if (matchingSymbols.length > 1) {
    const getRelativePath = (uri: string) => path.relative(projectDirectory, fileURLToPath(uri));
    throw new Error(
      `${symbol} matches ${matchingSymbols.length} symbols. Qualify it with its container or pass line and character:\n${formatMatchingSymbols(matchingSymbols, getRelativePath)}`,
    );
  }

  const file = fileURLToPath(matchingSymbol.location.uri);
  await manager.syncFileToServers(file, false);
  const text = await readFile(file, "utf8");

  return { file, position: findSymbolNamePosition(text, getSymbolRange(matchingSymbol)!, qualifiedName.name) };
}

function getInputLocation(file: string, input: ToolInput): RequestLocation {
  return { file, position: { line: (input.line ?? 1) - 1, character: (input.character ?? 1) - 1 } };
}

async function getClientsForRequest(
  toolDefinition: ToolDefinition,
  manager: LspManager,
  requestLocation: RequestLocation,
  file: string,
  clientsForFile: readonly LspClient[],
): Promise<readonly LspClient[]> {
  if (toolDefinition.workspace) {
    return manager.getConnectedClients();
  }
  if (requestLocation.file === file) {
    return clientsForFile;
  }

  // A symbol lookup can land in another file, which may be handled by other servers.
  const servers = await manager.getServersForFile(requestLocation.file);

  return servers.flatMap((server) => server.client ?? []);
}

async function sendRequestToClients(
  toolDefinition: ToolDefinition,
  clients: readonly LspClient[],
  requestLocation: RequestLocation,
  query: string,
): Promise<unknown[]> {
  const requestTarget = {
    textDocument: { uri: pathToFileURL(requestLocation.file).href },
    position: requestLocation.position,
    query,
  };
  const capableClients = clients.filter((client) => client.hasCapability(toolDefinition.capability));
  const resultsPerClient = await Promise.all(
    capableClients.map((client) => toolDefinition.request(client, requestTarget)),
  );

  return resultsPerClient.flat().filter((result) => result !== null && result !== undefined);
}

function buildToolResult(
  results: readonly unknown[],
  symbol: string | undefined,
  requestLocation: RequestLocation,
  projectDirectory: string,
): Awaited<ReturnType<OpencodeTool["execute"]>> {
  const resultText = results.length === 0 ? "No results found" : JSON.stringify(results, null, 2);
  if (!symbol) {
    return { content: resultText, metadata: { result: results } };
  }

  const { line, character } = requestLocation.position;
  const relativePath = path.relative(projectDirectory, requestLocation.file);
  const resolvedSymbolNote = `Resolved ${symbol} to ${relativePath}:${line + 1}:${character + 1}`;

  return { content: `${resolvedSymbolNote}\n\n${resultText}`, metadata: { result: results } };
}
