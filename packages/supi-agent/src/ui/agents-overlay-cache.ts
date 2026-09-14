import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import type { AgentConversationView } from "../tool/agent_run/conversation-view.ts";
import type { AgentsOverlayData } from "./agents-overlay-data.ts";
import { renderRunsSection } from "./agents-overlay-render.ts";
import type { AgentRunBlock } from "./agents-run-viewport.ts";

/** Cached fixed run rows and details for one data, selection, width, and list-size combination. */
export interface CachedRunSection {
  readonly data: AgentsOverlayData;
  readonly selectedIndex: number;
  readonly width: number;
  readonly listRows: number;
  readonly conversationKey: string;
  readonly conversationBlocks: readonly AgentRunBlock[];
  readonly lines: readonly string[];
  readonly blocks: readonly AgentRunBlock[];
}

interface RunSectionCacheOptions {
  readonly data: AgentsOverlayData;
  readonly selectedIndex: number;
  readonly width: number;
  readonly listRows: number;
  readonly theme: Theme;
}

/** Reuse wrapped run output while live progress changes other task details. */
export function renderCachedRunsSection(
  cached: CachedRunSection | undefined,
  options: RunSectionCacheOptions,
): CachedRunSection {
  if (
    cached?.data === options.data &&
    cached.selectedIndex === options.selectedIndex &&
    cached.width === options.width &&
    cached.listRows === options.listRows
  ) {
    return cached;
  }
  const selectedRun = options.data.runs[options.selectedIndex];
  const nextConversationKey = conversationFingerprint(selectedRun?.conversationView);
  const reusableConversation =
    cached?.width === options.width && cached.conversationKey === nextConversationKey
      ? cached.conversationBlocks
      : undefined;
  const container = new Container();
  const blocks = renderRunsSection({
    container,
    ...options,
    ...(reusableConversation === undefined ? {} : { conversationBlocks: reusableConversation }),
  });
  return {
    data: options.data,
    selectedIndex: options.selectedIndex,
    width: options.width,
    listRows: options.listRows,
    conversationKey: nextConversationKey,
    conversationBlocks: reusableConversation ?? blocks.slice(1),
    lines: container.render(options.width),
    blocks,
  };
}

function conversationFingerprint(view: AgentConversationView | undefined): string {
  if (!view) return "unavailable";
  return JSON.stringify([
    view.omittedEntryCount,
    view.omittedCharacterCount,
    view.textTruncated,
    view.entries,
  ]);
}
