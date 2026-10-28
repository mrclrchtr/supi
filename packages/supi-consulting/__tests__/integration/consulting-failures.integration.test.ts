import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAntigravityAdapter } from "../../src/agents/antigravity/adapter.ts";
import { getIsolatedAntigravityPaths } from "../../src/agents/antigravity/isolated-home.ts";
import type { ConsultingAgentExecutionOptions } from "../../src/agents/types.ts";
import { ConversationHandleStore } from "../../src/conversation/handles.ts";
import { registerConsultingRunTool } from "../../src/tool/consulting_run/register.ts";
import { fixtureDirectory } from "../helpers/test-paths.ts";

const fakeDirectory = fixtureDirectory(import.meta.dirname);
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "supi-consulting-failures-"));
  await chmod(join(fakeDirectory, "agy"), 0o755);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.stubEnv("PI_CODING_AGENT_DIR", root);
  vi.stubEnv("PATH", `${fakeDirectory}:${process.env.PATH ?? ""}`);
  configureDebugRegistry({ enabled: true, agentAccess: "raw" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDebugRegistry();
});

function execute(
  prompt: string,
  options: Pick<
    ConsultingAgentExecutionOptions,
    "signal" | "onProgress" | "additionalReadOnlyDirectories"
  > = {},
) {
  const paths = getIsolatedAntigravityPaths();
  return createAntigravityAdapter(paths).execute({
    prompt,
    model: "gemini-3.8-flash-low",
    canonicalWorkingDirectory: paths.consultationWorkspace,
    workspaceAccess: false,
    ...options,
  });
}

