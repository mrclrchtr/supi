import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAntigravityAdapter } from "../../src/agents/antigravity/adapter.ts";
import { getIsolatedAntigravityPaths } from "../../src/agents/antigravity/isolated-home.ts";
import { fixtureDirectory } from "../helpers/test-paths.ts";

const fakeDirectory = fixtureDirectory(import.meta.dirname);
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "supi-denied-resources-"));
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

async function replay(events: Record<string, unknown>[], deniedActions?: unknown[]) {
  const paths = getIsolatedAntigravityPaths();
  return createAntigravityAdapter(paths)
    .execute({
      prompt: deniedActions
        ? `summary-events=${JSON.stringify({ events, denied_actions: deniedActions })}`
        : `resource-events=${JSON.stringify(events)}`,
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: false,
    })
    .catch((error: unknown) => error);
}

function start(id: string, name: string, input: Record<string, unknown>) {
  return { type: "tool_use", id, name, input };
}
function result(id: string, status: string) {
  return { type: "tool_result", tool_use_id: id, status };
}

function step(index: number, state: string, parameters?: Record<string, unknown>) {
  return {
    event: "step_update",
    step_update: {
      step_index: index,
      state,
      step_type: "tool",
      tool_name: "read_file",
      tool_info: {
        ...(parameters ? { parameters } : {}),
        ...(state === "ERROR" ? { error: { message: "Permission denied" } } : {}),
      },
    },
  };
}

function debugData() {
  const events = getDebugEvents({ source: "consulting", includeRaw: true, allowRaw: true }).events;
  expect(events).toHaveLength(1);
  return events;
}

