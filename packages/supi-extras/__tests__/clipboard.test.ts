import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeMock } = vi.hoisted(() => ({
  writeMock: vi.fn(),
}));

vi.mock("clipboardy", () => ({
  default: { write: writeMock },
}));

import { copyToClipboard } from "../src/clipboard.ts";

describe("copyToClipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes text with clipboardy", async () => {
    writeMock.mockResolvedValue(undefined);

    await expect(copyToClipboard("copy me", "/tmp", {} as ExtensionAPI)).resolves.toBe(true);

    expect(writeMock).toHaveBeenCalledWith("copy me");
  });

  it("returns false when clipboardy throws", async () => {
    writeMock.mockRejectedValue(new Error("boom"));

    await expect(copyToClipboard("copy me", "/tmp", {} as ExtensionAPI)).resolves.toBe(false);
  });
});
