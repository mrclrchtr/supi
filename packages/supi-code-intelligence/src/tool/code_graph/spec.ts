import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { CodeIntelToolExecCtx } from "../../types/index.ts";
import { GraphTargetParam, MaxResultsParam } from "../schemas.ts";
import { executeGraphTool } from "./execute.ts";
import { renderGraphCall, renderGraphResult } from "./tui.ts";

export const CODE_GRAPH_TOOL_NAME = "code_graph";
export const CODE_GRAPH_TOOL_LABEL = "Code Graph";

/** Canonical provider-facing metadata for the code_graph tool. */
export const codeGraphSpec = {
  name: CODE_GRAPH_TOOL_NAME,
  label: CODE_GRAPH_TOOL_LABEL,
  parameters: Type.Object(
    {
      target: GraphTargetParam,
      relations: Type.Optional(
        Type.Array(StringEnum(["all", "references", "callees", "implements"]), {
          description:
            'Requested relations; defaults to ["references"]. "all" must be the only item.',
          minItems: 1,
          uniqueItems: true,
        }),
      ),
      maxResults: Type.Optional(MaxResultsParam),
      calleeDepth: Type.Optional(
        StringEnum(["direct", "deep"], {
          description: "direct excludes nested scopes; deep includes them.",
        }),
      ),
    },
    { additionalProperties: false },
  ),
  run: (params: unknown, ctx: CodeIntelToolExecCtx) =>
    executeGraphTool(params as Parameters<typeof executeGraphTool>[0], ctx),
  renderCall: renderGraphCall,
  renderResult: renderGraphResult,
} as const;
