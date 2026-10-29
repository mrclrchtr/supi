import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { expect } from "vitest";

/** Validate the actual registration's native result separately from Pi routing. */
export function expectStructuredContent(tool: unknown, result: unknown): Record<string, unknown> {
  const { outputSchema } = tool as { outputSchema?: TSchema };
  if (!outputSchema) throw new Error("Registered reader is missing outputSchema");
  const { structuredContent: data } = result as { structuredContent?: unknown };
  expect([...Value.Errors(outputSchema, data)]).toEqual([]);
  const serialized: unknown = JSON.parse(JSON.stringify(data));
  expect(serialized).toEqual(data);
  expect(Value.Check(outputSchema, serialized)).toBe(true);
  return data as Record<string, unknown>;
}
