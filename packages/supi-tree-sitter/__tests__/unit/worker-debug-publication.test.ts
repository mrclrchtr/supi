import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, describe, expect, it } from "vitest";
import { publishStructuralTimingEvent } from "../../src/session/structural-timing.ts";

afterEach(() => resetDebugRegistry());

describe("Structural Worker debug publication", () => {
  it("records only the validated sanitized timing shape in the parent registry", () => {
    configureDebugRegistry({ enabled: true, maxEvents: 10 });
    const operationId = "op-AAAAAAAAAAAAAAAAAAAAAA";
    publishStructuralTimingEvent({
      operationId,
      source: "tree-sitter",
      level: "debug",
      category: "structural.query.timing",
      message: "Tree-sitter query completed",
      data: {
        operation: "query",
        grammar: "typescript",
        outcome: "completed",
        captureCount: 2,
        cache: { state: "hit", retained: true, evictionCount: 0 },
        timing: { durationMs: 1.2, phasesMs: { "query-execution": 1.2 } },
      },
    });

    const event = getDebugEvents({ source: "tree-sitter" }).events[0];
    expect(event).toEqual(
      expect.objectContaining({
        operationId,
        category: "structural.query.timing",
        data: expect.objectContaining({ captureCount: 2 }),
      }),
    );
    expect(JSON.stringify(event)).not.toMatch(/source text|query text|\/workspace/);
  });
});
