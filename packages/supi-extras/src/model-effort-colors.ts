/**
 * Model/effort footer coloring for pi.
 *
 * Colors the model name in the footer by semantically mapping the provider
 * to PI theme tokens, and colors the thinking/effort level using PI's
 * built-in thinking-level theme tokens. No hardcoded hex colors, no
 * animations.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import {
  buildPwdLine,
  buildStatsLeft,
  colorContextPercent,
  type FooterData,
  type FooterTheme,
  gatherUsage,
  latestThinkingLevel,
  layoutRightSide,
  type ModelInfo,
  sanitizeStatusText,
  styleRightSide,
  type UsageEntry,
} from "./model-effort-colors-helpers.ts";

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function modelEffortColors(pi: ExtensionAPI) {
  let currentModel: unknown;
  let requestRender: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    currentModel = ctx.model;
    installFooter(ctx);
  });

  pi.on("model_select", (event, _ctx) => {
    currentModel = event.model;
    requestRender?.();
  });

  pi.on("thinking_level_select", (_event, _ctx) => {
    requestRender?.();
  });

  pi.on("session_shutdown", () => {
    currentModel = undefined;
    requestRender = undefined;
  });

  // ---- footer installation ----

  // biome-ignore lint/suspicious/noExplicitAny: ctx type from pi session_start handler is complex
  function installFooter(ctx: any) {
    ctx.ui.setFooter(
      (tui: { requestRender(): void }, theme: FooterTheme, footerData: FooterData) => {
        requestRender = () => tui.requestRender();
        const branchUnsub = footerData.onBranchChange(() => tui.requestRender());

        return {
          dispose() {
            branchUnsub();
            requestRender = undefined;
          },
          invalidate() {},
          render(width: number): string[] {
            const model = (currentModel ?? ctx.model) as ModelInfo | undefined;

            // Thinking level
            const thinkingLevel = resolveThinkingLevel(
              model,
              (pi as { getThinkingLevel?: () => string }).getThinkingLevel,
              ctx.sessionManager.getEntries(),
            );

            // Usage
            const usage = gatherUsage(ctx.sessionManager.getEntries() as ReadonlyArray<UsageEntry>);

            // Context window
            const contextUsage = ctx.getContextUsage() as
              | { percent?: number | null; contextWindow?: number }
              | undefined;
            const contextWindow = contextUsage?.contextWindow ?? model?.contextWindow ?? 0;
            const useSubscription = model
              ? ctx.modelRegistry.isUsingOAuth(
                  // biome-ignore lint/suspicious/noExplicitAny: pi Model<Api> type is generic
                  model as any,
                )
              : false;

            // Stats
            const statContribs = footerContributions
              .getByPlacement("stats")
              .map((c) => c.render())
              .filter(Boolean);
            const suffixContribs = footerContributions
              .getByPlacement("stats-end")
              .map((c) => c.render())
              .filter(Boolean);

            const rawStats = buildStatsLeft({
              contextWindow,
              percent: contextUsage?.percent ?? null,
              usage,
              useSubscription,
              extraParts: statContribs,
              suffixParts: suffixContribs,
            });

            let statsLeft = rawStats.text;
            let statsLeftWidth = visibleWidth(statsLeft);
            if (statsLeftWidth > width) {
              statsLeft = truncateToWidth(statsLeft, width, "...");
              statsLeftWidth = visibleWidth(statsLeft);
            }
            statsLeft = colorContextPercent(statsLeft, rawStats.contextPercentValue, theme);

            // Right side
            const right = styleRightSide({
              model,
              thinkingLevel,
              theme,
              statsLeftWidth,
              availableWidth: width,
            });
            const laidOut = layoutRightSide({
              plain: right.plain,
              styled: right.styled,
              statsLeftWidth,
              availableWidth: width,
            });

            // Path line + assembly
            const pwdLine = truncateToWidth(
              theme.fg(
                "dim",
                buildPwdLine({
                  cwd: ctx.sessionManager.getCwd(),
                  gitBranch: footerData.getGitBranch(),
                  sessionName: ctx.sessionManager.getSessionName(),
                }),
              ),
              width,
              theme.fg("dim", "..."),
            );

            const lines = [
              pwdLine,
              theme.fg("dim", statsLeft) + theme.fg("dim", laidOut.padding) + laidOut.styled,
            ];

            // Extension statuses
            buildStatusLine(lines, footerData, width, theme);

            return lines;
          },
        };
      },
    );
  }
}

/** Resolve the current thinking level. */
function resolveThinkingLevel(
  model: ModelInfo | undefined,
  getThinkingLevel: (() => string) | undefined,
  entries: ReadonlyArray<{ type: string; thinkingLevel?: string }>,
): string {
  if (!model?.reasoning) return "off";
  return getThinkingLevel?.() ?? latestThinkingLevel(entries);
}
function buildStatusLine(
  lines: string[],
  footerData: FooterData,
  width: number,
  theme: FooterTheme,
): void {
  const statuses = footerData.getExtensionStatuses();
  const legacyEntries =
    statuses.size > 0
      ? (Array.from(statuses.entries()) as Array<[string, string]>)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, text]) => sanitizeStatusText(text))
      : [];

  const contribEntries = footerContributions
    .getByPlacement("status")
    .map((c) => c.render())
    .filter(Boolean);

  const allEntries = [...legacyEntries, ...contribEntries];
  if (allEntries.length === 0) return;

  const statusLine = allEntries.join(" ");
  lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
}
