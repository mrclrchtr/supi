import { randomUUID } from "node:crypto";
import type { Usage } from "@earendil-works/pi-ai";
import type {
  PlannerDraft,
  PlannerRunResult,
  ReviewModelSelection,
  ReviewSnapshot,
} from "../types.ts";

/** Session-local resolved target and model choices awaiting an execution decision. */
export interface StoredReviewPlan {
  id: string;
  snapshot: ReviewSnapshot;
  reviewerModel: ReviewModelSelection;
  plannerDraft?: PlannerDraft;
  plannerModelId?: string;
  plannerPromptVersion?: string;
  plannerUsage?: Usage;
  /** Bounded advisory Planner outcome retained when no draft was produced. */
  plannerFailure?: Exclude<PlannerRunResult, { kind: "success" }>;
}

interface PlanEntry {
  plan: StoredReviewPlan;
  createdAt: number;
  leaseToken?: string;
}

export interface ReviewPlanStoreOptions {
  maxPlans?: number;
  maxAgeMs?: number;
  now?: () => number;
}

/** Opaque lease that prevents concurrent execution of one Prepared Review Plan. */
export interface ReviewPlanLease {
  plan: StoredReviewPlan;
  token: string;
}

/** Session-local plan store with explicit available, running, and consumed transitions. */
export class ReviewPlanStore {
  readonly #plans = new Map<string, PlanEntry>();
  readonly #maxPlans: number;
  readonly #maxAgeMs: number;
  readonly #now: () => number;

  constructor(options: ReviewPlanStoreOptions = {}) {
    this.#maxPlans = options.maxPlans ?? 32;
    this.#maxAgeMs = options.maxAgeMs ?? 30 * 60 * 1_000;
    this.#now = options.now ?? Date.now;
  }

  create(input: Omit<StoredReviewPlan, "id">): StoredReviewPlan {
    this.#pruneExpired();
    while (this.#plans.size >= this.#maxPlans) {
      if (!this.#evictOldestAvailable()) {
        throw new Error("Too many Review Plans are currently running in this session.");
      }
    }
    const plan = { id: `review-plan-${randomUUID()}`, ...input };
    this.#plans.set(plan.id, { plan, createdAt: this.#now() });
    return plan;
  }

  /** Read an available plan without leasing or consuming it. */
  peek(id: string): StoredReviewPlan | undefined {
    this.#pruneExpired();
    const entry = this.#plans.get(id);
    return entry && !entry.leaseToken ? entry.plan : undefined;
  }

  /** Atomically mark an available plan as running. */
  acquire(id: string): ReviewPlanLease | undefined {
    this.#pruneExpired();
    const entry = this.#plans.get(id);
    if (!entry || entry.leaseToken) return undefined;
    const token = randomUUID();
    entry.leaseToken = token;
    return { plan: entry.plan, token };
  }

  /** Make a running plan available again when no task produced a structured review. */
  release(lease: ReviewPlanLease): boolean {
    const entry = this.#plans.get(lease.plan.id);
    if (!entry || entry.leaseToken !== lease.token) return false;
    entry.leaseToken = undefined;
    entry.createdAt = this.#now();
    return true;
  }

  /** Permanently consume a running plan after at least one task completes. */
  consume(lease: ReviewPlanLease): boolean {
    const entry = this.#plans.get(lease.plan.id);
    if (!entry || entry.leaseToken !== lease.token) return false;
    this.#plans.delete(lease.plan.id);
    return true;
  }

  clear(): void {
    this.#plans.clear();
  }

  #pruneExpired(): void {
    const cutoff = this.#now() - this.#maxAgeMs;
    for (const [id, entry] of this.#plans) {
      if (!entry.leaseToken && entry.createdAt <= cutoff) this.#plans.delete(id);
    }
  }

  #evictOldestAvailable(): boolean {
    for (const [id, entry] of this.#plans) {
      if (entry.leaseToken) continue;
      this.#plans.delete(id);
      return true;
    }
    return false;
  }
}