describe("Consultation failure diagnostics", () => {
  it.each([
    ["response-case=no-terminal", "missing-terminal", "did not return a final result"],
    ["response-case=terminal-error", "terminal-failed", "reported an unsuccessful final result"],
    ["response-case=missing-answer", "missing-answer", "did not return a final structured answer"],
    ["response-case=invalid-answer", "invalid-answer", "does not match the required schema"],
    ["response-case=missing-response-token", "unbound-answer", "current request"],
    ["response-case=wrong-response-token", "unbound-answer", "current request"],
    ["response-case=missing-conversation", "missing-conversation", "conversation identifier"],
    ["response-case=trailing-event", "events-after-terminal", "data after its final result"],
    ["response-case=event-limit", "event-limit", "event limit"],
    ["malformed", "malformed-json", "malformed JSON"],
    ["non-object", "invalid-event", "non-object response event"],
    ["oversized", "stdout-line-limit", "line-size limit"],
    ["byte-limit", "stdout-byte-limit", "total output-size limit"],
  ])("reports %s without inventing a permission denial", async (prompt, reason, message) => {
    const failure = await execute(prompt).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      name: "ConsultingAgentError",
      kind: "invalid-response",
      reason,
      message: expect.stringContaining(message),
    });
    expect(String(failure)).not.toContain("permission denial");
    expect(getDebugEvents({ source: "consulting", level: "error" }).events).toMatchObject([
      { data: { kind: "invalid-response", reason, permissionDenials: 0 } },
    ]);
  });

  it.each([
    ["no-terminal", "missing-terminal"],
    ["terminal-error", "terminal-failed"],
    ["broken-tail", "malformed-json"],
  ])("keeps the failure reason after a denial: %s", async (scenario, reason) => {
    const failure = await execute(`denied-incomplete ${scenario}`).catch((error: unknown) => error);
    expect(failure).toMatchObject({ reason, diagnostics: { permissionDenials: 1 } });
    const events = getDebugEvents({
      source: "consulting",
      includeRaw: true,
      allowRaw: true,
    }).events;
    expect(events).toMatchObject([{ data: { reason, permissionDenials: 1 } }]);
    expect(JSON.stringify({ failure, events })).not.toMatch(
      /private output text|fixture-auth|private diagnostic text/,
    );
  });

  it("records cancellation separately even after a permission denial", async () => {
    const controller = new AbortController();
    let toolUpdates = 0;
    const failure = await execute("denied-incomplete wait", {
      signal: controller.signal,
      onProgress: (activity) => {
        if (activity === "activity: read_file" && ++toolUpdates === 2) controller.abort();
      },
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ kind: "cancelled", diagnostics: { permissionDenials: 1 } });
    expect(getDebugEvents({ source: "consulting", level: "error" }).events).toEqual([]);
    expect(getDebugEvents({ source: "consulting" }).events).toMatchObject([
      {
        level: "info",
        category: "consultation.cancelled",
        data: { kind: "cancelled", reason: "cancelled", permissionDenials: 1 },
      },
    ]);
  });

  it("logs process exit facts without stderr and keeps successful denials non-fatal", async () => {
    await execute("permission");
    expect(getDebugEvents({ source: "consulting" }).events).toEqual([]);
    await expect(execute("exit-nonzero")).rejects.toMatchObject({
      kind: "execution",
      diagnostics: { exitCode: 7 },
    });
    const events = getDebugEvents({
      source: "consulting",
      includeRaw: true,
      allowRaw: true,
    }).events;
    expect(events).toMatchObject([{ data: { kind: "execution", exitCode: 7 } }]);
    expect(JSON.stringify(events)).not.toMatch(/stderr|fixture process failure/);
  });

  it.each([
    ["workspace", 0],
    ["additional", 0],
    ["additionalAlias", 0],
    ["outsideSibling", 1],
    ["workspaceEscape", 1],
    ["danglingInside", 0],
    ["danglingOutside", 0],
    ["parentTraversal", 0],
    ["danglingTraversal", 0],
  ] as const)("classifies denied file scope: %s", async (scenario, outside) => {
    const paths = getIsolatedAntigravityPaths();
    const caseRoot = await mkdtemp(join(root, "scope-"));
    const workspaceSubdirectory = join(paths.consultationWorkspace, basename(caseRoot));
    const approved = join(caseRoot, "approved");
    const sibling = join(caseRoot, "approved-sibling");
    const alias = join(caseRoot, "approved-alias");
    const outsideAlias = join(workspaceSubdirectory, "escape");
    const danglingInside = join(workspaceSubdirectory, "dangling");
    const danglingOutside = join(caseRoot, "dangling");
    const incomingAlias = join(caseRoot, "incoming-alias");
    await Promise.all([
      mkdir(workspaceSubdirectory, { recursive: true }),
      mkdir(approved),
      mkdir(sibling),
    ]);
    await symlink(approved, alias, "dir");
    await symlink(sibling, outsideAlias, "dir");
    await symlink(join(sibling, "missing"), danglingInside, "dir");
    await symlink(join(paths.consultationWorkspace, "missing"), danglingOutside, "dir");
    await symlink(workspaceSubdirectory, incomingAlias, "dir");
    const targets = {
      workspace: join(workspaceSubdirectory, "image.png"),
      additional: join(approved, "image.png"),
      additionalAlias: join(alias, "image.png"),
      outsideSibling: join(sibling, "image.png"),
      workspaceEscape: join(outsideAlias, "image.png"),
      danglingInside: join(danglingInside, "image.png"),
      danglingOutside: join(danglingOutside, "image.png"),
      parentTraversal: `${incomingAlias}/../image.png`,
      danglingTraversal: `${danglingOutside}/../image.png`,
    };
    const failure = await execute(
      `denied-target=${JSON.stringify({ name: "read_file", path: targets[scenario] })}`,
      { additionalReadOnlyDirectories: [approved] },
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      reason: "missing-answer",
      diagnostics: {
        permissionDenials: 1,
        permissionDenialsByOperation: { "file-read": 1 },
        deniedFileAccessOutsideReadRoots: outside,
      },
    });
  });

  it("retains file scope from a pending result before a parameterless denial", async () => {
    await expect(execute("denied-pending")).rejects.toMatchObject({
      reason: "missing-answer",
      diagnostics: {
        permissionDenials: 1,
        permissionDenialsByOperation: { "file-read": 1 },
        deniedFileAccessOutsideReadRoots: 1,
      },
    });
  });

  it("classifies unknown denied tools without leaking their names or parameters", async () => {
    const failure = await execute(
      `denied-target=${JSON.stringify({
        name: "private_tool_identifier",
        path: "/private/tool-parameter",
      })}`,
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      reason: "missing-answer",
      diagnostics: {
        permissionDenials: 1,
        permissionDenialsByOperation: { other: 1 },
      },
    });
    const events = getDebugEvents({
      source: "consulting",
      includeRaw: true,
      allowRaw: true,
    }).events;
    expect(events).toHaveLength(1);
    expect(events).toMatchObject([{ data: { permissionDenialsByOperation: { other: 1 } } }]);
    expect(JSON.stringify({ message: String(failure), failure, events })).not.toMatch(
      /private_tool_identifier|tool-parameter/,
    );
  });

  it("keeps the failure reason when Debug is disabled", async () => {
    configureDebugRegistry({ enabled: false });
    const failure = await execute("denied-incomplete").catch((error: unknown) => error);
    expect(failure).toMatchObject({
      reason: "missing-answer",
      diagnostics: {
        permissionDenials: 1,
        permissionDenialsByOperation: { "file-read": 1 },
        deniedFileAccessOutsideReadRoots: 1,
      },
    });
    expect(String(failure)).toContain("file-read=1");
    expect(String(failure)).toContain('"requestedPath":"/private/tmp/private-image.png"');
    expect(String(failure)).toContain("Do not retry denied actions unchanged");
    expect(getDebugEvents().events).toEqual([]);
  });

  it("surfaces soft-denial summaries and unfinished targets through the registered tool", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    const availability = await adapter.discover();
    if (availability.status !== "available") throw new Error("Fixture discovery failed.");
    const pi = createPiMock();
    registerConsultingRunTool({
      pi: pi as never,
      adapter,
      availability,
      handles: new ConversationHandleStore(),
      homeDir: root,
    });
    const tool = pi.tools[0] as { execute: (...args: unknown[]) => Promise<unknown> };
    const requestedPath = '/outside/probe "quoted".txt';
    const summary = {
      events: [{ type: "tool_use", id: "read", name: "read_file", input: { Path: requestedPath } }],
      denied_actions: [{ action: "read_file", display_name: "ReadFile" }],
    };
    const failure = await tool
      .execute(
        "summary-test",
        {
          prompt: `summary-events=${JSON.stringify(summary)}`,
          new: { agent: "antigravity", model: "gemini-3.8-flash-low", workspace: true },
        },
        undefined,
        undefined,
        makeCtx({ cwd: paths.consultationWorkspace }),
      )
      .catch((error: unknown) => error);
    const expected = {
      permissionDenials: 1,
      permissionDenialsByOperation: { "file-read": 1 },
      deniedResources: [],
      unfinishedResources: [{ operation: "file-read", requestedPath }],
    };
    expect(failure).toMatchObject({ reason: "missing-answer", diagnostics: expected });
    expect(String(failure)).toContain(JSON.stringify(requestedPath));
    expect(String(failure)).toContain("unknown outcomes");
    expect(getDebugEvents({ source: "consulting" }).events).toMatchObject([{ data: expected }]);
  });

  it("gives the caller actionable, private failure diagnostics without duplicate debug events", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    const availability = await adapter.discover();
    if (availability.status !== "available") throw new Error("Fixture discovery failed.");
    const pi = createPiMock();
    registerConsultingRunTool({
      pi: pi as never,
      adapter,
      availability,
      handles: new ConversationHandleStore(),
      homeDir: root,
    });
    const tool = pi.tools[0] as { execute: (...args: unknown[]) => Promise<unknown> };
    const failure = await tool
      .execute(
        "failure-test",
        {
          prompt: "denied-inspection",
          new: { agent: "antigravity", model: "gemini-3.8-flash-low", workspace: true },
        },
        undefined,
        undefined,
        makeCtx({ cwd: paths.consultationWorkspace }),
      )
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      reason: "missing-answer",
      diagnostics: {
        permissionDenials: 4,
        permissionDenialsByOperation: { command: 3, "file-read": 1 },
        deniedFileAccessOutsideReadRoots: 1,
        deniedResources: [
          { operation: "file-read", requestedPath: "/private/tmp/private-image.png" },
        ],
        deniedResourcesOmitted: 0,
        deniedResourcePathsUnavailable: 0,
      },
    });
    expect(String(failure)).toContain("did not return a final structured answer");
    expect(String(failure)).toContain("Agent terminal status: success");
    expect(String(failure)).toContain("command=3, file-read=1");
    expect(String(failure)).toContain('"requestedPath":"/private/tmp/private-image.png"');
    expect(String(failure)).toContain("outside approved read roots: 1");
    expect(String(failure)).toContain("Workspace access does not grant command execution");
    expect(String(failure)).toContain("Do not retry denied actions unchanged");
    expect(String(failure)).toContain("not proof of the failure cause");
    const events = getDebugEvents({
      source: "consulting",
      level: "error",
      includeRaw: true,
      allowRaw: true,
    }).events;
    expect(events).toHaveLength(1);
    expect(events).toMatchObject([
      {
        data: {
          workspaceAccess: true,
          reason: "missing-answer",
          permissionDenials: 4,
          permissionDenialsByOperation: { command: 3, "file-read": 1 },
          deniedFileAccessOutsideReadRoots: 1,
          deniedResources: [
            { operation: "file-read", requestedPath: "/private/tmp/private-image.png" },
          ],
        },
      },
    ]);
    expect(JSON.stringify({ message: String(failure), failure, events })).not.toMatch(
      /fixture-auth|private diagnostic text|curl|agent-browser|git status|CommandLine/,
    );
  });

  it("reports a missing answer and an observed denial without exposing unrelated private data", async () => {
    const failure = await execute("denied-incomplete private prompt text").catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({
      name: "ConsultingAgentError",
      kind: "invalid-response",
      reason: "missing-answer",
      message: expect.stringContaining(
        "The Consulting Agent did not return a final structured answer",
      ),
    });
    const events = getDebugEvents({
      source: "consulting",
      includeRaw: true,
      allowRaw: true,
    }).events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: "error",
      category: "consultation.failed",
      data: {
        agent: "antigravity",
        model: "gemini-3.8-flash-low",
        workspaceAccess: false,
        followUp: false,
        phase: "conversation",
        kind: "invalid-response",
        reason: "missing-answer",
        permissionDenials: 1,
        eventCount: 4,
        terminalSeen: true,
        terminalSucceeded: true,
        timing: { durationMs: expect.any(Number) },
      },
    });
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("stderr");
    expect(events[0]).not.toHaveProperty("rawData");
    expect(JSON.stringify({ failure, events })).not.toMatch(
      /private prompt text|private diagnostic text|fixture-conversation/,
    );
  });
});
