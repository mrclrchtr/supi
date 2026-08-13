import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSupiConfigPath } from "@mrclrchtr/supi-core/config";
import { readInvalidInvocationConfigNames } from "./skill-model-invocation-config.ts";

const INVALID_CONFIG_WARNING_KEY = Symbol.for(
  "@mrclrchtr/supi-skills/invalid-model-invocation-config",
);

function warningSessionId(ctx: ExtensionContext): string {
  const sessionManager = ctx.sessionManager as ExtensionContext["sessionManager"] & {
    getSessionId?: () => string;
  };
  return typeof sessionManager.getSessionId === "function"
    ? sessionManager.getSessionId()
    : `cwd:${ctx.cwd}`;
}

/** Show invalid config warnings once for each scope file in one PI session. */
export function notifyInvocationConfigWarnings(ctx: ExtensionContext, homeDir?: string): void {
  const invalidConfigs = readInvalidInvocationConfigNames(ctx.cwd, ctx.isProjectTrusted(), homeDir);
  const globalRecord = globalThis as Record<symbol, Set<string> | undefined>;
  const warned = globalRecord[INVALID_CONFIG_WARNING_KEY] ?? new Set<string>();
  globalRecord[INVALID_CONFIG_WARNING_KEY] = warned;
  const sessionId = warningSessionId(ctx);

  for (const { scope, names } of invalidConfigs) {
    const configPath = getSupiConfigPath(scope, ctx.cwd, { homeDir });
    const warningKey = `${sessionId}\0${configPath}`;
    if (warned.has(warningKey)) continue;
    warned.add(warningKey);

    const skillNames = names.sort((left, right) => left.localeCompare(right)).join(", ");
    const message = `Invalid skills config in ${configPath} for ${skillNames}. Invalid Model Invocation values are ignored.`;
    if (ctx.hasUI !== false) ctx.ui.notify(message, "warning");
    else {
      // biome-ignore lint/suspicious/noConsole: config warnings need a non-UI fallback
      console.warn(`[supi-skills] ${message}`);
    }
  }
}
