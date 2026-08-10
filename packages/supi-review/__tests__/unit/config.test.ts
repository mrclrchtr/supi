import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMocks = vi.hoisted(() => ({
  define: vi.fn((options) => options),
  register: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/settings", () => ({
  defineConfigSettings: settingsMocks.define,
  registerSettings: settingsMocks.register,
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
        agentToolEnabled: true,
        agentModel: CURRENT_SESSION_REVIEW_MODEL,
        plannerModel: CURRENT_SESSION_REVIEW_MODEL,
        auditEnabled: false,
        bootstrapCommand: "",
        postReviewPolicy: "ask",
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
          agentToolEnabled: false,
          agentModel: "  openai/reviewer  ",
          plannerModel: "  openai/planner  ",
          bootstrapCommand: " pnpm install --frozen-lockfile ",
          postReviewPolicy: "verify-and-fix",
        },
        { homeDir },
      );

      expect(loadReviewConfig(cwd, homeDir)).toEqual({
        agentToolEnabled: false,
        agentModel: "openai/reviewer",
        plannerModel: "openai/planner",
        auditEnabled: false,
        bootstrapCommand: "pnpm install --frozen-lockfile",
        postReviewPolicy: "verify-and-fix",
      });
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("falls back to Ask for an unknown post-review policy", () => {
    const homeDir = makeTempDir();
    const cwd = path.join(homeDir, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    try {
      writeSupiConfig(
        { section: REVIEW_CONFIG_SECTION, scope: "project", cwd },
        { postReviewPolicy: "unknown" },
        { homeDir },
      );

      expect(loadReviewConfig(cwd, homeDir).postReviewPolicy).toBe("ask");
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("registers separate scoped model pickers", () => {
    registerReviewSettings({} as never);

    expect(settingsMocks.define).toHaveBeenCalledWith(
      expect.objectContaining({
        id: REVIEW_CONFIG_SECTION,
        defaults: REVIEW_DEFAULTS,
        fields: [
          expect.objectContaining({ kind: "boolean", key: "agentToolEnabled" }),
          expect.objectContaining({ kind: "modelPicker", key: "agentModel" }),
          expect.objectContaining({
            kind: "modelPicker",
            key: "plannerModel",
            description: "Powers the optional Planner Draft in /supi-review.",
          }),
          expect.objectContaining({ kind: "string", key: "bootstrapCommand" }),
          expect.objectContaining({
            kind: "enum",
            key: "postReviewPolicy",
            values: ["ask", "verify", "verify-and-fix", "fix", "report"],
          }),
          expect.objectContaining({ kind: "boolean", key: "auditEnabled" }),
        ],
      }),
    );
    expect(settingsMocks.register).toHaveBeenCalledOnce();
  });

  it("applies review tool availability changes to the current session", () => {
    const homeDir = makeTempDir();
    const cwd = path.join(homeDir, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    const pi = createPiMock();
    pi.setActiveTools(["read", "supi_review_output", "supi_review_run", "supi_review_audit"]);

    try {
      registerReviewSettings(pi as never, homeDir);
      const options = settingsMocks.define.mock.calls.at(-1)?.[0] as
        | { afterPersist?: (change: { cwd: string }) => void }
        | undefined;

      writeSupiConfig(
        { section: REVIEW_CONFIG_SECTION, scope: "project", cwd },
        { agentToolEnabled: false, auditEnabled: true },
        { homeDir },
      );
      options?.afterPersist?.({ cwd });
      expect(pi.getActiveTools()).toEqual(["read", "supi_review_output"]);

      writeSupiConfig(
        { section: REVIEW_CONFIG_SECTION, scope: "project", cwd },
        { agentToolEnabled: true, auditEnabled: false },
        { homeDir },
      );
      options?.afterPersist?.({ cwd });
      expect(pi.getActiveTools()).toEqual(["read", "supi_review_output", "supi_review_run"]);

      writeSupiConfig(
        { section: REVIEW_CONFIG_SECTION, scope: "project", cwd },
        { auditEnabled: true },
        { homeDir },
      );
      options?.afterPersist?.({ cwd });
      expect(pi.getActiveTools()).toEqual([
        "read",
        "supi_review_output",
        "supi_review_run",
        "supi_review_audit",
      ]);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