describe("Denied requested file targets", () => {
  it.each([true, false])(
    "replays the captured native soft-denial stream (tool error present: %s)",
    async (withError) => {
      // Sanitized live agy stream; retain the summary while dropping the error update
      // to protect the native incomplete-update failure path independently of prose.
      const events = (await readFile(join(fakeDirectory, "agy-soft-denial.ndjson"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const failure = await replay(
        events.filter((event) => withError || event.step_update?.state !== "ERROR"),
      );
      const resource = { operation: "file-read", requestedPath: '/outside/probe "quoted".txt' };
      expect(failure).toMatchObject({
        reason: "missing-answer",
        diagnostics: {
          permissionDenials: 1,
          permissionDenialsByOperation: { "file-read": 1 },
          deniedResources: withError ? [resource] : [],
          unfinishedResources: withError ? [] : [resource],
        },
      });
      expect(String(failure)).toContain(JSON.stringify(resource.requestedPath));
    },
  );
  it("uses terminal soft-denial summaries without guessing their targets from unfinished calls", async () => {
    const requestedPath = '/outside/probe "quoted".txt';
    const failure = await replay(
      [
        step(2, "ACTIVE", { Path: requestedPath }),
        start("unrelated", "read_file", { Path: "/outside/unrelated.txt" }),
      ],
      [{ action: "read_file", display_name: "ReadFile" }],
    );
    const expected = {
      permissionDenials: 1,
      permissionDenialsByOperation: { "file-read": 1 },
      deniedResources: [],
      deniedResourcePathsUnavailable: 1,
      deniedFileAccessOutsideReadRoots: 0,
      unfinishedResources: [
        { operation: "file-read", requestedPath },
        { operation: "file-read", requestedPath: "/outside/unrelated.txt" },
      ],
    };
    expect(failure).toMatchObject({ reason: "missing-answer", diagnostics: expected });
    expect(debugData()).toMatchObject([{ data: expected }]);
    expect(String(failure)).toContain(JSON.stringify(requestedPath));
    expect(String(failure)).toContain("unknown outcomes");
  });

  it("does not count a terminal denial summary again after a correlated error", async () => {
    const failure = await replay(
      [step(2, "ACTIVE", { Path: "/outside/read.txt" }), step(2, "ERROR")],
      [{ action: "read_file" }, { action: "read_file" }],
    );
    expect(failure).toMatchObject({
      diagnostics: {
        permissionDenials: 1,
        deniedResources: [{ operation: "file-read", requestedPath: "/outside/read.txt" }],
        deniedResourcePathsUnavailable: 0,
        unfinishedResources: [],
      },
    });
  });

  it("does not add a summary denial on top of an unattributed denial notice", async () => {
    const failure = await replay([{ type: "permission_denied" }], [{ action: "read_file" }]);
    expect(failure).toMatchObject({
      diagnostics: {
        permissionDenials: 1,
        permissionDenialsByOperation: { "file-read": 1 },
        deniedResourcePathsUnavailable: 1,
      },
    });
    expect(failure).toHaveProperty("diagnostics.permissionDenialsByOperation", { "file-read": 1 });
  });

  it.each(["success", "failed", "cancelled"])(
    "excludes explicit %s start/activity updates from unfinished targets",
    async (status) => {
      const failure = await replay([
        {
          ...start("complete", "read_file", { Path: "/outside/start-success.txt" }),
          status,
        },
        start("activity", "read_file", { Path: "/outside/activity-success.txt" }),
        {
          type: "step_update",
          step_type: "tool",
          id: "activity",
          status,
          name: "read_file",
        },
      ]);
      expect(failure).toMatchObject({
        diagnostics: { permissionDenials: 0, unfinishedResources: [] },
      });
      expect(String(failure)).not.toMatch(/start-success|activity-success/);
    },
  );

  it.each([
    { type: "assistant", step_index: 2, status: "success" },
    { type: "step_update", step_type: "planning", step_index: 2, status: "success" },
  ])("does not complete a pending tool from non-tool success: $type", async (nonTool) => {
    const failure = await replay([
      start("2", "read_file", { Path: "/outside/denied.txt" }),
      nonTool,
      result("2", "permission_denied"),
    ]);
    expect(failure).toMatchObject({
      diagnostics: {
        permissionDenials: 1,
        deniedResources: [{ operation: "file-read", requestedPath: "/outside/denied.txt" }],
        unfinishedResources: [],
      },
    });
  });

  it("does not label unfinished operations as denied without a denial observation", async () => {
    const failure = await replay([start("pending", "read_file", { Path: "/outside/pending.txt" })]);
    expect(failure).toMatchObject({
      diagnostics: {
        permissionDenials: 0,
        deniedResources: [],
        unfinishedResources: [{ operation: "file-read", requestedPath: "/outside/pending.txt" }],
      },
    });
    expect(String(failure)).not.toContain("Observed permission denials");
  });
  it("uses call IDs and structured file parameters without guessing from commands, nearby calls, or errors", async () => {
    const requestedPath = " /tmp/requested-alias/../image.png ";
    const failure = await replay([
      start("successful", "read_file", { Path: "/tmp/successful-read-secret.png" }),
      result("successful", "success"),
      start("unrelated", "read_file", { Path: "/tmp/unrelated-pending-target.png" }),
      start("denied", "read_file", { Path: requestedPath }),
      result("denied", "permission_denied"),
      result("denied", "permission_denied"),
      start("same-target", "read_file", { Path: requestedPath }),
      result("same-target", "permission_denied"),
      { ...result("write", "in_progress"), name: "write_file", input: { FilePath: "notes.md" } },
      { type: "permission_denied", tool_call_id: "write" },
      { type: "permission_denied", tool_call_id: "write" },
      start("command", "run_command", {
        CommandLine: "cat /tmp/command-secret",
        path: "/tmp/command-path-secret",
      }),
      result("command", "permission_denied"),
      start("unknown", "private_tool_identifier", { Path: "/tmp/unknown-path-secret" }),
      result("unknown", "permission_denied"),
      start("missing", "read_file", {}),
      {
        ...result("missing", "permission_denied"),
        message: "Permission denied: /tmp/error-only-secret.png",
      },
      { ...result("orphan", "permission_denied"), name: "read_file" },
    ]);
    const expected = {
      permissionDenials: 7,
      deniedResources: [
        { operation: "file-read", requestedPath },
        { operation: "file-write", requestedPath: "notes.md" },
      ],
      deniedResourcesOmitted: 0,
      deniedResourcePathsUnavailable: 2,
      unfinishedResources: [
        { operation: "file-read", requestedPath: "/tmp/unrelated-pending-target.png" },
      ],
    };
    expect(failure).toMatchObject({ reason: "missing-answer", diagnostics: expected });
    const events = debugData();
    expect(events).toMatchObject([{ data: expected }]);
    expect(String(failure)).toContain(JSON.stringify(requestedPath));
    expect(String(failure)).toContain("unavailable structured targets: 2");
    expect(JSON.stringify({ failure, message: String(failure), events })).not.toMatch(
      /successful-read-secret|command-secret|command-path-secret|unknown-path-secret|error-only-secret|private_tool_identifier/,
    );
  });

  it("bounds and quotes unfinished targets", async () => {
    const requestedPath = `/outside/${String.fromCharCode(27)}[31m\n"quoted".txt`;
    const events: Record<string, unknown>[] = [];
    for (let index = 0; index < 10; index++) {
      events.push(
        start(String(index), "read_file", {
          Path: index ? `/outside/${index}.txt` : requestedPath,
        }),
      );
    }
    events.push(start("duplicate", "read_file", { Path: requestedPath }));
    events.push(start("overlong", "read_file", { Path: "x".repeat(1_025) }));
    const failure = await replay(events);
    expect(failure).toMatchObject({
      diagnostics: {
        permissionDenials: 0,
        unfinishedResources: [
          { operation: "file-read", requestedPath },
          ...Array.from({ length: 7 }, (_, index) => ({
            operation: "file-read",
            requestedPath: `/outside/${index + 1}.txt`,
          })),
        ],
        unfinishedResourcesOmitted: 2,
        unfinishedResourcePathsUnavailable: 1,
      },
    });
    expect(String(failure)).toContain(JSON.stringify(requestedPath));
    expect(String(failure)).not.toContain(String.fromCharCode(27));
    expect(String(failure)).not.toContain("\n");
    expect(String(failure)).not.toMatch(/x{100}/);
  });

  it("retains a target supplied only in a nonterminal tool step update", async () => {
    const failure = await replay([
      step(1, "ACTIVE"),
      step(1, "PAUSED", { Path: "/tmp/paused-target.png" }),
      step(1, "ERROR"),
    ]);
    const expected = {
      deniedResources: [{ operation: "file-read", requestedPath: "/tmp/paused-target.png" }],
      deniedResourcePathsUnavailable: 0,
    };
    expect(failure).toMatchObject({ diagnostics: expected });
    expect(debugData()).toMatchObject([{ data: expected }]);
  });

  it.each(["start", "pending", "denial", "step"] as const)(
    "invalidates an older target when an overlong replacement arrives on a %s update",
    async (phase) => {
      const path = "x".repeat(1_025);
      const sequences = {
        start: [
          start("replace", "read_file", { Path: "old-target.txt" }),
          start("replace", "read_file", { Path: path }),
          result("replace", "permission_denied"),
        ],
        pending: [
          start("replace", "read_file", { Path: "old-target.txt" }),
          { ...result("replace", "in_progress"), input: { Path: path } },
          result("replace", "permission_denied"),
        ],
        denial: [
          start("replace", "read_file", { Path: "old-target.txt" }),
          { ...result("replace", "permission_denied"), input: { Path: path } },
        ],
        step: [
          step(1, "ACTIVE", { Path: "old-target.txt" }),
          step(1, "PAUSED", { Path: path }),
          step(1, "ERROR"),
        ],
      };
      const failure = await replay(sequences[phase]);
      const expected = {
        deniedResources: [],
        deniedResourcePathsUnavailable: 1,
      };
      expect(failure).toMatchObject({ reason: "missing-answer", diagnostics: expected });
      const events = debugData();
      expect(events).toMatchObject([{ data: expected }]);
      expect(JSON.stringify({ failure, message: String(failure), events })).not.toMatch(
        /old-target|x{100}/,
      );
    },
  );

  it("caps distinct targets and counts omitted denial observations without truncating paths", async () => {
    const events: Record<string, unknown>[] = [];
    for (let index = 0; index < 10; index++) {
      events.push(start(`read-${index}`, "read_file", { path: `/tmp/image-${index}.png` }));
      events.push(result(`read-${index}`, "permission_denied"));
    }
    events.push(start("repeat-kept", "read_file", { path: "/tmp/image-0.png" }));
    events.push(result("repeat-kept", "permission_denied"));
    events.push(start("repeat-omitted", "read_file", { path: "/tmp/image-9.png" }));
    events.push(result("repeat-omitted", "permission_denied"));
    const expected = {
      permissionDenials: 12,
      deniedResources: Array.from({ length: 8 }, (_, index) => ({
        operation: "file-read",
        requestedPath: `/tmp/image-${index}.png`,
      })),
      deniedResourcesOmitted: 3,
      deniedResourcePathsUnavailable: 0,
    };
    const failure = await replay(events);
    expect(failure).toMatchObject({ diagnostics: expected });
    const diagnostics = debugData();
    expect(diagnostics).toMatchObject([{ data: expected }]);
    expect(String(failure)).toContain("observations omitted from target list: 3");
    expect(JSON.stringify({ failure, message: String(failure), diagnostics })).not.toMatch(
      /image-[89]\.png/,
    );
  });

  it.each([
    [1_024, 1, 0],
    [1_025, 0, 1],
  ] as const)(
    "preserves a %i-character target or reports it unavailable, never a shortened path",
    async (length, retained, unavailable) => {
      const requestedPath = "x".repeat(length);
      const failure = await replay([
        start("length", "read_file", { Path: requestedPath }),
        result("length", "permission_denied"),
      ]);
      const expected = {
        deniedResources: retained ? [{ operation: "file-read", requestedPath }] : [],
        deniedResourcePathsUnavailable: unavailable,
      };
      expect(failure).toMatchObject({ diagnostics: expected });
      expect(debugData()).toMatchObject([{ data: expected }]);
      if (!retained) expect(String(failure)).not.toContain("x".repeat(100));
    },
  );

  it("quotes control characters as data in caller feedback while preserving the structured target", async () => {
    // biome-ignore lint/security/noSecrets: Synthetic filename tests control characters and quote escaping.
    const requestedPath = '/tmp/report\n\u001b[31m\u009b\u2028".png';
    const failure = await replay([
      start("escaped", "read_file", { Path: requestedPath }),
      result("escaped", "permission_denied"),
    ]);
    expect(failure).toMatchObject({
      diagnostics: {
        deniedResources: [{ operation: "file-read", requestedPath }],
      },
    });
    // biome-ignore lint/security/noSecrets: Expected JSON escaping of the synthetic control-character filename.
    expect(String(failure)).toContain('report\\n\\u001b[31m\\u009b\\u2028\\".png');
    expect(String(failure)).not.toContain(requestedPath);
    expect(String(failure)).not.toContain("\u001b");
    expect(String(failure)).not.toContain("\u009b");
    expect(String(failure)).not.toContain("\u2028");
    expect(debugData()).toMatchObject([
      {
        data: {
          deniedResources: [{ operation: "file-read", requestedPath }],
        },
      },
    ]);
  });
});
