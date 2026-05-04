import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  clearRegisteredSettings,
  getRegisteredSettings,
  loadSupiConfig,
} from "@mrclrchtr/supi-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_DEFAULTS, registerReviewSettings, setReviewModelChoices } from "../src/settings.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-review-settings-test-"));
}

describe("review settings registration", () => {
  beforeEach(() => {
    clearRegisteredSettings();
    setReviewModelChoices([]);
  });

  afterEach(() => {
    clearRegisteredSettings();
    setReviewModelChoices([]);
  });

  it("cycles the review model through the current review model choices", () => {
    setReviewModelChoices(["anthropic/claude-sonnet-4-5", "openai/gpt-4o-mini"]);
    registerReviewSettings();

    const section = getRegisteredSettings().find((item) => item.id === "review");
    expect(section).toBeDefined();

    const items = section?.loadValues("project", "/tmp") ?? [];
    const reviewModel = items.find((item) => item.id === "reviewModel");
    const maxDiff = items.find((item) => item.id === "maxDiffBytes");

    expect(reviewModel?.currentValue).toBe("(inherit)");
    expect(reviewModel?.values).toEqual([
      "(inherit)",
      "anthropic/claude-sonnet-4-5",
      "openai/gpt-4o-mini",
    ]);
    expect(maxDiff?.submenu).toBeTypeOf("function");
  });

  it("treats the inherit sentinel as an unset persisted value", () => {
    const tmpDir = makeTempDir();

    registerReviewSettings();
    const section = getRegisteredSettings().find((item) => item.id === "review");
    if (!section) throw new Error("review settings section was not registered");

    section.persistChange("project", tmpDir, "reviewModel", "anthropic/claude-sonnet-4-5");
    section.persistChange("project", tmpDir, "reviewModel", "(inherit)");

    const config = loadSupiConfig("review", tmpDir, REVIEW_DEFAULTS);
    expect(config.reviewModel).toBe("");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("opens submenus to edit numeric review settings", () => {
    registerReviewSettings();
    const section = getRegisteredSettings().find((item) => item.id === "review");
    if (!section) throw new Error("review settings section was not registered");

    const item = section.loadValues("project", "/tmp").find((entry) => entry.id === "maxDiffBytes");
    if (!item?.submenu) throw new Error("maxDiffBytes submenu was not registered");

    const done = vi.fn();
    const submenu = item.submenu("100000", done);

    expect(submenu.render(80).join("\n")).toContain("Max diff bytes before truncation:");
    submenu.handleInput?.("\r");
    expect(done).toHaveBeenCalledWith("100000");
  });
});
