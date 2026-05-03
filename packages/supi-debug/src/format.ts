function formatPrimitive(value: unknown): string[] {
  if (value === null) return ["null"];
  if (typeof value === "boolean") return [String(value)];
  if (typeof value === "number") return [String(value)];
  if (typeof value === "bigint") return [`${value}n`];
  if (typeof value === "string") {
    if (value.includes("\n")) {
      return value.split("\n");
    }
    return [JSON.stringify(value)];
  }
  return [String(value)];
}

function formatArray(value: unknown[], seen: WeakSet<object>): string[] {
  if (value.length === 0) return ["[]"];
  const lines: string[] = ["["];
  for (let i = 0; i < value.length; i++) {
    const itemLines = formatDataLinesRecursive(value[i], seen);
    const indented = itemLines.map((line) => `  ${line}`);
    if (i < value.length - 1) {
      indented[indented.length - 1] += ",";
    }
    lines.push(...indented);
  }
  lines.push("]");
  return lines;
}

function formatObjectEntry(
  key: string,
  value: unknown,
  seen: WeakSet<object>,
  isLast: boolean,
): string[] {
  const keyStr = JSON.stringify(key);
  const valueLines = formatDataLinesRecursive(value, seen);
  const lines: string[] = [];

  if (typeof value === "string" && value.includes("\n")) {
    lines.push(`  ${keyStr}:`);
    for (const line of valueLines) {
      lines.push(`    ${line}`);
    }
  } else {
    valueLines[0] = `  ${keyStr}: ${valueLines[0]}`;
    for (let j = 1; j < valueLines.length; j++) {
      valueLines[j] = `  ${valueLines[j]}`;
    }
    lines.push(...valueLines);
  }

  if (!isLast) {
    lines[lines.length - 1] += ",";
  }
  return lines;
}

function formatObject(value: Record<string, unknown>, seen: WeakSet<object>): string[] {
  const entries = Object.entries(value);
  if (entries.length === 0) return ["{}"];
  const lines: string[] = ["{"];
  for (let i = 0; i < entries.length; i++) {
    const [k, v] = entries[i];
    lines.push(...formatObjectEntry(k, v, seen, i === entries.length - 1));
  }
  lines.push("}");
  return lines;
}

function formatDataLinesRecursive(value: unknown, seen: WeakSet<object>): string[] {
  if (value === undefined) return [];
  if (value === null || typeof value !== "object") {
    return formatPrimitive(value);
  }
  if (seen.has(value)) {
    return ['"[Circular]"'];
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return formatArray(value, seen);
  }
  return formatObject(value as Record<string, unknown>, seen);
}

/** Recursively format a debug payload into readable, indented lines. */
export function formatDataLines(value: unknown): string[] {
  return formatDataLinesRecursive(value, new WeakSet<object>());
}
