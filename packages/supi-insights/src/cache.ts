// Cache management for supi-insights
// Stores extracted facets and session metadata to avoid re-processing.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SessionFacets, SessionMeta } from "./types.ts";

function getInsightsDir(): string {
  return join(getAgentDir(), "supi", "insights");
}

function getFacetsDir(): string {
  return join(getInsightsDir(), "facets");
}

function getMetaDir(): string {
  return join(getInsightsDir(), "meta");
}

/** Build a stable cache key from session id, file path, and version so branched/stale sessions do not collide. */
export function makeCacheKey(
  sessionId: string,
  filePath: string,
  version: number | string,
): string {
  return `${sessionId}_${djb2(filePath)}_${djb2(String(version))}`;
}

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).slice(0, 8);
}

export async function loadCachedFacets(cacheKey: string): Promise<SessionFacets | null> {
  try {
    const content = await readFile(join(getFacetsDir(), `${cacheKey}.json`), { encoding: "utf-8" });
    const parsed = JSON.parse(content) as unknown;
    if (!isValidSessionFacets(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCachedFacets(cacheKey: string, facets: SessionFacets): Promise<void> {
  const dir = getFacetsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${cacheKey}.json`), JSON.stringify(facets, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export async function loadCachedMeta(cacheKey: string): Promise<SessionMeta | null> {
  try {
    const content = await readFile(join(getMetaDir(), `${cacheKey}.json`), { encoding: "utf-8" });
    return JSON.parse(content) as SessionMeta;
  } catch {
    return null;
  }
}

export async function saveCachedMeta(cacheKey: string, meta: SessionMeta): Promise<void> {
  const dir = getMetaDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${cacheKey}.json`), JSON.stringify(meta, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export async function ensureInsightsDir(): Promise<void> {
  await mkdir(getInsightsDir(), { recursive: true });
}

function isValidSessionFacets(obj: unknown): obj is SessionFacets {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.underlyingGoal === "string" &&
    typeof o.outcome === "string" &&
    typeof o.briefSummary === "string" &&
    o.goalCategories !== null &&
    typeof o.goalCategories === "object" &&
    o.userSatisfactionCounts !== null &&
    typeof o.userSatisfactionCounts === "object" &&
    o.frictionCounts !== null &&
    typeof o.frictionCounts === "object"
  );
}
