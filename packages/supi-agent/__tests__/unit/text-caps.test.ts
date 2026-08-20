import { describe, expect, it } from "vitest";
import {
  capHumanText,
  capModelText,
  humanTextOverflow,
  modelTextOverflow,
} from "../../src/tool/agent_run/text-caps.ts";

describe("output lane caps", () => {
  it("passes text under the model lane cap unchanged", () => {
    const text = "short";
    expect(capModelText(text)).toBe("short");
    expect(modelTextOverflow(text)).toBe(0);
  });

  it("caps model text at 16,000 characters with truncation marker", () => {
    const text = "x".repeat(20_000);
    const capped = capModelText(text);
    expect(capped.length).toBeLessThan(16_000 + 50);
    expect(capped).toContain("[truncated:");
    expect(capped).toContain("20,000");
    expect(modelTextOverflow(text)).toBe(20_000 - 16_000);
  });

  it("passes text under the human lane cap unchanged", () => {
    const text = "short";
    expect(capHumanText(text)).toBe("short");
    expect(humanTextOverflow(text)).toBe(0);
  });

  it("caps human text at 51,200 characters with truncation marker", () => {
    const text = "x".repeat(60_000);
    const capped = capHumanText(text);
    expect(capped.length).toBeLessThan(51_200 + 50);
    expect(capped).toContain("[truncated:");
    expect(capped).toContain("60,000");
    expect(humanTextOverflow(text)).toBe(60_000 - 51_200);
  });

  it("returns 0 overflow for exact-boundary text", () => {
    expect(modelTextOverflow("x".repeat(16_000))).toBe(0);
    expect(humanTextOverflow("x".repeat(51_200))).toBe(0);
  });
});
