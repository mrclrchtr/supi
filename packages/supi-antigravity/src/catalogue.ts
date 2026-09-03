import { StringEnum } from "@earendil-works/pi-ai";
import type { TSchema } from "typebox";
import type { CuratedModel } from "./types.ts";

/** Build the provider-facing enum from one discovered Model Catalogue. */
export function buildModelCatalogueEnum(catalogue: readonly CuratedModel[]): TSchema {
  if (catalogue.length === 0) {
    throw new Error("Cannot build an Antigravity model enum from an empty catalogue.");
  }
  return StringEnum([...catalogue] as [string, ...string[]], {
    description: "Curated Antigravity model available to the current account.",
  });
}

/** Check runtime model input against the same discovered catalogue. */
export function isAvailableCuratedModel(
  value: unknown,
  catalogue: readonly CuratedModel[],
): value is CuratedModel {
  return typeof value === "string" && catalogue.includes(value as CuratedModel);
}
