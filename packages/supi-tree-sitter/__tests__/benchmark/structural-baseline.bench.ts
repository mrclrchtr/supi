import { resolve } from "node:path";
import { configureDebugRegistry, resetDebugRegistry } from "@mrclrchtr/supi-core/debug";
import { afterAll, beforeAll, bench, describe } from "vitest";
import { createTreeSitterSession, type TreeSitterSession } from "../../src/api.ts";

const FIXTURE_DIR = resolve(import.meta.dirname, "../fixtures");
const FIXTURE_FILE = "structural-baseline.ts";
const BENCHMARK_OPTIONS = { iterations: 10, time: 500 };

let repeatedSession: TreeSitterSession;

beforeAll(async () => {
  configureDebugRegistry({ enabled: true, maxEvents: 10_000 });
  repeatedSession = createTreeSitterSession(FIXTURE_DIR);
  const outlineWarmup = await repeatedSession.outline(FIXTURE_FILE);
  if (outlineWarmup.kind !== "success") {
    throw new Error(`Structural outline warmup failed: ${outlineWarmup.message}`);
  }
  const queryWarmup = await repeatedSession.callSites(FIXTURE_FILE);
  if (queryWarmup.kind !== "success") {
    throw new Error(`Structural query warmup failed: ${queryWarmup.message}`);
  }
});

afterAll(() => {
  repeatedSession.dispose();
  resetDebugRegistry();
});

describe("representative structural operation baselines", () => {
  bench(
    "cold parser and outline",
    async () => {
      const session = createTreeSitterSession(FIXTURE_DIR);
      try {
        const result = await session.outline(FIXTURE_FILE);
        if (result.kind !== "success") throw new Error(`Cold outline failed: ${result.message}`);
      } finally {
        session.dispose();
      }
    },
    BENCHMARK_OPTIONS,
  );

  bench(
    "repeated parsed tree and outline",
    async () => {
      const result = await repeatedSession.outline(FIXTURE_FILE);
      if (result.kind !== "success") throw new Error(`Repeated outline failed: ${result.message}`);
    },
    BENCHMARK_OPTIONS,
  );

  bench(
    "cold parser, query compilation, and call sites",
    async () => {
      const session = createTreeSitterSession(FIXTURE_DIR);
      try {
        const result = await session.callSites(FIXTURE_FILE);
        if (result.kind !== "success") throw new Error(`Cold call sites failed: ${result.message}`);
      } finally {
        session.dispose();
      }
    },
    BENCHMARK_OPTIONS,
  );

  bench(
    "repeated parsed tree, compiled query, and call sites",
    async () => {
      const result = await repeatedSession.callSites(FIXTURE_FILE);
      if (result.kind !== "success") {
        throw new Error(`Repeated call sites failed: ${result.message}`);
      }
    },
    BENCHMARK_OPTIONS,
  );
});
