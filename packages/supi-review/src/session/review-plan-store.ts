import { createHash } from "node:crypto";
import type { ReviewModelSelection, ReviewSnapshot, SynthesizedReviewBrief } from "../types.ts";

/** Session-scoped state retained between review preparation and execution. */
export interface StoredAgentReviewPlan {
  id: string;
  snapshot: ReviewSnapshot;
  snapshotFingerprint: string;
  generatedBrief: SynthesizedReviewBrief;
  model: ReviewModelSelection;
  briefPromptVersion: string;
  createdAt: number;
}

/** Inputs retained when creating a session-scoped review plan. */
export interface CreateAgentReviewPlanInput {
  snapshot: ReviewSnapshot;
  snapshotFingerprint: string;
  generatedBrief: SynthesizedReviewBrief;
  model: ReviewModelSelection;
  briefPromptVersion: string;
}

/**
 * Owns prepared review plans for one PI extension session.
 *
 * Plans are claimed atomically before reviewer child sessions start, preventing
 * duplicate runs from concurrent sibling tool calls.
 */
export class ReviewPlanStore {
  readonly #plans = new Map<string, StoredAgentReviewPlan>();
  #sequence = 0;

  /** Create and retain one prepared review plan. */
  create(input: CreateAgentReviewPlanInput): StoredAgentReviewPlan {
    const createdAt = Date.now();
    const id = this.createPlanId(input.snapshotFingerprint, createdAt);
    const plan: StoredAgentReviewPlan = { id, createdAt, ...input };
    this.#plans.set(id, plan);
    return plan;
  }

  /** Read a plan without consuming it. */
  get(id: string): StoredAgentReviewPlan | undefined {
    return this.#plans.get(id);
  }

  /** Atomically consume a plan so it can run at most once. */
  take(id: string): StoredAgentReviewPlan | undefined {
    const plan = this.#plans.get(id);
    if (!plan) return undefined;
    this.#plans.delete(id);
    return plan;
  }

  /** Remove all plans when PI replaces or reloads the session. */
  clear(): void {
    this.#plans.clear();
  }

  private createPlanId(snapshotFingerprint: string, createdAt: number): string {
    this.#sequence++;
    const hash = createHash("sha256")
      .update(`${snapshotFingerprint}:${createdAt}:${this.#sequence}`)
      .digest("hex")
      .slice(0, 12);
    return `review-plan-${hash}`;
  }
}
