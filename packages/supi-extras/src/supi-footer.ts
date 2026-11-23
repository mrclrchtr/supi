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
import {
  FOOTER_INVALIDATE_EVENT,
  type FooterPlacement,
  type FooterRenderContext,
  footerContributions,
} from "@mrclrchtr/supi-core/footer-registry";
import { formatGitCounts, GitCountsRefresher } from "./footer-git-status.ts";
import { type FooterGlyphs, getFooterGlyphs, resolveIconMode } from "./footer-icons.ts";
import { SessionIssueTracker } from "./session-issues.ts";
import {
  type FooterConfig,
  loadFooterConfig,
  registerFooterSettings,
} from "./supi-footer-config.ts";
import {
  buildModelSide,
  buildPwdLine,
  buildStatsLeft,
  type FooterData,
  type FooterTheme,
  gatherUsage,
  joinLeftRight,
  latestThinkingLevel,
  type ModelInfo,
  sanitizeStatusText,
  sectionSeparator,
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
    decor.start(ctx.sessionManager.getCwd(), ctx.sessionManager.getBranch());
    installFooter(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    decor.refreshIssues(ctx.sessionManager.getBranch());
    requestRender?.();
  });

  pi.on("message_end", (event) => {
    decor.onMessage(event.message);
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

            const style = (color: ThemeColor, text: string) => theme.fg(color, text);
            const ellipsis = theme.fg("dim", "...");
            const decorParts = decor.pwdParts(style);
            const renderContext: FooterRenderContext = {
              style,
              glyphMode: decorParts.glyphs?.mode ?? "unicode",
            };
            const contributions = (placement: FooterPlacement) =>
              footerContributions
                .getByPlacement(placement)
                .map((c) => c.render(renderContext))
                .filter(Boolean);

            // Session line: metrics left, model side right.
            let statsLeft = buildStatsLeft(
              {
                contextWindow,
                percent: contextUsage?.percent ?? null,
                usage,
                useSubscription,
                contextBar: decorParts.glyphs !== undefined && decorParts.glyphs.mode !== "ascii",
                extraParts: contributions("stats"),
                suffixParts: contributions("stats-end"),
              },
              style,
            );
            if (visibleWidth(statsLeft) > width) {
              statsLeft = truncateToWidth(statsLeft, width, ellipsis);
            }
            const modelSide = buildModelSide({
              model,
              thinkingLevel,
              theme,
              prefixParts: contributions("model-start"),
              maxWidth: width - visibleWidth(statsLeft) - 2,
            });

            // Workspace line: path and Git left, workspace state right.
            const pwdLeft = buildPwdLine({ ...pwdSource(ctx, footerData), ...decorParts }, style);
            const pwdRight = contributions("path-end").join(sectionSeparator(style));

            const lines = [
              joinLeftRight(pwdLeft, pwdRight, width, ellipsis),
              joinLeftRight(statsLeft, modelSide, width, ellipsis),
            ];
            buildStatusLine(lines, footerData, width, theme);

            return lines;
          },
        };
      },
    );
  }
}

/**
 * Icons, Git counts, and Session Issues for the path line.
 *
 * Owns the footer config, the resolved glyph set, the throttled Git reader,
 * and the Session Issue tracker. Tool executions request a Git refresh;
 * `agent_end` flushes pending work.
 */
function createFooterDecor(pi: ExtensionAPI, rerender: () => void) {
  let cwd: string | undefined;
  let config: FooterConfig | undefined;
  let glyphs: FooterGlyphs | undefined;
  const git = new GitCountsRefresher(rerender);
  const issues = new SessionIssueTracker(rerender);

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
    start(nextCwd: string, branch: ReadonlyArray<{ type: string; message?: unknown }>): void {
      cwd = nextCwd;
      git.dispose();
      apply(nextCwd);
      issues.start(nextCwd, branch);
    },
    stop(): void {
      cwd = undefined;
      git.dispose();
      issues.stop();
    },
    refreshGit,
    refreshIssues: (branch: ReadonlyArray<{ type: string; message?: unknown }>) =>
      issues.fromBranch(branch),
    onMessage: (message: unknown) => issues.onMessage(message),
    pwdParts(style: (color: ThemeColor, text: string) => string): {
      glyphs?: FooterGlyphs;
      gitStatus?: string;
      sessionIssues?: string;
    } {
      const counts = config?.gitStatus ? git.current : null;
      return {
        glyphs,
        gitStatus: counts && glyphs ? formatGitCounts(counts, glyphs, style) : undefined,
        sessionIssues: config?.issueLink
          ? issues.render((text) => style("accent", text))
          : undefined,
      };
    },
  };
}

function registerFooterInvalidations(pi: ExtensionAPI, invalidate: () => void): Array<() => void> {
  return [
    // Deprecated: Code Intelligence 13.0 and earlier emit this LSP-specific event.
    // Remove once mixed installs with those versions are no longer supported.
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
/** A contribution outside the status line may use the same key for its built-in-footer fallback. */
function isFooterLineContribution(key: string): boolean {
  return footerContributions
    .getAll()
    .some((item) => item.key === key && item.placement !== "status");
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
          .filter(([key]) => !isFooterLineContribution(key))
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
