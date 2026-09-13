// biome-ignore-all lint/style/noExcessiveLinesPerFile: TypeScript protocol validation and conversion stay together.
import * as path from "node:path";
import {
  type CodeRequestControl,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import { fileToUri, uriToFile } from "@mrclrchtr/supi-core/path";
import type { Diagnostic, Position } from "../config/types.ts";
import { raceRequestControl } from "../session/readiness.ts";
import type {
  DiagnosticPullRequest,
  DiagnosticRequestAdapter,
  DiagnosticRequestExecution,
  DiagnosticRequestResult,
} from "./client-diagnostic-request.ts";

const TYPESCRIPT_REQUEST_METHOD = "typescript.tsserverRequest";
const EXECUTE_COMMAND_METHOD = "workspace/executeCommand";
const DIAGNOSTIC_COMMANDS = [
  "syntacticDiagnosticsSync",
  "semanticDiagnosticsSync",
  "suggestionDiagnosticsSync",
] as const;
const MAX_POSITION = 2_147_483_647;

type OwnedRequest = {
  result: Promise<unknown>;
  settled: Promise<void>;
};

/** Dependencies needed by the private TypeScript diagnostic adapter. */
export interface TypeScriptDiagnosticAdapterOptions {
  readonly fileTypes: readonly string[];
  readonly cwd?: string;
  readonly isSupportedRoute: () => boolean;
  readonly hasCommand: () => boolean;
  readonly getReady: () => Promise<void>;
  readonly sendRequestOwned: (
    method: string,
    params: unknown,
    options: { timeoutMs: number; deadline?: number; operationId?: string },
  ) => OwnedRequest;
}

/**
 * Build the tested TypeScript request adapter.
 *
 * The adapter uses the running language server's tsserver and sends all three
 * synchronous diagnostic requests in order. It never starts a second compiler
 * process and never treats an incomplete phase set as a clean result.
 */
export function createTypeScriptDiagnosticRequestAdapter(
  options: TypeScriptDiagnosticAdapterOptions,
): DiagnosticRequestAdapter {
  return {
    supports: (uri) =>
      options.isSupportedRoute() && options.hasCommand() && isSupportedFile(uri, options.fileTypes),
    sourceFor: (uri) =>
      options.isSupportedRoute() && options.hasCommand() && isSupportedFile(uri, options.fileTypes)
        ? "typescript"
        : undefined,
    collect: (request) => collectTypeScriptDiagnostics(request, options),
  };
}

interface TypeScriptDiagnosticCore {
  readonly range: Diagnostic["range"];
  readonly message: string;
  readonly severity: NonNullable<Diagnostic["severity"]>;
  readonly code?: number;
  readonly source: string;
}

/** Normalize one validated TypeScript diagnostic body into an LSP diagnostic. */
export function normalizeTypeScriptDiagnostic(
  value: unknown,
  options: { cwd?: string } = {},
): Diagnostic | undefined {
  if (!isRecord(value)) return undefined;
  const core = readDiagnosticCore(value);
  if (!core) return undefined;
  if (!hasValidDiagnosticFlag(value, "reportsUnnecessary")) return undefined;
  if (!hasValidDiagnosticFlag(value, "reportsDeprecated")) return undefined;
  const relatedInformation = readRelatedInformation(value.relatedInformation, options.cwd);
  if (value.relatedInformation !== undefined && relatedInformation === undefined) return undefined;
  const tags = buildDiagnosticTags(value);
  return {
    ...core,
    ...(relatedInformation !== undefined ? { relatedInformation } : {}),
    ...(tags !== undefined ? { tags } : {}),
  } satisfies Diagnostic;
}

function readDiagnosticCore(value: Record<string, unknown>): TypeScriptDiagnosticCore | undefined {
  const linePosition = isLinePositionDiagnostic(value);
  const range = readDiagnosticRange(value, linePosition);
  const message = linePosition ? value.message : value.text;
  const severity = readCategory(value.category);
  const code = readDiagnosticCode(value.code, linePosition);
  if (!range || typeof message !== "string" || severity === undefined || code === null) {
    return undefined;
  }
  if (value.source !== undefined && typeof value.source !== "string") return undefined;
  return {
    range,
    message,
    severity,
    ...(code === undefined ? {} : { code }),
    source:
      typeof value.source === "string" && value.source.length > 0 ? value.source : "typescript",
  };
}

function readDiagnosticRange(
  value: Record<string, unknown>,
  linePosition: boolean,
): Diagnostic["range"] | undefined {
  if (
    linePosition &&
    (!isInteger(value.start) ||
      value.start < 0 ||
      value.start > MAX_POSITION ||
      !isInteger(value.length) ||
      value.length < 0 ||
      value.length > MAX_POSITION)
  ) {
    return undefined;
  }
  const start = readLocation(linePosition ? value.startLocation : value.start);
  const end = readLocation(linePosition ? value.endLocation : value.end);
  return start && end && comparePositions(start, end) <= 0 ? { start, end } : undefined;
}

function readDiagnosticCode(value: unknown, linePosition: boolean): number | null | undefined {
  if (value === undefined && !linePosition) return undefined;
  if (!isInteger(value) || value < 0) return null;
  return value;
}

/** Normalize every diagnostic in one successful TypeScript phase body. */
export function normalizeTypeScriptDiagnostics(
  value: unknown,
  options: { cwd?: string } = {},
): Diagnostic[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const diagnostics: Diagnostic[] = [];
  for (const item of value) {
    const diagnostic = normalizeTypeScriptDiagnostic(item, options);
    if (diagnostic === undefined) return undefined;
    diagnostics.push(diagnostic);
  }
  return diagnostics;
}

function collectTypeScriptDiagnostics(
  request: DiagnosticPullRequest,
  options: TypeScriptDiagnosticAdapterOptions,
): DiagnosticRequestExecution<DiagnosticRequestResult> {
  let activeSettled = Promise.resolve();
  const startedAt = Date.now();
  const collectionDeadline = Number.isFinite(request.timeoutMs)
    ? startedAt + request.timeoutMs
    : undefined;

  const result = (async (): Promise<DiagnosticRequestResult> => {
    const control: CodeRequestControl = {
      signal: request.signal,
      deadline: collectionDeadline,
    };
    throwIfCodeRequestInterrupted(control);
    await raceRequestControl(options.getReady(), control);
    throwIfCodeRequestInterrupted(control);

    const diagnostics: Diagnostic[] = [];
    for (const command of DIAGNOSTIC_COMMANDS) {
      const phase = await collectTypeScriptPhase({
        command,
        request,
        options,
        control,
        collectionDeadline,
        startedAt,
        setActiveSettled: (settled) => {
          activeSettled = settled;
        },
      });
      diagnostics.push(...phase);
    }

    return {
      source: "typescript",
      report: { kind: "full", items: diagnostics },
    };
  })();

  // The result can reject at the owner deadline while the raw request is
  // still outstanding. Keep the scheduler occupied until that request ends.
  const settled = result
    .then(
      () => activeSettled,
      () => activeSettled,
    )
    .then(() => undefined);
  result.catch(() => {});
  settled.catch(() => {});
  return { result, settled };
}

interface TypeScriptPhaseOptions {
  readonly command: (typeof DIAGNOSTIC_COMMANDS)[number];
  readonly request: DiagnosticPullRequest;
  readonly options: TypeScriptDiagnosticAdapterOptions;
  readonly control: CodeRequestControl;
  readonly collectionDeadline: number | undefined;
  readonly startedAt: number;
  readonly setActiveSettled: (settled: Promise<void>) => void;
}

async function collectTypeScriptPhase(options: TypeScriptPhaseOptions): Promise<Diagnostic[]> {
  const { command, request, control, collectionDeadline, startedAt } = options;
  throwIfCodeRequestInterrupted(control);
  const remaining = remainingBudget(collectionDeadline, request.timeoutMs, startedAt);
  if (remaining <= 0) {
    throw new Error("TypeScript diagnostic request timed out.");
  }
  const execution = options.options.sendRequestOwned(
    EXECUTE_COMMAND_METHOD,
    {
      command: TYPESCRIPT_REQUEST_METHOD,
      arguments: [
        command,
        { file: request.uri, includeLinePosition: true },
        {
          executionTarget: 0,
          expectsResult: true,
          isAsync: false,
          lowPriority: true,
        },
      ],
    },
    {
      timeoutMs: remaining,
      deadline: collectionDeadline,
      ...(request.operationId !== undefined ? { operationId: request.operationId } : {}),
    },
  );
  options.setActiveSettled(execution.settled);
  const response = await raceRequestControl(execution.result, {
    signal: request.signal,
    deadline: collectionDeadline,
  });
  await execution.settled;
  const body = readSuccessfulResponseBody(response);
  if (body === undefined) {
    throw new Error(`Invalid ${command} response from TypeScript language server.`);
  }
  const phase = normalizeTypeScriptDiagnostics(body, { cwd: options.options.cwd });
  if (phase === undefined) {
    throw new Error(`Invalid ${command} diagnostic body from TypeScript language server.`);
  }
  return phase;
}

function readSuccessfulResponseBody(value: unknown): unknown[] | undefined {
  if (!isRecord(value) || value.type !== "response" || value.success !== true) return undefined;
  return Array.isArray(value.body) ? value.body : undefined;
}

function isSupportedFile(uri: string, fileTypes: readonly string[]): boolean {
  const filePath = uri.startsWith("file://") ? decodeFileUri(uri) : uri;
  const extension = path.extname(filePath).replace(/^\./, "");
  return extension.length > 0 && fileTypes.some((type) => type.replace(/^\./, "") === extension);
}

function decodeFileUri(uri: string): string {
  return uriToFile(uri);
}

function remainingBudget(
  deadline: number | undefined,
  timeoutMs: number,
  startedAt: number,
): number {
  const requestRemaining = timeoutMs - (Date.now() - startedAt);
  return deadline === undefined
    ? requestRemaining
    : Math.min(requestRemaining, deadline - Date.now());
}

function isLinePositionDiagnostic(value: Record<string, unknown>): boolean {
  return value.startLocation !== undefined || value.endLocation !== undefined;
}

function readLocation(value: unknown): Position | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !isPositiveInteger(value.line) ||
    value.line > MAX_POSITION + 1 ||
    !isPositiveInteger(value.offset) ||
    value.offset > MAX_POSITION + 1
  ) {
    return undefined;
  }
  return { line: value.line - 1, character: value.offset - 1 };
}

