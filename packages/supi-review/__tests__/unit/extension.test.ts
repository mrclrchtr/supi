import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import reviewExtension, { editReview } from "../../src/review.ts";

describe("supi-review extension", () => {
  it.each(["null", "{}", '{"tasks":"wrong"}', '{"tasks":[]}'])(
    "rejects invalid command editor input: %s",
    async (text) => {
      const notify = vi.fn();
      const ctx = { ui: { editor: vi.fn(async () => text), notify } } as never;

      await expect(
        editReview(ctx, { tasks: [{ id: "x", instructions: "x" }] }),
      ).resolves.toBeUndefined();
      expect(notify).toHaveBeenCalled();
    },
  );

  it("registers optional preparation, universal run, and the user command", () => {
    const pi = createPiMock();
    reviewExtension(pi as unknown as ExtensionAPI);

    expect(getTool(pi, "supi_review_prepare")).toBeDefined();
    expect(getTool(pi, "supi_review_run")).toBeDefined();
    expect(pi.commands.has("supi-review")).toBe(true);
  });
});
