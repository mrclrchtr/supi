import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ConversationHandleStore } from "../../conversation/handles.ts";
import type { IsolatedAntigravityPaths } from "../../isolated-home.ts";
import type { CuratedModel } from "../../types.ts";
import { makeAntigravityRunExecute } from "./execute.ts";
import { toolDescription } from "./guidance.ts";
import { renderAntigravityCall, renderAntigravityResult } from "./render.ts";
import { antigravityRunSpec, buildAntigravityRunParameters } from "./spec.ts";

/** Dependencies needed by the dynamically registered tool. */
export interface RegisterAntigravityRunOptions {
  pi: ExtensionAPI;
  paths: IsolatedAntigravityPaths;
  catalogue: readonly CuratedModel[];
  cliVersion: string;
  handles: ConversationHandleStore;
}

/** Register antigravity_run from one immutable Model Catalogue. */
export function registerAntigravityRunTool(options: RegisterAntigravityRunOptions): void {
  const parameters = buildAntigravityRunParameters(options.catalogue);
  options.pi.registerTool({
    ...antigravityRunSpec,
    description: toolDescription,
    parameters,
    renderCall: renderAntigravityCall,
    renderResult: renderAntigravityResult,
    execute: makeAntigravityRunExecute({
      pi: options.pi,
      paths: options.paths,
      catalogue: options.catalogue,
      cliVersion: options.cliVersion,
      handles: options.handles,
    }),
  });
}
