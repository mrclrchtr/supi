import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { expect } from "vitest";

/** Check the actual registration contract, including its JSON-serialized representation. */
export function expectStructuredContent<T>(tool: unknown, result: unknown): T {
  const { outputSchema } = tool as { outputSchema?: TSchema };
  if (!outputSchema) throw new Error("Registered tool is missing outputSchema");
  const { structuredContent } = result as { structuredContent?: unknown };
  expect(Value.Check(outputSchema, structuredContent)).toBe(true);
  const serialized: unknown = JSON.parse(JSON.stringify(structuredContent));
  expect(serialized).toEqual(structuredContent);
  expect(Value.Check(outputSchema, serialized)).toBe(true);
  return serialized as T;
}
