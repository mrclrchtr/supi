import { describe, expect, it } from "vitest";
import {
  contextErrorResult,
  healthErrorResult,
  inspectErrorResult,
  searchErrorResult,
} from "../../../../src/tool/result/errors.ts";
import type {
  ContextDetails,
  HealthDetails,
  InspectDetails,
  SearchDetails,
} from "../../../../src/types/index.ts";

describe("error result factories", () => {
  describe("combined factories", () => {
    it("searchErrorResult sets unavailable search details", () => {
      const result = searchErrorResult("msg", { scope: "src", nextQueries: ["retry"] });
      const data = result.details!.data as SearchDetails;

      expect(result.content).toBe("msg");
      expect(result.details?.type).toBe("search");
      expect(data.confidence).toBe("unavailable");
      expect(data.scope).toBe("src");
      expect(data.candidateCount).toBe(0);
      expect(data.omittedCount).toBe(0);
      expect(data.nextQueries).toEqual(["retry"]);
    });

    it("searchErrorResult defaults scope and nextQueries when omitted", () => {
      const result = searchErrorResult("msg");
      const data = result.details!.data as SearchDetails;

      expect(data.scope).toBeNull();
      expect(data.nextQueries).toEqual([]);
    });

    it("contextErrorResult sets context-type details", () => {
      const result = contextErrorResult("msg", { nextQueries: ["next"] });
      const data = result.details!.data as ContextDetails;

      expect(result.content).toBe("msg");
      expect(result.details?.type).toBe("context");
      expect(data.confidence).toBe("unavailable");
      expect(data.task).toBeNull();
      expect(data.focusTarget).toBeNull();
      expect(data.requestedSections).toEqual([]);
      expect(data.renderedSections).toEqual([]);
      expect(data.omittedCount).toBe(0);
      expect(data.nextQueries).toEqual(["next"]);
    });

    it("inspectErrorResult sets inspect-type details with focusTarget", () => {
      const result = inspectErrorResult("msg", {
        focusTarget: "src/a.ts:2:4",
        nextQueries: ["next"],
      });
      const data = result.details!.data as InspectDetails;

      expect(result.content).toBe("msg");
      expect(result.details?.type).toBe("inspect");
      expect(data.confidence).toBe("unavailable");
      expect(data.focusTarget).toBe("src/a.ts:2:4");
      expect(data.diagnosticWindow).toBeNull();
      expect(data.sections).toEqual([]);
      expect(data.nextQueries).toEqual(["next"]);
    });

    it("inspectErrorResult defaults focusTarget to empty string", () => {
      const result = inspectErrorResult("msg");
      const data = result.details!.data as InspectDetails;

      expect(data.focusTarget).toBe("");
    });

    it("healthErrorResult sets health-type details with reason", () => {
      const result = healthErrorResult("msg", "no providers");
      const data = result.details!.data as HealthDetails;

      expect(result.content).toBe("msg");
      expect(result.details?.type).toBe("health");
      expect(data.semanticState).toEqual({ kind: "unavailable", reason: "no providers" });
      expect(data.refresh).toEqual({
        kind: "not-attempted",
        reason: "no providers",
        lastAttempt: null,
      });
      expect(data.diagnosticFileCount).toBe(0);
      expect(data.serverCount).toBe(0);
    });

    it("healthErrorResult falls back to content when reason is omitted", () => {
      const result = healthErrorResult("upstream failure");
      const data = result.details!.data as HealthDetails;

      expect(data.semanticState).toEqual({
        kind: "unavailable",
        reason: "upstream failure",
      });
    });
  });
});