function comparePositions(left: Position, right: Position): number {
  return left.line - right.line || left.character - right.character;
}

function readCategory(value: unknown): Diagnostic["severity"] | undefined {
  switch (value) {
    case "error":
      return 1;
    case "warning":
      return 2;
    case "message":
      return 3;
    case "suggestion":
      return 4;
    default:
      return undefined;
  }
}

function hasValidDiagnosticFlag(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === "boolean" || isRecord(value[key]);
}

function buildDiagnosticTags(value: Record<string, unknown>): Array<1 | 2> | undefined {
  const tags: Array<1 | 2> = [];
  if (value.reportsUnnecessary === true || isRecord(value.reportsUnnecessary)) tags.push(1);
  if (value.reportsDeprecated === true || isRecord(value.reportsDeprecated)) tags.push(2);
  return tags.length > 0 ? tags : undefined;
}

function readRelatedInformation(
  value: unknown,
  cwd: string | undefined,
): Diagnostic["relatedInformation"] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const result: NonNullable<Diagnostic["relatedInformation"]> = [];
  for (const item of value) {
    const related = readRelatedEntry(item, cwd);
    if (related === null) return undefined;
    if (related !== undefined) result.push(related);
  }
  return result;
}

type RelatedDiagnosticInformation = NonNullable<Diagnostic["relatedInformation"]>[number];

function readRelatedEntry(
  value: unknown,
  cwd: string | undefined,
): RelatedDiagnosticInformation | null | undefined {
  if (!isRecord(value) || typeof value.message !== "string") return null;
  if (readCategory(value.category) === undefined || !isInteger(value.code)) return null;
  if (value.span === undefined) return undefined;
  if (
    !isRecord(value.span) ||
    typeof value.span.file !== "string" ||
    value.span.file.length === 0
  ) {
    return null;
  }
  const start = readLocation(value.span.start);
  const end = readLocation(value.span.end);
  if (!start || !end || comparePositions(start, end) > 0) return null;
  return {
    location: {
      uri: fileToUri(resolveRelatedFile(value.span.file, cwd)),
      range: { start, end },
    },
    message: value.message,
  };
}

function resolveRelatedFile(file: string, cwd: string | undefined): string {
  if (file.startsWith("file://")) return uriToFile(file);
  return path.isAbsolute(file) ? file : path.resolve(cwd ?? process.cwd(), file);
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
