import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { rejectGitArgs, runGitQuery } from "./execute.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { buildGitResult } from "./result.ts";
import { gitSpec } from "./spec.ts";

/** Child-only extension factory that registers the read-only Git tool. */
export function registerGitTool(pi: ExtensionAPI): void {
  pi.registerTool({
    ...gitSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
    // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
    async execute(_callId, params, signal, _onUpdate, ctx) {
      if (!Value.Check(gitSpec.parameters, params)) throw new Error("Invalid git input.");
      const rejection = rejectGitArgs(params.args);
      if (rejection) throw new Error(rejection);
      return buildGitResult(params.args, await runGitQuery(ctx.cwd, params.args, signal));
    },
  });
}
