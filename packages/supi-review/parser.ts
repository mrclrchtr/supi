import type { ReviewFinding, ReviewOutputEvent } from "./types.ts";

export function parseReviewOutput(text: string): ReviewOutputEvent {
  // Attempt 1: full JSON parse
  try {
    const parsed = JSON.parse(text.trim()) as unknown;
    if (isReviewOutputEvent(parsed)) {
      return normalizeReviewOutput(parsed);
    }
  } catch {
    // continue to fallback
  }

  // Attempt 2: extract first {...} substring
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]) as unknown;
      if (isReviewOutputEvent(parsed)) {
        return normalizeReviewOutput(parsed);
      }
    } catch {
      // continue to final fallback
    }
  }

  // Attempt 3: wrap entire text as explanation
  return {
    findings: [],
    overall_correctness: "review incomplete",
    overall_explanation: text.trim(),
    overall_confidence_score: 0.0,
  };
}

function isReviewOutputEvent(value: unknown): value is ReviewOutputEvent {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.findings) &&
    typeof obj.overall_correctness === "string" &&
    typeof obj.overall_explanation === "string" &&
    typeof obj.overall_confidence_score === "number"
  );
}

function normalizeReviewOutput(value: ReviewOutputEvent): ReviewOutputEvent {
  return {
    findings: Array.isArray(value.findings)
      ? value.findings.map(normalizeFinding).filter((f): f is ReviewFinding => f !== null)
      : [],
    overall_correctness:
      typeof value.overall_correctness === "string"
        ? value.overall_correctness
        : "review incomplete",
    overall_explanation:
      typeof value.overall_explanation === "string" ? value.overall_explanation : "",
    overall_confidence_score: clampNumber(value.overall_confidence_score, 0, 1),
  };
}

function normalizeFinding(value: unknown): ReviewFinding | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;

  return {
    title: stringOrEmpty(obj.title),
    body: stringOrEmpty(obj.body),
    confidence_score: clampNumber(obj.confidence_score, 0, 1),
    priority: clampPriority(obj.priority),
    code_location: parseCodeLocation(obj.code_location),
  };
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseCodeLocation(value: unknown): ReviewFinding["code_location"] {
  if (typeof value !== "object" || value === null) {
    return { absolute_file_path: "", line_range: { start: 1, end: 1 } };
  }
  const obj = value as Record<string, unknown>;
  return {
    absolute_file_path: stringOrEmpty(obj.absolute_file_path),
    line_range: parseLineRange(obj.line_range),
  };
}

function parseLineRange(value: unknown): { start: number; end: number } {
  if (typeof value !== "object" || value === null) return { start: 1, end: 1 };
  const obj = value as Record<string, unknown>;
  return {
    start: typeof obj.start === "number" ? Math.max(1, Math.floor(obj.start)) : 1,
    end: typeof obj.end === "number" ? Math.max(1, Math.floor(obj.end)) : 1,
  };
}

function clampNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clampPriority(value: unknown): 0 | 1 | 2 | 3 {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  const n = Math.max(0, Math.min(3, Math.floor(value)));
  return n as 0 | 1 | 2 | 3;
}
