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
  const warmup = await repeatedSession.outline(FIXTURE_FILE);
  if (warmup.kind !== "success") throw new Error(`Structural warmup failed: ${warmup.message}`);
});

afterAll(() => {
  repeatedSession.dispose();
  resetDebugRegistry();
});

describe("representative structural outline baselines", () => {
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
    "repeated parser and outline",
    async () => {
      const result = await repeatedSession.outline(FIXTURE_FILE);
      if (result.kind !== "success") throw new Error(`Repeated outline failed: ${result.message}`);
    },
    BENCHMARK_OPTIONS,
  );
});
