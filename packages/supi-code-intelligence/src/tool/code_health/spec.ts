import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { ScopeParam } from "../schemas.ts";
import { executeHealthTool } from "./execute.ts";
import { renderHealthCall, renderHealthResult } from "./tui.ts";

export const CODE_HEALTH_TOOL_NAME = "code_health";
export const CODE_HEALTH_TOOL_LABEL = "Code Health";

/** Canonical provider-facing metadata for the code_health tool. */
export const codeHealthSpec = {
  name: CODE_HEALTH_TOOL_NAME,
  label: CODE_HEALTH_TOOL_LABEL,
  parameters: Type.Object(
    {
      scope: Type.Optional(ScopeParam),
      refresh: Type.Optional(
        Type.Boolean({
          description: "Attempt diagnostic recovery before collecting; result reports the outcome.",
        }),
      ),
      include: Type.Optional(
        Type.Array(StringEnum(["diagnostics", "servers"]), {
          description: "Requested health-signal sections.",
          uniqueItems: true,
        }),
      ),
      level: Type.Optional(
        StringEnum(["summary", "detailed"], {
          description: "Detail level for the health report.",
        }),
      ),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeHealthTool(params as Parameters<typeof executeHealthTool>[0], ctx),
  renderCall: renderHealthCall,
  renderResult: renderHealthResult,
} as const;
