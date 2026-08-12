/** Navigation metadata for one captured replay message. */
export interface ReplayOutlineRow {
  readonly index: number;
  readonly role: string;
  readonly contentKinds: readonly string[];
  readonly contentCharacters: number;
  readonly toolNames: readonly string[];
  readonly stopReason?: string;
  readonly hasError: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedUnique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function contentKinds(content: unknown): string[] {
  if (typeof content === "string") return ["text"];
  if (!Array.isArray(content)) return content === undefined ? [] : ["unknown"];
  return orderedUnique(
    content.map((block) =>
      isRecord(block) && typeof block.type === "string" ? block.type : "unknown",
    ),
  );
}

function contentCharacters(message: unknown): number {
  if (!isRecord(message) || !("content" in message)) return 0;
  const serialized = JSON.stringify(message.content);
  return typeof serialized === "string" ? serialized.length : 0;
}

function toolNames(message: unknown): string[] {
  if (!isRecord(message)) return [];
  const names: string[] = [];
  if (typeof message.toolName === "string") names.push(message.toolName);
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (isRecord(block) && block.type === "toolCall" && typeof block.name === "string") {
        names.push(block.name);
      }
    }
  }
  return orderedUnique(names);
}

/** Project captured replay messages to bounded metadata without inspecting evidence recursively. */
export function projectReplayOutline(messages: readonly unknown[]): ReplayOutlineRow[] {
  return messages.map((message, index) => {
    const record = isRecord(message) ? message : undefined;
    const errorMessage = record?.errorMessage;
    const stopReason = typeof record?.stopReason === "string" ? record.stopReason : undefined;
    return {
      index,
      role: typeof record?.role === "string" ? record.role : "unknown",
      contentKinds: record ? contentKinds(record.content) : ["unknown"],
      contentCharacters: contentCharacters(message),
      toolNames: toolNames(message),
      ...(stopReason ? { stopReason } : {}),
      hasError:
        record?.isError === true ||
        stopReason === "error" ||
        (typeof errorMessage === "string" && errorMessage.length > 0),
    };
  });
}

/** Render deterministic one-row-per-message Replay Outline text. */
export function formatReplayOutline(rows: readonly ReplayOutlineRow[]): string {
  if (rows.length === 0) return "[no messages]";
  return rows
    .map((row) => {
      const kinds = row.contentKinds.length > 0 ? row.contentKinds.join(",") : "none";
      const tools = row.toolNames.length > 0 ? row.toolNames.join(",") : "none";
      return [
        `[${row.index}]`,
        `role=${row.role}`,
        `kinds=${kinds}`,
        `contentChars=${row.contentCharacters}`,
        `tools=${tools}`,
        ...(row.stopReason ? [`stop=${row.stopReason}`] : []),
        `error=${row.hasError}`,
      ].join(" · ");
    })
    .join("\n");
}
