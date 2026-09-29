import { PROMPT_IMPROVER_DEBUG_LIMITS } from "./diagnostic-data.ts";

/** Capture response fields without retaining the provider message object. */
export function capturePromptImproverResponse(response: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = { shape: valueShape(response) };
  copyStringProperties(response, result, [
    "role",
    "api",
    "provider",
    "model",
    "responseModel",
    "stopReason",
    "rawStopReason",
    "errorMessage",
  ]);
  copyPrimitiveProperties(response, result, ["timestamp", "endTurn"]);
  captureResponseContent(response, result);
  captureResponseUsage(response, result);
  return result;
}

/** Read bounded error details without retaining arbitrary thrown object graphs. */
export function capturePromptImproverError(error: unknown): Record<string, unknown> {
  return { error: captureErrorCause(error, 0, new WeakSet<object>()) };
}

function copyStringProperties(
  value: unknown,
  target: Record<string, unknown>,
  keys: string[],
): void {
  for (const key of keys) {
    const item = readProperty(value, key);
    if (item === undefined) continue;
    target[key] = typeof item === "string" ? item : { shape: valueShape(item) };
  }
}

function copyPrimitiveProperties(
  value: unknown,
  target: Record<string, unknown>,
  keys: string[],
): void {
  for (const key of keys) {
    const item = readProperty(value, key);
    if (typeof item === "number" || typeof item === "boolean") target[key] = item;
  }
}

function captureResponseContent(response: unknown, target: Record<string, unknown>): void {
  const content = readProperty(response, "content");
  if (typeof content === "string") {
    target.contentShape = "string";
    target.content = [{ type: "string", text: content }];
    return;
  }
  if (valueShape(content) !== "array") {
    target.contentShape = content === undefined ? "missing" : valueShape(content);
    return;
  }
  target.content = responseParts(content as unknown[]);
  if (safeArrayLength(content as unknown[]) > PROMPT_IMPROVER_DEBUG_LIMITS.arrayItems) {
    target.diagnosticTruncated = true;
  }
}

function responseParts(content: unknown[]): unknown[] {
  const length = safeArrayLength(content);
  const limit = PROMPT_IMPROVER_DEBUG_LIMITS.arrayItems;
  const count = Math.min(length, length > limit ? limit - 1 : limit);
  const parts: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    let part: unknown;
    try {
      part = content[index];
    } catch {
      parts.push({ type: "unreadable" });
      continue;
    }
    parts.push(captureResponsePart(part));
  }
  if (length > count) parts.push(`[${length - count} response parts omitted]`);
  return parts;
}

function captureResponsePart(part: unknown): unknown {
  if (typeof part === "string") return { type: "string", text: part };
  if (!isRecord(part)) return { type: part === null ? "null" : valueShape(part) };
  const type = readProperty(part, "type");
  if (typeof type !== "string") return { type: "unknown" };
  if (type === "text") return { type, text: captureText(part, "text") };
  if (type === "thinking") return { type, thinking: captureText(part, "thinking") };
  if (type === "toolCall") return captureToolCallPart(part);
  return { type };
}

function captureToolCallPart(part: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { type: "toolCall" };
  for (const key of ["id", "name", "arguments", "thoughtSignature", "namespace"]) {
    const value = readProperty(part, key);
    if (key === "arguments") {
      result[key] = opaqueProviderValue(value);
      continue;
    }
    if (value === undefined) continue;
    result[key] = typeof value === "string" ? value : { shape: valueShape(value) };
  }
  return result;
}

function captureText(value: unknown, key: string): unknown {
  const text = readProperty(value, key);
  return typeof text === "string" ? text : { shape: valueShape(text) };
}

function opaqueProviderValue(value: unknown): { shape: string } {
  return { shape: valueShape(value) };
}

function captureResponseUsage(response: unknown, target: Record<string, unknown>): void {
  const usage = readProperty(response, "usage");
  if (!isRecord(usage)) {
    if (usage !== undefined) target.usageShape = valueShape(usage);
    return;
  }
  const result: Record<string, unknown> = {};
  for (const key of [
    "input",
    "output",
    "cacheRead",
    "cacheWrite",
    "cacheWrite1h",
    "reasoning",
    "totalTokens",
  ]) {
    const value = readProperty(usage, key);
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    // The registry treats any `token` key as sensitive. Use a clear count label.
    result[key === "totalTokens" ? "totalUsageUnits" : key] = value;
  }
  const cost = readProperty(usage, "cost");
  if (isRecord(cost)) result.cost = copyCost(cost);
  target.usage = result;
}

function copyCost(cost: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"]) {
    const value = readProperty(cost, key);
    if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
  }
  return result;
}

function captureErrorCause(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return { message: value };
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return { thrownValue: value === undefined ? "[Undefined]" : value };
  }
  if (seen.has(value)) return { cause: "[Circular]" };
  if (depth >= 3) return { cause: "[Cause depth limit]" };
  seen.add(value);

  const result: Record<string, unknown> = {};
  for (const key of ["name", "message", "stack", "code", "status", "statusCode"]) {
    const property = readProperty(value, key);
    if (
      typeof property === "string" ||
      (typeof property === "number" && Number.isFinite(property))
    ) {
      result[key] = property;
    }
  }
  const cause = readProperty(value, "cause");
  if (cause !== undefined) result.cause = captureErrorCause(cause, depth + 1, seen);
  return Object.keys(result).length ? result : { thrownType: typeof value };
}

function safeArrayLength(value: unknown[]): number {
  try {
    return value.length;
  } catch {
    return 0;
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return valueShape(value) === "object";
}

function valueShape(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  try {
    return Array.isArray(value) ? "array" : "object";
  } catch {
    return "unreadable";
  }
}
