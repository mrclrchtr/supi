import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AskUserOutcome, NormalizedQuestionnaire } from "@mrclrchtr/supi-ask-user/api";
import { completeSimpleModelRequest } from "@mrclrchtr/supi-core/llm";
import type { PromptImproverContext } from "./context.ts";
import { countCodePoints, promptImproverContextCounts } from "./context.ts";
import {
  capturePromptImproverError,
  capturePromptImproverResponse,
  type PromptImproverDiagnostics,
} from "./diagnostics.ts";
import {
  type ImprovementContinuation,
  type PreparedModelRequest,
  prepareModelRequest,
} from "./protocol.ts";
import { type ImprovementResponse, parseImprovementResponse } from "./response.ts";
import { waitForRequest } from "./ui.ts";

type RequestStage = "assessment" | "final";
type CommandContext = ExtensionCommandContext;

/** Inputs for one conversation. The caller owns the clarification form and editor checks. */
interface ImprovementOptions {
  ctx: CommandContext;
  model: Model<Api>;
  modelId: string;
  draft: string;
  background: PromptImproverContext;
  controller: AbortController;
  diagnostics: PromptImproverDiagnostics;
  /** Check ownership before and after the form. Reject on cancellation or stale input. */
  askForClarification: (questionnaire: NormalizedQuestionnaire) => Promise<AskUserOutcome>;
}

interface RequestOptions extends Omit<ImprovementOptions, "askForClarification"> {
  stage: RequestStage;
  continuation?: ImprovementContinuation;
}

/** Terminal model result with the background included in its request. */
export type ImprovementResult = Exclude<ImprovementResponse, { kind: "clarification" }> & {
  selectedContext: PromptImproverContext;
};

/** Complete one in-memory conversation with at most two requests and one submitted form. */
export async function improveDraft(options: ImprovementOptions): Promise<ImprovementResult> {
  let continuation: ImprovementContinuation | undefined;
  for (const stage of ["assessment", "final"] as const) {
    if (options.controller.signal.aborted) throw new RequestCancelledError();
    const result = await requestStage({ ...options, stage, continuation });
    if (options.controller.signal.aborted) throw new RequestCancelledError();
    let parsed: ImprovementResponse;
    try {
      parsed = parseImprovementResponse(result.message);
      if (stage === "final" && parsed.kind === "clarification") {
        throw new Error("The improver asked for clarification more than once.");
      }
      options.diagnostics.record(
        `${stage}.outcome`,
        "info",
        "Prompt improvement request completed",
        () => ({
          stage,
          outcome: parsed.kind,
          ...(parsed.kind === "proposal" ? { proposal: parsed.proposal } : {}),
          ...(parsed.kind === "clarification" ? { questionnaire: parsed.questionnaire } : {}),
        }),
      );
    } catch (error) {
      recordProtocolFailure(options, stage, error, result.message);
      throw error;
    }
    if (parsed.kind !== "clarification") {
      return { ...parsed, selectedContext: result.prepared.selectedContext };
    }
    const outcome = await options.askForClarification(parsed.questionnaire);
    continuation = {
      request: result.prepared,
      response: result.message,
      clarification: { questionnaire: parsed.questionnaire, outcome },
    };
  }
  throw new Error("The improver did not return a final result.");
}

async function requestStage(options: RequestOptions): Promise<{
  message: AssistantMessage;
  prepared: PreparedModelRequest;
}> {
  let prepared: ReturnType<typeof prepareModelRequest>;
  try {
    prepared = prepareModelRequest(
      options.model,
      options.draft,
      options.background,
      options.continuation,
    );
  } catch (error) {
    options.diagnostics.record(
      "request.failed",
      "warning",
      "Prompt request preparation failed",
      () => ({
        stage: options.stage,
        modelId: options.modelId,
        outcome: "failed",
        reasonCode: "request_preparation_failed",
        ...capturePromptImproverError(error),
      }),
    );
    throw error;
  }

  const requestStartedAt = options.diagnostics.startClock();
  options.diagnostics.record("request.prepared", "debug", "Prompt model request prepared", () => ({
    stage: options.stage,
    modelId: options.modelId,
    outputLimit: prepared.maxTokens,
    instructionsCodePoints: countCodePoints(prepared.context.systemPrompt ?? ""),
    payloadCodePoints: requestPayloadCodePoints(prepared.context.messages),
    counts: promptImproverContextCounts(prepared.selectedContext),
    reduction: contextReduction(options.background, prepared.selectedContext),
    request: {
      systemPrompt: prepared.context.systemPrompt ?? "",
      messages: prepared.context.messages.map((message) =>
        message.role === "assistant"
          ? capturePromptImproverResponse(message)
          : { role: message.role, content: message.content },
      ),
    },
  }));

  let request: Promise<AssistantMessage>;
  try {
    request = completeSimpleModelRequest(options.ctx, options.model, prepared.context, {
      affinityScope: "prompt-improver",
      signal: options.controller.signal,
      maxTokens: prepared.maxTokens,
    });
  } catch (error) {
    recordRequestFailure(options, requestStartedAt, "provider_error", error);
    throw new ProviderRequestError("The model request failed. The confirmed draft was kept.", {
      cause: error,
    });
  }

  let result: Awaited<ReturnType<typeof waitForRequest<AssistantMessage>>>;
  try {
    result = await waitForRequest(options.ctx.ui, {
      signal: options.controller.signal,
      cancel: () => options.controller.abort(),
      label:
        options.stage === "assessment"
          ? `Improving with ${options.modelId}…  Esc cancels`
          : `Finishing with ${options.modelId}…  Esc cancels`,
      request,
    });
  } catch (error) {
    recordRequestFailure(options, requestStartedAt, "wait_screen_failed", error);
    throw error;
  }

  if (result.kind === "cancelled") {
    options.diagnostics.record(
      "request.cancelled",
      "info",
      "Prompt model request cancelled",
      () => ({
        stage: options.stage,
        modelId: options.modelId,
        outcome: "cancelled",
        reasonCode: "request_cancelled",
        durationMs: options.diagnostics.durationSince(requestStartedAt),
      }),
    );
    throw new RequestCancelledError();
  }
  if (result.kind === "failed") {
    recordRequestFailure(options, requestStartedAt, "provider_error", result.error);
    throw new ProviderRequestError("The model request failed. The confirmed draft was kept.", {
      cause: result.error,
    });
  }

  options.diagnostics.record("request.response", "debug", "Prompt model response received", () => {
    const response = capturePromptImproverResponse(result.value);
    return {
      stage: options.stage,
      modelId: options.modelId,
      durationMs: options.diagnostics.durationSince(requestStartedAt),
      outcome: "completed",
      response,
      ...(response.diagnosticTruncated === true
        ? { diagnosticTruncated: true, diagnosticTruncatedPaths: ["$.response.content"] }
        : {}),
    };
  });
  return { message: result.value, prepared };
}

