import { type DebugEventQuery, isDebugLevel, isDebugOperationId } from "@mrclrchtr/supi-core/debug";

/** Command and Tool query with optional persisted-session selection. */
export type DebugToolParams = DebugEventQuery & { sessionFile?: string };

/** Parse exact key-value filters for the user-facing Debug command. */
export function parseDebugCommandArgs(
  args: string,
  normalizeLimit: (value: string) => number,
): DebugToolParams {
  const query: DebugToolParams = {};
  for (const part of args.trim().split(/\s+/).filter(Boolean)) {
    const [key, value] = part.split("=", 2);
    if (!value) continue;
    applyDebugFilter(query, key, value, normalizeLimit);
  }
  return query;
}

function applyDebugFilter(
  query: DebugToolParams,
  key: string,
  value: string,
  normalizeLimit: (value: string) => number,
): void {
  switch (key) {
    case "operationId":
      if (isDebugOperationId(value)) query.operationId = value;
      return;
    case "source":
      query.source = value;
      return;
    case "category":
      query.category = value;
      return;
    case "level":
      if (isDebugLevel(value)) query.level = value;
      return;
    case "limit":
      query.limit = normalizeLimit(value);
      return;
    case "sessionFile":
      query.sessionFile = value;
  }
}
