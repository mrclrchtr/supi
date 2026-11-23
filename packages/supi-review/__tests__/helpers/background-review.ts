import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  type BackgroundHarness,
  backgroundHarness,
  type ControlledSdk,
} from "@mrclrchtr/supi-test-utils/background";
import { expect, vi } from "vitest";
import reviewExtension from "../../src/review.ts";

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Linked worktrees besides the main checkout: Review Workspaces that still exist in Git. */
export function reviewWorktrees(cwd: string): string[] {
  return git(cwd, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .slice(1);
}

/** Initialize the parent directory as a Git repository with an uncommitted change. */
function prepareRepository(
  cwd: string,
  review: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
): void {
  git(cwd, "init");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  git(cwd, "config", "core.hooksPath", "/dev/null");
  // The harness keeps its agent directory, home, and Pi project config inside the repository.
  writeFileSync(join(cwd, ".gitignore"), "agent/\nhome/\n.pi/\nreplacement/\n");
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "base");
  writeFileSync(join(cwd, "tracked.txt"), "frozen\n");
  mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "supi", "config.json"),
    JSON.stringify({
      review: {
        agentModel: "current",
        recoveryModel: "disabled",
        reviewerCodemodeEnabled: false,
        reviewerWebEnabled: false,
        auditEnabled: false,
        bootstrapCommand: "",
        postReviewPolicy: "verify",
        ...review,
      },
      ...config,
    }),
  );
}

export const task = (id: string, mode: "change" | "state" = "change") => ({
  id,
  mode,
  instructions: `Review ${id} carefully.`,
});

export const finding = {
  title: "Frozen value is wrong",
  description: "tracked.txt should not say frozen.",
  blocksAcceptance: true,
  impact: "medium",
  effort: "small",
  confidence: 0.8,
};

/** Additional extensions and SuPi config sections loaded beside the Review extension. */
export interface ReviewHarnessExtras {
  readonly extensions?: readonly ((pi: ExtensionAPI) => void)[];
  readonly config?: Record<string, unknown>;
}

/** A background harness around the real Review extension and a real Git repository. */
export function reviewHarness(
  sdk: ControlledSdk,
  review: Record<string, unknown> = {},
  extras: ReviewHarnessExtras = {},
): Promise<BackgroundHarness> {
  return backgroundHarness({
    sdk,
    extension: (pi) => {
      reviewExtension(pi);
      for (const extension of extras.extensions ?? []) extension(pi);
    },
    childPrompt: (id) => `Review ${id} carefully.`,
    prepare: ({ directory }) => prepareRepository(directory, review, extras.config),
  });
}

/** The SDK inputs of one controlled Reviewer Session. */
export function reviewerInputs(sdk: ControlledSdk, current: BackgroundHarness, id: string) {
  const child = current.child(id);
  const call = sdk.createAgentSession.mock.calls.find(
    ([inputs]) => inputs.sessionManager === child.session.sessionManager,
  );
  if (!call) throw new Error(`Missing SDK inputs for ${id}.`);
  return { child, inputs: call[0] as { cwd: string; customTools: ToolDefinition[] } };
}

/** Submit a structured review through the child's real submit tool, then end its prompt. */
export async function submitReview(
  sdk: ControlledSdk,
  current: BackgroundHarness,
  id: string,
  findings: unknown[] = [],
) {
  const { child, inputs } = reviewerInputs(sdk, current, id);
  const submit = inputs.customTools.find((tool) => tool.name === "submit_review");
  if (!submit) throw new Error("Missing submit_review.");
  await submit.execute(
    "submit",
    { summary: `Reviewed ${id}.`, findings, criteriaCoverage: { status: "complete" } } as never,
    undefined,
    undefined,
    undefined as never,
  );
  child.finish(`Submitted ${id}.`);
}

export async function waitForReviewers(current: BackgroundHarness, count: number) {
  await vi.waitFor(() =>
    expect(current.children.filter((child) => child.session.isStreaming)).toHaveLength(count),
  );
}

export const text = (result: { content: { type: string; text?: string }[] }) =>
  result.content.map((part) => part.text ?? "").join("\n");