function recordProtocolFailure(
  options: Pick<RequestOptions, "diagnostics" | "modelId">,
  stage: RequestStage,
  error: unknown,
  response: unknown,
): void {
  options.diagnostics.record("request.failed", "warning", "Prompt response was rejected", () => ({
    stage,
    modelId: options.modelId,
    outcome: "failed",
    reasonCode: protocolFailureReason(error, response),
    ...capturePromptImproverError(error),
  }));
}

function recordRequestFailure(
  options: RequestOptions,
  startedAt: number | undefined,
  reasonCode: string,
  error: unknown,
): void {
  options.diagnostics.record("request.failed", "warning", "Prompt model request failed", () => ({
    stage: options.stage,
    modelId: options.modelId,
    outcome: "failed",
    reasonCode,
    durationMs: options.diagnostics.durationSince(startedAt),
    ...capturePromptImproverError(error),
  }));
}

function protocolFailureReason(error: unknown, response: unknown): string {
  const stopReason = readStringProperty(response, "stopReason");
  if (stopReason === "aborted") return "completion_aborted";
  if (stopReason === "error") return "completion_error";
  if (stopReason === "length") return "completion_truncated";
  const message = readStringProperty(error, "message") ?? "";
  if (message.includes("tool call")) return "unexpected_tool_call";
  if (message.includes("no response text")) return "empty_response";
  if (message.includes("invalid JSON")) return "invalid_json";
  if (message.includes("empty proposal")) return "empty_proposal";
  if (message.includes("clarification form")) return "invalid_questionnaire";
  if (message.includes("invalid response")) return "invalid_schema";
  if (message.includes("clarification more than once")) return "repeated_clarification";
  if (readProperty(response, "content") !== undefined) return "malformed_completion";
  return "protocol_rejected";
}

function readStringProperty(value: unknown, key: string): string | undefined {
  const item = readProperty(value, key);
  return typeof item === "string" ? item : undefined;
}

function readProperty(value: unknown, key: string): unknown {
  if ((typeof value !== "object" || value === null) && typeof value !== "function")
    return undefined;
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function contextReduction(
  original: PromptImproverContext,
  selected: PromptImproverContext,
): Record<string, number | boolean> {
  const originalCounts = promptImproverContextCounts(original);
  const selectedCounts = promptImproverContextCounts(selected);
  return {
    droppedGuidanceFiles:
      Number(originalCounts.guidanceFiles) - Number(selectedCounts.guidanceFiles),
    droppedGuidanceCodePoints:
      Number(originalCounts.guidanceCodePoints) - Number(selectedCounts.guidanceCodePoints),
    droppedConversationMessages:
      Number(originalCounts.conversationMessages) - Number(selectedCounts.conversationMessages),
    droppedConversationCodePoints:
      Number(originalCounts.conversationCodePoints) - Number(selectedCounts.conversationCodePoints),
    summaryDropped: originalCounts.summaryIncluded && !selectedCounts.summaryIncluded,
  };
}

function requestPayloadCodePoints(messages: readonly { content: unknown }[]): number {
  let count = 0;
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        count += countCodePoints(part.text);
      }
    }
  }
  return count;
}

export class RequestCancelledError extends Error {
  constructor() {
    super("The request was cancelled.");
    this.name = "PromptImproverCancelledError";
  }
}

export class ProviderRequestError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = "PromptImproverRequestError";
  }
}
