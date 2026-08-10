import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { ReviewAuditReference } from "../types.ts";
import type { ReviewAuditRecord, ReviewAuditRecordInput } from "./review-audit.ts";

/** Local replay files expire automatically after seven days. */
export const REVIEW_AUDIT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
/** Guard against an accidental unbounded raw replay write. */
export const REVIEW_AUDIT_MAX_BYTES = 50 * 1024 * 1024;

const AUDIT_ID_PREFIX = "review-audit-";
const AUDIT_ID_RE = /^review-audit-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface LocalReviewAuditStoreOptions {
  agentDir: string;
  now?: () => number;
}

/**
 * Stores raw reviewer replays outside the repository when capture is enabled.
 * Files and their containing directory are private to the current user.
 */
export class LocalReviewAuditStore {
  readonly #directory: string;
  readonly #now: () => number;

  constructor(options: LocalReviewAuditStoreOptions) {
    this.#directory = join(options.agentDir, "supi-review", "audits");
    this.#now = options.now ?? Date.now;
  }

  /** Persist one bounded replay and return its opaque retrieval identity. */
  async create(input: ReviewAuditRecordInput): Promise<ReviewAuditReference> {
    await this.#prepare();
    const artifactId = `${AUDIT_ID_PREFIX}${randomUUID()}`;
    const createdAt = this.#now();
    const expiresAt = createdAt + REVIEW_AUDIT_MAX_AGE_MS;
    const record: ReviewAuditRecord = {
      format: "supi-review-audit/v1",
      artifactId,
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      ...input,
    };
    const body = JSON.stringify(record, null, 2);
    if (Buffer.byteLength(body, "utf8") > REVIEW_AUDIT_MAX_BYTES) {
      throw new Error(`Reviewer replay exceeds the ${REVIEW_AUDIT_MAX_BYTES} byte local limit.`);
    }
    const target = this.#path(artifactId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, body, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
    await utimes(target, createdAt / 1_000, createdAt / 1_000);
    return { artifactId, expiresAt: record.expiresAt };
  }

  /** List non-expired local replay identities without loading their raw content. */
  async list(signal?: AbortSignal): Promise<ReviewAuditReference[]> {
    signal?.throwIfAborted();
    await this.#prune(signal);
    let entries: string[];
    try {
      entries = await readdir(this.#directory);
    } catch {
      signal?.throwIfAborted();
      return [];
    }
    signal?.throwIfAborted();
    const records = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json") && AUDIT_ID_RE.test(entry.slice(0, -5)))
        .map(async (entry) => {
          signal?.throwIfAborted();
          const info = await stat(join(this.#directory, entry));
          signal?.throwIfAborted();
          return {
            artifactId: entry.slice(0, -5),
            createdAt: info.mtimeMs,
            expiresAt: new Date(info.mtimeMs + REVIEW_AUDIT_MAX_AGE_MS).toISOString(),
          };
        }),
    );
    return records
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(({ artifactId, expiresAt }) => ({ artifactId, expiresAt }));
  }

  /** Return one raw replay file when it exists and has not expired. */
  async read(artifactId: string, signal?: AbortSignal): Promise<string | undefined> {
    if (!AUDIT_ID_RE.test(artifactId)) return undefined;
    signal?.throwIfAborted();
    await this.#prune(signal);
    try {
      return await readFile(this.#path(artifactId), { encoding: "utf8", signal });
    } catch {
      signal?.throwIfAborted();
      return undefined;
    }
  }

  #path(artifactId: string): string {
    return join(this.#directory, `${artifactId}.json`);
  }

  async #prepare(): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    await chmod(this.#directory, 0o700);
    await this.#prune();
  }

  async #prune(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    let entries: string[];
    try {
      entries = await readdir(this.#directory);
    } catch {
      signal?.throwIfAborted();
      return;
    }
    signal?.throwIfAborted();
    const cutoff = this.#now() - REVIEW_AUDIT_MAX_AGE_MS;
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json") || entry.endsWith(".tmp"))
        .map(async (entry) => {
          signal?.throwIfAborted();
          const path = join(this.#directory, entry);
          try {
            const info = await stat(path);
            signal?.throwIfAborted();
            if (info.mtimeMs <= cutoff) await rm(path, { force: true });
          } catch {
            signal?.throwIfAborted();
            // A concurrent cleanup or write does not affect review execution.
          }
        }),
    );
  }
}
