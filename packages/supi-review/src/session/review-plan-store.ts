import { randomUUID } from "node:crypto";
import type { PlannerDraft, ReviewModelSelection, ReviewSnapshot } from "../types.ts";

/** Session-local resolved target and model choices awaiting one execution decision. */
export interface StoredReviewPlan {
  id: string;
  snapshot: ReviewSnapshot;
  reviewerModel: ReviewModelSelection;
  plannerDraft?: PlannerDraft;
  plannerModelId?: string;
  plannerPromptVersion?: string;
}

/** In-memory one-shot store; `take` atomically removes a plan before validation/execution. */
export class ReviewPlanStore {
  readonly #plans = new Map<string, StoredReviewPlan>();

  create(input: Omit<StoredReviewPlan, "id">): StoredReviewPlan {
    const plan = { id: `review-plan-${randomUUID()}`, ...input };
    this.#plans.set(plan.id, plan);
    return plan;
  }

  take(id: string): StoredReviewPlan | undefined {
    const plan = this.#plans.get(id);
    if (plan) this.#plans.delete(id);
    return plan;
  }

  /** Read a plan without consuming it, for pre-execution task count display. */
  peek(id: string): StoredReviewPlan | undefined {
    return this.#plans.get(id);
  }

  clear(): void {
    this.#plans.clear();
  }
}
