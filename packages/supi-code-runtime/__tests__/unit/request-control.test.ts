import { describe, expect, it } from "vitest";
import {
  CodeRequestDeadlineError,
  isCodeRequestInterrupted,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "../../src/api.ts";

describe("code request control", () => {
  it("preserves the caller abort reason", () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    expect(() => throwIfCodeRequestInterrupted({ signal: controller.signal })).toThrow(reason);
    expect(isCodeRequestInterrupted({ signal: controller.signal })).toBe(true);
    expect(isCodeRequestInterruption(reason, { signal: controller.signal })).toBe(true);
  });

  it("uses an absolute deadline", () => {
    const control = { deadline: 10 };

    expect(isCodeRequestInterrupted(control, () => 9)).toBe(false);
    expect(isCodeRequestInterrupted(control, () => 10)).toBe(true);
    expect(() => throwIfCodeRequestInterrupted(control, () => 10)).toThrow(
      CodeRequestDeadlineError,
    );
    const bundledCopyError = new Error("deadline");
    bundledCopyError.name = "CodeRequestDeadlineError";
    expect(isCodeRequestInterruption(bundledCopyError, undefined)).toBe(true);
  });
});
