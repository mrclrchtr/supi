import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { ReviewWorkspaceCleanupCandidate } from "../workspace/review-workspace-cleanup.ts";

const MAX_VISIBLE_CANDIDATES = 10;

function ownerLabel(owner: ReviewWorkspaceCleanupCandidate["owner"]): string {
  if (owner === "active") return "owner active";
  if (owner === "absent") return "owner absent";
  return "owner unknown";
}

/** Theme-aware multi-select picker for explicitly removing marked Review Workspaces. */
export class ReviewWorkspaceCleanupPicker implements Component {
  #selected = 0;
  readonly #checked = new Set<string>();

  constructor(
    readonly candidates: readonly ReviewWorkspaceCleanupCandidate[],
    readonly theme: Theme,
    readonly requestRender: () => void,
    readonly done: (selection: string[] | null) => void,
  ) {}

  /** Selected Review Workspace paths in the inventory's stable order. */
  get selection(): string[] {
    return this.candidates
      .filter((candidate) => this.#checked.has(candidate.workspacePath))
      .map((candidate) => candidate.workspacePath);
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") this.#move(-1);
    else if (matchesKey(data, Key.down) || data === "j") this.#move(1);
    else if (data === " ") this.#toggle();
    else if (matchesKey(data, Key.enter)) this.done(this.selection);
    else if (matchesKey(data, Key.escape)) this.done(null);
    else return;
    this.requestRender();
  }

  render(width: number): string[] {
    const lines = [
      this.theme.fg("accent", this.theme.bold(" Review Workspace Cleanup")),
      this.theme.fg("dim", " Select SuPi-marked linked worktrees to remove"),
    ];
    const start = Math.max(
      0,
      Math.min(this.#selected - MAX_VISIBLE_CANDIDATES + 1, this.candidates.length),
    );
    const visible = this.candidates.slice(start, start + MAX_VISIBLE_CANDIDATES);
    for (const [offset, candidate] of visible.entries()) {
      const index = start + offset;
      const selected = index === this.#selected;
      const checked = this.#checked.has(candidate.workspacePath);
      const prefix = selected ? "›" : " ";
      const mark = checked ? "●" : "○";
      const owner = ownerLabel(candidate.owner);
      const line = `${prefix} ${mark} ${candidate.workspacePath}  ${owner}`;
      lines.push(
        truncateToWidth(
          selected ? this.theme.fg("accent", line) : this.theme.fg("text", line),
          width,
        ),
      );
    }
    lines.push(
      this.theme.fg("dim", " ↑↓/j k navigate · Space toggle · Enter continue · Esc cancel"),
    );
    return lines.map((line) => truncateToWidth(line, width));
  }

  #move(delta: number): void {
    if (this.candidates.length === 0) return;
    this.#selected = (this.#selected + delta + this.candidates.length) % this.candidates.length;
  }

  #toggle(): void {
    const candidate = this.candidates[this.#selected];
    if (!candidate) return;
    if (this.#checked.has(candidate.workspacePath)) this.#checked.delete(candidate.workspacePath);
    else this.#checked.add(candidate.workspacePath);
  }
}
