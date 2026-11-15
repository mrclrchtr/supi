/**
 * SuPi footer for pi.
 *
 * Replaces pi's default footer. Colors the model name by provider using
 * theme tokens, delegates thinking-level coloring to Pi's
 * theme.getThinkingBorderColor, and integrates stats contributions from
 * the footer registry. No hardcoded hex colors, no animations.
 */
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { FOOTER_INVALIDATE_EVENT, footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import { formatGitCounts, GitCountsRefresher } from "./footer-git-status.ts";
import { type FooterGlyphs, getFooterGlyphs, resolveIconMode } from "./footer-icons.ts";
import {
  type FooterConfig,
  loadFooterConfig,
  registerFooterSettings,
} from "./supi-footer-config.ts";
import {
  buildPwdLine,
  buildStatsLeft,
  type FooterData,
  type FooterTheme,
  gatherUsage,
  latestThinkingLevel,
  layoutRightSide,
  type ModelInfo,
  sanitizeStatusText,
  styleRightSide,
  type UsageEntry,
} from "./supi-footer-helpers.ts";

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function supiFooter(pi: ExtensionAPI) {
  let currentModel: unknown;
  let requestRender: (() => void) | undefined;
  let unregisterInvalidates: Array<() => void> | undefined;
  const decor = createFooterDecor(pi, () => requestRender?.());

  pi.on("session_start", (_event, ctx) => {
    currentModel = ctx.model;
    unregisterInvalidates ??= registerFooterInvalidations(pi, () => requestRender?.());
    decor.start(ctx.sessionManager.getCwd());
    installFooter(ctx);
  });

  pi.on("model_select", (event, _ctx) => {
    currentModel = event.model;
    requestRender?.();
  });

  pi.on("thinking_level_select", () => {
    requestRender?.();
  });

  pi.on("session_shutdown", () => {
    currentModel = undefined;
    requestRender = undefined;
    decor.stop();
    for (const unregister of unregisterInvalidates ?? []) unregister();
    unregisterInvalidates = undefined;
  });

  // biome-ignore lint/suspicious/noExplicitAny: ctx type from pi session_start handler is complex
  function installFooter(ctx: any) {
    ctx.ui.setFooter(
      (tui: { requestRender(): void }, theme: FooterTheme, footerData: FooterData) => {
        requestRender = () => tui.requestRender();
        const branchUnsub = footerData.onBranchChange(() => {
          decor.refreshGit(true);
          tui.requestRender();
        });

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

            const style = (color: ThemeColor, text: string) => theme.fg(color, text);
            const decorParts = decor.pwdParts(style);
            let statsLeft = buildStatsLeft(
              {
                contextWindow,
                percent: contextUsage?.percent ?? null,
                usage,
                useSubscription,
                contextBar: decorParts.glyphs !== undefined && decorParts.glyphs.mode !== "ascii",
                extraParts: statContribs,
                suffixParts: suffixContribs,
              },
              style,
            );
            let statsLeftWidth = visibleWidth(statsLeft);
            if (statsLeftWidth > width) {
              statsLeft = truncateToWidth(statsLeft, width, theme.fg("dim", "..."));
              statsLeftWidth = visibleWidth(statsLeft);
            }

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
              buildPwdLine({ ...pwdSource(ctx, footerData), ...decorParts }, style),
              width,
              theme.fg("dim", "..."),
            );

            const statsLine = statsLeft + laidOut.padding + laidOut.styled;

            const lines = [pwdLine, truncateToWidth(statsLine, width, theme.fg("dim", "..."))];
            buildStatusLine(lines, footerData, width, theme);

            return lines;
          },
        };
      },
    );
  }
}

/**
 * Icons and Git counts for the path line.
 *
 * Owns the footer config, the resolved glyph set, and the throttled Git
 * reader. Tool executions request a refresh; `agent_end` flushes pending work.
 */
function createFooterDecor(pi: ExtensionAPI, rerender: () => void) {
  let cwd: string | undefined;
  let config: FooterConfig | undefined;
  let glyphs: FooterGlyphs | undefined;
  const git = new GitCountsRefresher(rerender);

  function apply(nextCwd: string): void {
    config = loadFooterConfig(nextCwd);
    glyphs = getFooterGlyphs(resolveIconMode(config.icons));
    if (config.gitStatus) git.request(nextCwd, true);
    else git.dispose();
  }

  function refreshGit(immediate = false): void {
    if (cwd && config?.gitStatus) git.request(cwd, immediate);
  }

  registerFooterSettings(pi, () => {
    if (!cwd) return;
    apply(cwd);
    rerender();
  });
  pi.on("tool_execution_end", () => refreshGit());
  pi.on("agent_end", () => git.flush());

  return {
    start(nextCwd: string): void {
      cwd = nextCwd;
      git.dispose();
      apply(nextCwd);
    },
    stop(): void {
      cwd = undefined;
      git.dispose();
    },
    refreshGit,
    pwdParts(style: (color: ThemeColor, text: string) => string): {
      glyphs?: FooterGlyphs;
      gitStatus?: string;
    } {
      const counts = config?.gitStatus ? git.current : null;
      return {
        glyphs,
        gitStatus: counts && glyphs ? formatGitCounts(counts, glyphs, style) : undefined,
      };
    },
  };
}

function registerFooterInvalidations(pi: ExtensionAPI, invalidate: () => void): Array<() => void> {
  return [
    pi.events.on("supi:lsp:invalidate", invalidate),
    pi.events.on(FOOTER_INVALIDATE_EVENT, invalidate),
  ];
}

/** Session-derived inputs for the path line. */
function pwdSource(
  ctx: { sessionManager: { getCwd(): string; getSessionName(): string | undefined } },
  footerData: FooterData,
) {
  return {
    cwd: ctx.sessionManager.getCwd(),
    gitBranch: footerData.getGitBranch(),
    sessionName: ctx.sessionManager.getSessionName(),
  };
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
function isStatsLineContribution(key: string): boolean {
  return (
    footerContributions.getByPlacement("stats").some((item) => item.key === key) ||
    footerContributions.getByPlacement("stats-end").some((item) => item.key === key)
  );
}

function buildStatusLine(
  lines: string[],
  footerData: FooterData,
  width: number,
  theme: FooterTheme,
): void {
  const statuses = footerData.getExtensionStatuses();
  // A stats-line contribution may use the same key for the built-in footer fallback.
  const legacyEntries =
    statuses.size > 0
      ? (Array.from(statuses.entries()) as Array<[string, string]>)
          .filter(([key]) => !isStatsLineContribution(key))
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
