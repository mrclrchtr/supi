import { beforeEach, describe, expect, it } from "vitest";
import { getStats, recordFallback, recordRewrite, resetTracking } from "../tracking.ts";

describe("tracking", () => {
  beforeEach(() => {
    resetTracking();
  });

  it("returns null when no activity", () => {
    expect(getStats()).toBeNull();
  });

  it("records rewrites", () => {
    recordRewrite("git status", "rtk git status");
    expect(getStats()).toEqual({ rewrites: 1, fallbacks: 0, estimatedTokensSaved: 200 });
  });

  it("records fallbacks", () => {
    recordFallback("echo hello");
    expect(getStats()).toEqual({ rewrites: 0, fallbacks: 1, estimatedTokensSaved: 0 });
  });

  it("tracks mixed activity", () => {
    recordRewrite("git status", "rtk git status");
    recordFallback("echo hello");
    recordRewrite("git diff", "rtk git diff");
    expect(getStats()).toEqual({ rewrites: 2, fallbacks: 1, estimatedTokensSaved: 400 });
  });

  it("resets on session_start", () => {
    recordRewrite("git status", "rtk git status");
    resetTracking();
    expect(getStats()).toBeNull();
  });
});
