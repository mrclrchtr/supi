import { StringEnum } from "@earendil-works/pi-ai";
import type { TSchema } from "typebox";

/** Build a provider-facing model enum from one immutable agent catalogue. */
export function buildModelCatalogueEnum(catalogue: readonly string[]): TSchema {
  if (catalogue.length === 0) {
    throw new Error("Cannot build a model enum from an empty Consulting Agent catalogue.");
  }
  return StringEnum([...catalogue] as [string, ...string[]], {
    description: "Model available in the current Consulting Agent catalogue.",
  });
}

/** Check a model ID against the same discovered catalogue used by the schema. */
export function isAvailableModel(value: unknown, catalogue: readonly string[]): value is string {
  return typeof value === "string" && catalogue.includes(value);
}
