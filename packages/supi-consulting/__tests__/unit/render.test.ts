import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  renderConsultingCall,
  renderConsultingResult,
} from "../../src/tool/consulting_run/render.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const details = {
  agent: "antigravity",
  model: "gemini-3.8-flash-low",
  workingDirectoryKind: "workspace",
  canonicalWorkingDirectory: "/workspace",
  workspaceAccess: true,
  agentVersion: "1.1.25",
  durationMs: 1,
  observedActivities: ["web", "workspace"],
  activityCounts: { web: 1, workspace: 1, other: 0 },
  permissionDenials: 0,
  webUsed: true,
  workspaceUsed: true,
  ambientProjectGuidanceAvailable: true,
  handle: "consult_test",
  continuation: "opaque-state",
  handleState: "active",
  observedSources: [{ title: "Node", url: "https://nodejs.org", evidence: "observed" }],
  claimedSources: [{ title: "Other", url: "https://example.com", evidence: "claimed" }],
  observedWorkspaceEvidence: [
    { path: "src/index.ts", summary: "entry point", evidence: "observed" },
  ],
  claimedWorkspaceEvidence: [],
  warnings: ["A hook warning."],
  usage: { inputTokens: 4, outputTokens: 6 },
};

describe("Consultation transcript rendering", () => {
  it("renders call metadata for a new workspace request", () => {
    const component = renderConsultingCall(
      {
        prompt: "Inspect this project",
        new: { agent: "antigravity", workspace: true, model: "gemini-3.8-flash-low" },
      },
      theme,
    );
    const output = component.render(120).join("\n");
    expect(output).toContain("Consultation");
    expect(output).toContain("antigravity");
    expect(output).toContain("gemini-3.8-flash-low");
    expect(output).toContain("workspace");
  });

  it("renders partial progress in compact and expanded states", () => {
    const result = {
      details: {
        agent: "antigravity",
        model: "gemini-3.8-flash-low",
        workspaceAccess: false,
        latestActivity: "activity: search_web",
      },
    };
    const compact = renderConsultingResult(result, { expanded: false, isPartial: true }, theme);
    expect(compact.render(120).join("\n")).toContain("search_web");
    const expanded = renderConsultingResult(result, { expanded: true, isPartial: true }, theme);
    expect(expanded.render(120).join("\n")).toContain("activity: search_web");
  });

  it("renders collapsed completion chrome from structured details", () => {
    const component = renderConsultingResult(
      { details },
      { expanded: false, isPartial: false },
      theme,
    );
    const output = component.render(120).join("\n");
    expect(output).toContain("Consultation complete");
    expect(output).toContain("antigravity");
    expect(output).toContain("consult_test");
    expect(output).toContain("1 observed source");
    expect(output).toContain("1 observed path");
    expect(output).toContain("10 tokens");
  });

  it("renders expanded evidence, warnings, usage, and answer content", () => {
    const component = renderConsultingResult(
      { content: [{ type: "text", text: "The answer." }], details },
      { expanded: true, isPartial: false },
      theme,
    );
    const output = component.render(120).join("\n");
    expect(output).toContain("Observed sources");
    expect(output).toContain("https://nodejs.org");
    expect(output).toContain("src/index.ts");
    expect(output).toContain("A hook warning.");
    expect(output).toContain("The answer.");
  });

  it("renders bounded error content", () => {
    const component = renderConsultingResult(
      { isError: true, content: [{ type: "text", text: "The process failed." }] },
      { expanded: false, isPartial: false },
      theme,
    );
    expect(component.render(120).join("\n")).toContain("Consultation failed");
    expect(component.render(120).join("\n")).toContain("The process failed.");
  });
});
