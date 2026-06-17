import { beforeEach, describe, expect, it } from "vitest";
import { footerContributions } from "../../src/footer-registry.ts";

describe("footerContributions", () => {
  beforeEach(() => {
    footerContributions.clear();
  });

  describe("empty registry", () => {
    it("returns empty arrays for any placement", () => {
      expect(footerContributions.getByPlacement("stats")).toEqual([]);
      expect(footerContributions.getByPlacement("status")).toEqual([]);
    });
  });

  describe("register and getByPlacement", () => {
    it("returns registered contributions for the matching placement", () => {
      footerContributions.register({
        key: "cache",
        placement: "stats",
        render: () => "TCH80%↑",
      });

      const stats = footerContributions.getByPlacement("stats");
      expect(stats).toHaveLength(1);
      expect(stats[0].key).toBe("cache");
      expect(stats[0].render()).toBe("TCH80%↑");

      expect(footerContributions.getByPlacement("status")).toEqual([]);
    });

    it("replaces a contribution when re-registering with the same key", () => {
      footerContributions.register({
        key: "cache",
        placement: "stats",
        render: () => "old",
      });
      footerContributions.register({
        key: "cache",
        placement: "stats",
        render: () => "new",
      });

      const stats = footerContributions.getByPlacement("stats");
      expect(stats).toHaveLength(1);
      expect(stats[0].render()).toBe("new");
    });

    it("filters by placement correctly", () => {
      footerContributions.register({
        key: "a",
        placement: "stats",
        render: () => "a",
      });
      footerContributions.register({
        key: "b",
        placement: "status",
        render: () => "b",
      });

      expect(footerContributions.getByPlacement("stats")).toHaveLength(1);
      expect(footerContributions.getByPlacement("status")).toHaveLength(1);
    });
  });

  describe("unregister", () => {
    it("removes a contribution by key", () => {
      footerContributions.register({
        key: "cache",
        placement: "stats",
        render: () => "TCH80%↑",
      });
      footerContributions.unregister("cache");

      expect(footerContributions.getByPlacement("stats")).toEqual([]);
    });

    it("is idempotent — no-op when key is not registered", () => {
      expect(() => footerContributions.unregister("nonexistent")).not.toThrow();
    });
  });

  describe("priority sorting", () => {
    it("sorts by priority ascending (lower = further left)", () => {
      footerContributions.register({
        key: "c",
        placement: "stats",
        priority: 300,
        render: () => "c",
      });
      footerContributions.register({
        key: "a",
        placement: "stats",
        priority: 100,
        render: () => "a",
      });
      footerContributions.register({
        key: "b",
        placement: "stats",
        priority: 200,
        render: () => "b",
      });

      const keys = footerContributions.getByPlacement("stats").map((c) => c.key);
      expect(keys).toEqual(["a", "b", "c"]);
    });

    it("defaults priority to 100", () => {
      footerContributions.register({
        key: "default",
        placement: "stats",
        render: () => "d",
      });
      footerContributions.register({
        key: "low",
        placement: "stats",
        priority: 50,
        render: () => "l",
      });

      const keys = footerContributions.getByPlacement("stats").map((c) => c.key);
      expect(keys).toEqual(["low", "default"]);
    });

    it("does not mix placements when sorting", () => {
      footerContributions.register({
        key: "stats-a",
        placement: "stats",
        priority: 200,
        render: () => "a",
      });
      footerContributions.register({
        key: "status-b",
        placement: "status",
        priority: 100,
        render: () => "b",
      });
      footerContributions.register({
        key: "stats-c",
        placement: "stats",
        priority: 100,
        render: () => "c",
      });

      const statsKeys = footerContributions.getByPlacement("stats").map((c) => c.key);
      const statusKeys = footerContributions.getByPlacement("status").map((c) => c.key);

      expect(statsKeys).toEqual(["stats-c", "stats-a"]);
      expect(statusKeys).toEqual(["status-b"]);
    });
  });

  describe("clear", () => {
    it("empties all contributions", () => {
      footerContributions.register({
        key: "a",
        placement: "stats",
        render: () => "a",
      });
      footerContributions.register({
        key: "b",
        placement: "status",
        render: () => "b",
      });

      footerContributions.clear();

      expect(footerContributions.getByPlacement("stats")).toEqual([]);
      expect(footerContributions.getByPlacement("status")).toEqual([]);
    });
  });
});
