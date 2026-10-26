import { StringEnum } from "@earendil-works/pi-ai";
import type { DebugLevel } from "@mrclrchtr/supi-core/debug";
import { Type } from "typebox";

/** Shared Debug Operation ID constraint for filters and returned event identity. */
export const debugOperationIdSchema = Type.String({ pattern: "^op-[A-Za-z0-9_-]{21}[AQgw]$" });

/** Shared level vocabulary; StringEnum's string type is narrowed to the registry contract. */
export const debugLevelSchema = Type.Unsafe<DebugLevel>(
  StringEnum(["debug", "info", "warning", "error"]),
);
