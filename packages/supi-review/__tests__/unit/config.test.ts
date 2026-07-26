import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRegisterDeclarativeSettings = vi.hoisted(() => vi.fn());

vi.mock("@mrclrchtr/supi-core/settings", () => ({
  registerDeclarativeSettings: mockRegisterDeclarativeSettings,
}));

import {
  loadReviewConfig,
  REVIEW_CONFIG_SECTION,
  REVIEW_DEFAULTS,
  registerReviewSettings,
} from "../../src/config.ts";
import { CURRENT_SESSION_REVIEW_MODEL } from "../../src/model.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-review-config-test-"));
}

describe("review config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults agent-driven reviews to the current session model", () => {
    const homeDir = makeTempDir();
    try {
      expect(loadReviewConfig(path.join(homeDir, "repo"), homeDir)).toEqual({
        agentModel: CURRENT_SESSION_REVIEW_MODEL,
      });
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("loads a project model override and trims its canonical id", () => {
    const homeDir = makeTempDir();
    const cwd = path.join(homeDir, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    try {
      writeSupiConfig(
        { section: REVIEW_CONFIG_SECTION, scope: "project", cwd },
        { agentModel: "  openai/gpt-5  " },
        { homeDir },
      );

      expect(loadReviewConfig(cwd, homeDir)).toEqual({ agentModel: "openai/gpt-5" });
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("registers a scoped model picker with a current-session fallback", () => {
    registerReviewSettings({} as never);

    expect(mockRegisterDeclarativeSettings).toHaveBeenCalledOnce();
    expect(mockRegisterDeclarativeSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: REVIEW_CONFIG_SECTION,
        section: REVIEW_CONFIG_SECTION,
        defaults: REVIEW_DEFAULTS,
        fields: [
          expect.objectContaining({
            kind: "modelPicker",
            key: "agentModel",
            includeDisabled: false,
            staticOptions: [expect.objectContaining({ value: CURRENT_SESSION_REVIEW_MODEL })],
          }),
        ],
      }),
    );
  });
});
