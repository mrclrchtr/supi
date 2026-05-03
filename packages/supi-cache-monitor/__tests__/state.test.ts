import { describe, expect, it } from "vitest";
import { CacheMonitorState } from "../state.ts";

describe("CacheMonitorState", () => {
  describe("recordTurn", () => {
    it("computes hitRate correctly", () => {
      const state = new CacheMonitorState();
      const turn = state.recordTurn({ cacheRead: 8000, cacheWrite: 2000, input: 2000 }, 1000);
      expect(turn.hitRate).toBe(80); // 8000 / (8000 + 2000) = 0.8
      expect(turn.turnIndex).toBe(1);
    });

    it("returns undefined hitRate when cacheRead + input === 0", () => {
      const state = new CacheMonitorState();
      const turn = state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 0 }, 1000);
      expect(turn.hitRate).toBeUndefined();
    });

    it("returns 0% hitRate when cacheRead === 0 but cacheWrite > 0", () => {
      const state = new CacheMonitorState();
      const turn = state.recordTurn({ cacheRead: 0, cacheWrite: 500, input: 5000 }, 1000);
      expect(turn.hitRate).toBe(0);
    });

    it("returns undefined hitRate when cacheRead === 0 and cacheWrite === 0 but input > 0", () => {
      const state = new CacheMonitorState();
      const turn = state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 5000 }, 1000);
      expect(turn.hitRate).toBeUndefined();
    });

    it("marks first turn as cold start", () => {
      const state = new CacheMonitorState();
      const turn = state.recordTurn({ cacheRead: 0, cacheWrite: 5000, input: 5000 }, 1000);
      expect(turn.note).toBe("cold start");
    });

    it("increments turnIndex", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 1000 }, 1000);
      const turn2 = state.recordTurn({ cacheRead: 500, cacheWrite: 0, input: 500 }, 2000);
      expect(turn2.turnIndex).toBe(2);
    });

    it("rounds hitRate to nearest integer", () => {
      const state = new CacheMonitorState();
      const turn = state.recordTurn({ cacheRead: 333, cacheWrite: 0, input: 667 }, 1000);
      expect(turn.hitRate).toBe(33); // 333/1000 = 0.333 → 33%
    });
  });

  describe("cacheSupported", () => {
    it("starts as false", () => {
      const state = new CacheMonitorState();
      expect(state.cacheSupported).toBe(false);
    });

    it("becomes true when cacheRead > 0", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 100 }, 1000);
      expect(state.cacheSupported).toBe(true);
    });

    it("becomes true when cacheWrite > 0", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 0, cacheWrite: 100, input: 100 }, 1000);
      expect(state.cacheSupported).toBe(true);
    });

    it("stays false when all cache values are 0", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 100 }, 1000);
      expect(state.cacheSupported).toBe(false);
    });
  });

  describe("cause tracking", () => {
    it("annotates compaction on next turn", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
      state.flagCompaction();
      const turn = state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 9900 }, 2000);
      expect(turn.note).toBe("⚠ compaction");
    });

    it("annotates model change on next turn", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
      state.flagModelChange("anthropic/claude-4");
      const turn = state.recordTurn({ cacheRead: 0, cacheWrite: 5000, input: 5000 }, 2000);
      expect(turn.note).toBe("⚠ model changed");
    });

    it("annotates prompt change on next turn", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
      state.updatePromptHash(12345);
      state.updatePromptHash(67890); // different → flag prompt change
      const turn = state.recordTurn({ cacheRead: 0, cacheWrite: 5000, input: 5000 }, 2000);
      expect(turn.note).toBe("⚠ prompt changed");
    });

    it("does not flag prompt change for same hash", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
      state.updatePromptHash(12345);
      state.updatePromptHash(12345); // same → no flag
      const turn = state.recordTurn({ cacheRead: 5000, cacheWrite: 0, input: 5000 }, 2000);
      expect(turn.note).toBeUndefined();
    });

    it("clears flags after recording", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
      state.flagCompaction();
      state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 9900 }, 2000);
      const turn3 = state.recordTurn({ cacheRead: 5000, cacheWrite: 0, input: 5000 }, 3000);
      expect(turn3.note).toBeUndefined();
    });

    it("defers model change attribution until the next comparable turn", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
      state.flagModelChange("anthropic/claude-4");

      const noDataTurn = state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 5000 }, 2000);
      const comparableTurn = state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 9900 }, 3000);

      expect(noDataTurn.note).toBeUndefined();
      expect(comparableTurn.note).toBe("⚠ model changed");
      expect(comparableTurn.cause).toEqual({ type: "model_change", model: "anthropic/claude-4" });
    });
  });

  describe("detectRegression", () => {
    it("returns null when < 2 turns", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
      expect(state.detectRegression(25)).toBeNull();
    });

    it("detects regression when drop exceeds threshold", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
      state.recordTurn({ cacheRead: 1000, cacheWrite: 0, input: 9000 }, 2000);
      const result = state.detectRegression(25);
      expect(result).not.toBeNull();
      expect(result?.previousRate).toBe(90);
      expect(result?.currentRate).toBe(10);
      expect(result?.cause.type).toBe("unknown");
    });

    it("returns null when drop does not exceed threshold", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
      state.recordTurn({ cacheRead: 7000, cacheWrite: 0, input: 3000 }, 2000);
      // 90% → 70% = 20pp drop, threshold is 25
      expect(state.detectRegression(25)).toBeNull();
    });

    it("skips turns with undefined hitRate", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
      state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 0 }, 2000); // undefined
      // Only 1 adjacent comparable turn pair → no regression
      expect(state.detectRegression(25)).toBeNull();
    });

    it("does not compare across a no-data gap", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
      state.recordTurn({ cacheRead: 0, cacheWrite: 0, input: 5000 }, 2000);
      state.recordTurn({ cacheRead: 1000, cacheWrite: 0, input: 9000 }, 3000);
      expect(state.detectRegression(25)).toBeNull();
    });

    it("diagnoses compaction cause", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
      state.flagCompaction();
      state.recordTurn({ cacheRead: 500, cacheWrite: 0, input: 9500 }, 2000);
      const result = state.detectRegression(25);
      expect(result).not.toBeNull();
      expect(result?.cause.type).toBe("compaction");
    });

    it("diagnoses prompt change cause", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
      state.updatePromptHash(111);
      state.updatePromptHash(222);
      state.recordTurn({ cacheRead: 500, cacheWrite: 0, input: 9500 }, 2000);
      const result = state.detectRegression(25);
      expect(result).not.toBeNull();
      expect(result?.cause.type).toBe("prompt_change");
    });

    it("preserves the selected model in model-change diagnosis", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 9000, cacheWrite: 0, input: 1000 }, 1000);
      state.flagModelChange("anthropic/claude-4");
      state.recordTurn({ cacheRead: 0, cacheWrite: 5000, input: 5000 }, 2000);
      const result = state.detectRegression(25);
      expect(result).not.toBeNull();
      expect(result?.cause).toEqual({ type: "model_change", model: "anthropic/claude-4" });
    });
  });

  describe("restoreFromEntries", () => {
    it("restores turns from session entries", () => {
      const state = new CacheMonitorState();
      const entries = [
        {
          type: "custom" as const,
          customType: "supi-cache-turn",
          data: {
            turnIndex: 1,
            cacheRead: 0,
            cacheWrite: 5000,
            input: 5000,
            hitRate: 0,
            timestamp: 1000,
            note: "cold start",
          },
          id: "1",
          parentId: null,
        },
        {
          type: "custom" as const,
          customType: "supi-cache-turn",
          data: {
            turnIndex: 2,
            cacheRead: 8000,
            cacheWrite: 0,
            input: 2000,
            hitRate: 80,
            timestamp: 2000,
          },
          id: "2",
          parentId: "1",
        },
        { type: "custom" as const, customType: "other-type", data: {}, id: "3", parentId: "2" },
      ];
      state.restoreFromEntries(entries as never);
      expect(state.getTurns()).toHaveLength(2);
      expect(state.getTurns()[0].turnIndex).toBe(1);
      expect(state.getTurns()[1].turnIndex).toBe(2);
      expect(state.cacheSupported).toBe(true);
    });

    it("resets state before restoring", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 100, cacheWrite: 0, input: 100 }, 500);
      state.restoreFromEntries([]);
      expect(state.getTurns()).toHaveLength(0);
      expect(state.cacheSupported).toBe(false);
    });

    it("handles empty session", () => {
      const state = new CacheMonitorState();
      state.restoreFromEntries([]);
      expect(state.getTurns()).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const state = new CacheMonitorState();
      state.recordTurn({ cacheRead: 8000, cacheWrite: 0, input: 2000 }, 1000);
      state.flagCompaction();
      state.updatePromptHash(123);
      state.reset();
      expect(state.getTurns()).toHaveLength(0);
      expect(state.cacheSupported).toBe(false);
      expect(state.getLatestTurn()).toBeUndefined();
    });
  });
});
