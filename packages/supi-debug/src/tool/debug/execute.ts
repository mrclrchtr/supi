import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isDebugOperationId } from "@mrclrchtr/supi-core/debug";
import { applyDebugConfig } from "../../config.ts";
import type { DebugToolParams } from "../../query.ts";
import { buildToolResult } from "./result.ts";

type DebugExecute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Build the debug tool execute function. */
export function makeDebugExecute(): DebugExecute {
  // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
  return async (_toolCallId, params, signal, onUpdate, ctx) => {
    const query = params as DebugToolParams;
    if (query.operationId !== undefined && !isDebugOperationId(query.operationId)) {
      throw new Error("Invalid Debug Operation ID");
    }
    const config = applyDebugConfig(ctx.cwd);
    return buildToolResult(query, { config, cwd: ctx.cwd, signal, onUpdate });
  };
}
