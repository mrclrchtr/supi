import { describe, expect, it } from "vitest";
import {
  contextErrorResult,
  healthErrorResult,
  inspectErrorResult,
  resolveErrorResult,
  searchErrorResult,
  unavailableContextDetails,
  unavailableHealthDetails,
  unavailableInspectDetails,
  unavailableResolveDetails,
  unavailableSearchDetails,
} from "../../../../src/tool/result/errors.ts";
import type {
  ContextDetails,
  HealthDetails,
  InspectDetails,
  ResolveDetails,
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

    it("resolveErrorResult sets resolve-type details", () => {
      const result = resolveErrorResult("msg", { nextQueries: ["next"] });
      const data = result.details!.data as ResolveDetails;

      expect(result.content).toBe("msg");
      expect(result.details?.type).toBe("resolve");
      expect(data.confidence).toBe("unavailable");
      expect(data.targetCount).toBe(0);
      expect(data.omittedCount).toBe(0);
      expect(data.targets).toEqual([]);
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
      expect(data.unavailableSections).toEqual([]);
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
      expect(data.lspAvailable).toBe(false);
      expect(data.lspStatus).toBe("no providers");
      expect(data.recovered).toBe(false);
      expect(data.diagnosticFileCount).toBe(0);
      expect(data.serverCount).toBe(0);
    });

    it("healthErrorResult falls back to content when reason is omitted", () => {
      const result = healthErrorResult("upstream failure");
      const data = result.details!.data as HealthDetails;

      expect(data.lspStatus).toBe("upstream failure");
    });
  });

  describe("details-only wrappers", () => {
    it("unavailableSearchDetails delegates to searchErrorResult with empty content", () => {
      const details = unavailableSearchDetails("src", ["retry"]);
      const data = details.data as SearchDetails;

      expect(details.type).toBe("search");
      expect(data.confidence).toBe("unavailable");
      expect(data.scope).toBe("src");
      expect(data.nextQueries).toEqual(["retry"]);
    });

    it("unavailableContextDetails delegates to contextErrorResult", () => {
      const details = unavailableContextDetails(["next"]);
      const data = details.data as ContextDetails;

      expect(details.type).toBe("context");
      expect(data.nextQueries).toEqual(["next"]);
    });

    it("unavailableResolveDetails delegates to resolveErrorResult", () => {
      const details = unavailableResolveDetails(["next"]);
      const data = details.data as ResolveDetails;

      expect(details.type).toBe("resolve");
      expect(data.targets).toEqual([]);
    });

    it("unavailableInspectDetails delegates to inspectErrorResult", () => {
      const details = unavailableInspectDetails("src/a.ts:2:4", ["next"]);
      const data = details.data as InspectDetails;

      expect(details.type).toBe("inspect");
      expect(data.focusTarget).toBe("src/a.ts:2:4");
    });

    it("unavailableHealthDetails delegates to healthErrorResult", () => {
      const details = unavailableHealthDetails("no LSP");
      const data = details.data as HealthDetails;

      expect(details.type).toBe("health");
      expect(data.lspAvailable).toBe(false);
      expect(data.lspStatus).toBe("no LSP");
    });
  });
});
