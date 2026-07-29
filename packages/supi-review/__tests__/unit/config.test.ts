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

  it("provides independent reviewer and Planner model settings", () => {
    const homeDir = makeTempDir();
    try {
      expect(loadReviewConfig(path.join(homeDir, "repo"), homeDir)).toEqual({
        agentModel: CURRENT_SESSION_REVIEW_MODEL,
        plannerModel: CURRENT_SESSION_REVIEW_MODEL,
        auditEnabled: false,
        bootstrapCommand: "",
      });
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("loads and trims independent project model overrides", () => {
    const homeDir = makeTempDir();
    const cwd = path.join(homeDir, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    try {
      writeSupiConfig(
        { section: REVIEW_CONFIG_SECTION, scope: "project", cwd },
        {
          agentModel: "  openai/reviewer  ",
          plannerModel: "  openai/planner  ",
          bootstrapCommand: " pnpm install --frozen-lockfile ",
        },
        { homeDir },
      );

      expect(loadReviewConfig(cwd, homeDir)).toEqual({
        agentModel: "openai/reviewer",
        plannerModel: "openai/planner",
        auditEnabled: false,
        bootstrapCommand: "pnpm install --frozen-lockfile",
      });
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("registers separate scoped model pickers", () => {
    registerReviewSettings({} as never);

    expect(mockRegisterDeclarativeSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: REVIEW_CONFIG_SECTION,
        defaults: REVIEW_DEFAULTS,
        fields: [
          expect.objectContaining({ kind: "modelPicker", key: "agentModel" }),
          expect.objectContaining({ kind: "modelPicker", key: "plannerModel" }),
          expect.objectContaining({ kind: "string", key: "bootstrapCommand" }),
          expect.objectContaining({ kind: "boolean", key: "auditEnabled" }),
        ],
      }),
    );
  });
});
