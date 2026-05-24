/**
 * RED tests for the Tree-sitter runtime controller contract.
 *
 * These tests describe the stable library-level API that the
 * umbrella extension adapter will consume. They will fail until
 * the controller is implemented.
 */

import { describe, expect, it } from "vitest";
import { TreeSitterRuntimeController } from "../src/session/runtime-controller.ts";
import { getSessionTreeSitterService } from "../src/session/service-registry.ts";

describe("TreeSitterRuntimeController", () => {
  describe("start after gc", () => {
    it("creates a runtime and publishes a ready service state", async () => {
      const controller = new TreeSitterRuntimeController();
      await controller.start("/tmp");

      expect(controller.cwd).toBe("/tmp");
      expect(controller.runtime).toBeDefined();

      const state = getSessionTreeSitterService("/tmp");
      expect(state.kind).toBe("ready");

      await controller.stop();
    });

    it("is safe to start on a non-existent directory (handles missing files gracefully)", async () => {
      const controller = new TreeSitterRuntimeController();
      await controller.start("/nonexistent");
      expect(controller.runtime).toBeDefined();
      await controller.stop();
    });
  });

  describe("stop", () => {
    it("clears the session state and disposes the runtime", async () => {
      const controller = new TreeSitterRuntimeController();
      await controller.start("/tmp");

      expect(getSessionTreeSitterService("/tmp").kind).toBe("ready");

      await controller.stop();

      expect(controller.runtime).toBeNull();
      expect(controller.cwd).toBeNull();

      const state = getSessionTreeSitterService("/tmp");
      expect(state.kind).not.toBe("ready");
    });

    it("is safe to call without a prior start", async () => {
      const controller = new TreeSitterRuntimeController();
      await expect(controller.stop()).resolves.not.toThrow();
    });
  });

  describe("restart on a different cwd", () => {
    it("replaces the previous runtime and clears old cwd state", async () => {
      const controller = new TreeSitterRuntimeController();
      await controller.start("/tmp/old");
      const oldRuntime = controller.runtime;

      await controller.start("/tmp/new");

      expect(controller.runtime).not.toBe(oldRuntime);

      const oldState = getSessionTreeSitterService("/tmp/old");
      expect(oldState.kind).not.toBe("ready");

      await controller.stop();
    });
  });

  describe("properties after stop", () => {
    it("exposes null cwd and null runtime", async () => {
      const controller = new TreeSitterRuntimeController();
      await controller.start("/tmp");
      await controller.stop();

      expect(controller.cwd).toBeNull();
      expect(controller.runtime).toBeNull();
    });
  });
});
