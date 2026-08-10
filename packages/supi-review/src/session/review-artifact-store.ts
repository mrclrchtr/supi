import { randomUUID } from "node:crypto";
import { pageText, type TextPage } from "../tool/output-page.ts";

const DEFAULT_MAX_ARTIFACTS = 8;
const DEFAULT_MAX_TOTAL_CHARACTERS = 2_000_000;
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1_000;

interface ArtifactEntry {
  id: string;
  text: string;
  createdAt: number;
}

export interface ReviewArtifactStoreOptions {
  maxArtifacts?: number;
  maxTotalCharacters?: number;
  maxAgeMs?: number;
  now?: () => number;
}

export interface ReviewArtifact {
  id: string;
  totalCharacters: number;
}

/** Bounded session-local store for resumable parent-facing review output. */
export class ReviewArtifactStore {
  readonly #entries = new Map<string, ArtifactEntry>();
  readonly #maxArtifacts: number;
  readonly #maxTotalCharacters: number;
  readonly #maxAgeMs: number;
  readonly #now: () => number;
  #totalCharacters = 0;

  constructor(options: ReviewArtifactStoreOptions = {}) {
    this.#maxArtifacts = options.maxArtifacts ?? DEFAULT_MAX_ARTIFACTS;
    this.#maxTotalCharacters = options.maxTotalCharacters ?? DEFAULT_MAX_TOTAL_CHARACTERS;
    this.#maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.#now = options.now ?? Date.now;
  }

  /** Store complete formatted output and return its opaque retrieval identity. */
  create(text: string): ReviewArtifact {
    if (text.length > this.#maxTotalCharacters) {
      throw new Error(
        `Review output exceeds the session artifact limit of ${this.#maxTotalCharacters} characters.`,
      );
    }
    this.#pruneExpired();
    while (
      this.#entries.size >= this.#maxArtifacts ||
      this.#totalCharacters + text.length > this.#maxTotalCharacters
    ) {
      if (!this.#evictOldest()) break;
    }
    const entry = {
      id: `review-output-${randomUUID()}`,
      text,
      createdAt: this.#now(),
    };
    this.#entries.set(entry.id, entry);
    this.#totalCharacters += text.length;
    return { id: entry.id, totalCharacters: text.length };
  }

  /** Read one page without consuming the artifact so callers may retry pages. */
  read(id: string, offset?: number, limit?: number, maxLines?: number): TextPage | undefined {
    this.#pruneExpired();
    const entry = this.#entries.get(id);
    return entry ? pageText(entry.text, offset, limit, maxLines) : undefined;
  }

  clear(): void {
    this.#entries.clear();
    this.#totalCharacters = 0;
  }

  #pruneExpired(): void {
    const cutoff = this.#now() - this.#maxAgeMs;
    for (const entry of this.#entries.values()) {
      if (entry.createdAt > cutoff) continue;
      this.#delete(entry);
    }
  }

  #evictOldest(): boolean {
    const oldest = this.#entries.values().next().value as ArtifactEntry | undefined;
    if (!oldest) return false;
    this.#delete(oldest);
    return true;
  }

  #delete(entry: ArtifactEntry): void {
    if (!this.#entries.delete(entry.id)) return;
    this.#totalCharacters -= entry.text.length;
  }
}
