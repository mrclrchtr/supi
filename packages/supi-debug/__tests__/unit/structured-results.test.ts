import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  clearDebugEvents,
  configureDebugRegistry,
  DEBUG_EVENT_ENTRY_TYPE,
  recordDebugEvent,
} from "@mrclrchtr/supi-core/debug";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config.ts", () => ({ applyDebugConfig: vi.fn() }));

import { registerDebugCommand } from "../../src/command.ts";
import { applyDebugConfig, type DebugConfig } from "../../src/config.ts";
import { registerDebugTool } from "../../src/tool/debug/register.ts";
import { renderDebugToolResult } from "../../src/tool/debug/render.ts";
import type { DebugToolResult } from "../../src/tool/debug/result.ts";

const directories: string[] = [];
const config: DebugConfig = {
  enabled: true,
  agentAccess: "sanitized",
  maxEvents: 100,
  agentRunRetrospectivesEnabled: false,
};
const event = {
  source: "fixture",
  level: "info" as const,
  category: "operation",
  message: "Fixture event",
};
const theme = { fg: (_color: string, text: string) => text } as Theme;

function setConfig(overrides: Partial<DebugConfig> = {}) {
  const value = { ...config, ...overrides };
  configureDebugRegistry(value);
  vi.mocked(applyDebugConfig).mockReturnValue(value);
}

function registeredTool() {
  const pi = createPiMock();
  registerDebugTool(pi as never);
  const tool = getTool(pi, "debug");
  return {
    async execute(params: unknown = {}, signal?: AbortSignal) {
      const result = (await tool.execute(
        "debug-fixture",
        params,
        signal,
        undefined,
        makeCtx({ cwd: "/repo" }),
      )) as DebugToolResult;
      const schema = (tool as typeof tool & { outputSchema: TSchema }).outputSchema;
      expect(schema).toBeDefined();
      expect([...Value.Errors(schema, result.structuredContent)]).toEqual([]);
      // Persisted/transport values must still satisfy the registered schema.
      const serialized: unknown = JSON.parse(JSON.stringify(result.structuredContent));
      expect(Value.Check(schema, serialized)).toBe(true);
      expect(serialized).toEqual(result.structuredContent);
      return result;
    },
  };
}

async function sessionFile(events: unknown[]) {
  const dir = await mkdtemp(join(tmpdir(), "supi-debug-structured-"));
  directories.push(dir);
  const path = join(dir, "session.jsonl");
  await writeFile(
    path,
    events
      .map((data) => JSON.stringify({ type: "custom", customType: DEBUG_EVENT_ENTRY_TYPE, data }))
      .join("\n"),
  );
  return path;
}

function rendered(result: DebugToolResult, expanded: boolean): string {
  return renderDebugToolResult(result, { expanded, isPartial: false }, theme, {
    isError: false,
  })
    .render(200)
    .join("\n");
}

beforeAll(() => initTheme("dark"));

beforeEach(() => {
  clearDebugEvents();
  setConfig();
});

afterEach(async () => {
  clearDebugEvents();
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("debug native structured results", () => {
  it("returns live evidence with exact filter/limit counts, access status, and consistent UI facts", async () => {
    const operationId = "op-AAAAAAAAAAAAAAAAAAAAAA";
    recordDebugEvent({ ...event, operationId, message: "older" });
    recordDebugEvent({ ...event, source: "other" });
    recordDebugEvent({
      ...event,
      operationId,
      message: "newer",
      cwd: "/workspace",
      data: { method: "hover", apiToken: "hidden" },
      rawData: { private: "raw-only" },
    });
    const result = await registeredTool().execute({
      source: "fixture",
      limit: 1,
      includeRaw: true,
    });

    expect(result.structuredContent).toMatchObject({
      provenance: { kind: "live", scope: "retained-buffer" },
      selection: {
        matchedEventCount: 2,
        returnedEventCount: 1,
        omittedEventCount: 1,
        complete: false,
      },
      rawAccessDenied: true,
      rawDataUnavailable: false,
      dataNormalized: false,
      modelOutput: { truncated: false },
      events: [
        {
          message: "newer",
          operationId,
          cwd: "/workspace",
          data: { method: "hover", apiToken: "[REDACTED]" },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("raw-only");
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining("Showing 1 of 2") });
    expect(result.details.eventCount).toBe(1);
    expect(result.details.queryOmittedEventCount).toBe(1);
    expect(rendered(result, false)).toContain("1 excluded by limit");
    expect(rendered(result, true)).toContain("newer");
    expect(rendered(result, true)).toContain("query limit");
  });

  it("distinguishes a successful empty selection from events excluded by a fractional limit", async () => {
    const tool = registeredTool();
    const empty = await tool.execute();
    expect(empty.structuredContent).toMatchObject({
      events: [],
      emptyReason: "no-matches",
      selection: {
        matchedEventCount: 0,
        returnedEventCount: 0,
        omittedEventCount: 0,
        complete: true,
      },
    });
    expect(empty.isError).not.toBe(true);
    expect(empty.content[0]).toMatchObject({ text: expect.stringContaining("No matching") });

    recordDebugEvent(event);
    const limited = await tool.execute({ limit: 0.5 });
    expect(limited.structuredContent).toMatchObject({
      events: [],
      emptyReason: "query-limit",
      selection: {
        matchedEventCount: 1,
        returnedEventCount: 0,
        omittedEventCount: 1,
        complete: false,
      },
    });
    expect(rendered(limited, true)).toContain("No events selected by limit");
  });

  it("snapshots permitted raw JSON and normalizes non-JSON values without persisting raw UI data", async () => {
    setConfig({ agentAccess: "raw" });
    const shared = { value: 42 };
    const raw: Record<string, unknown> = {
      count: 2n,
      notFinite: Number.NaN,
      missing: undefined,
      fn: () => "private implementation",
      symbol: Symbol("private description"),
      instance: new Map([["private", "runtime state"]]),
      first: shared,
      second: shared,
    };
    raw.self = raw;
    recordDebugEvent({ ...event, rawData: raw });
    const result = await registeredTool().execute({ includeRaw: true });

    expect(result.structuredContent).toMatchObject({
      rawAccessDenied: false,
      dataNormalized: true,
      events: [
        {
          rawData: {
            count: "2n",
            notFinite: "NaN",
            missing: "[Undefined]",
            fn: "[Function]",
            symbol: "[Symbol]",
            instance: "[Non-JSON object]",
            self: "[Circular]",
            first: { value: 42 },
            second: { value: 42 },
          },
        },
      ],
    });
    shared.value = 99;
    expect(result.structuredContent.events[0]?.rawData).toMatchObject({ first: { value: 42 } });
    expect(result.details.events[0]).not.toHaveProperty("rawData");
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining("2n") });
    expect(JSON.stringify(result)).not.toContain("private implementation");
  });

  it("keeps all selected evidence when model text and transcript details are truncated", async () => {
    for (let index = 0; index < 30; index++) {
      recordDebugEvent({ ...event, message: `event-${index}: ${"x".repeat(3_000)}` });
    }
    const result = await registeredTool().execute();
    expect(result.structuredContent.events).toHaveLength(30);
    expect(result.structuredContent.events[29]?.message).toHaveLength(3_009);
    expect(result.structuredContent.selection.complete).toBe(true);
    expect(result.structuredContent.modelOutput).toMatchObject({ truncated: true });
    expect(result.details.events).toHaveLength(12);
    expect(result.details.omittedEventCount).toBe(18);
    const text = result.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(50 * 1024);
    expect(text).toContain("[Output truncated:");
    expect(rendered(result, false)).toContain("30 events");
    expect(rendered(result, true)).toContain("18 events omitted from the transcript view");
  });

  it("reports historical provenance, invalid evidence and limit omissions without ever exposing raw data", async () => {
    const path = await sessionFile([
      { ...event, id: 1, timestamp: 10, rawData: { secret: "never" } },
      { ...event, id: 2, timestamp: 20, data: { password: "hidden" } },
      { ...event, id: 3, timestamp: 30, source: "other" },
      { invalid: true },
    ]);
    setConfig({ enabled: false, agentAccess: "raw" });
    const result = await registeredTool().execute({
      sessionFile: path,
      source: "fixture",
      limit: 1,
      includeRaw: true,
    });
    expect(result.structuredContent).toMatchObject({
      events: [{ id: 2, data: { password: "[REDACTED]" } }],
      provenance: {
        kind: "persisted",
        sessionFile: path,
        persistedEventCount: 4,
        invalidEventCount: 1,
      },
      selection: {
        matchedEventCount: 2,
        returnedEventCount: 1,
        omittedEventCount: 1,
        complete: false,
      },
      rawAccessDenied: true,
      rawDataUnavailable: true,
    });
    expect(result.structuredContent.events[0]).not.toHaveProperty("rawData");
    expect(rendered(result, false)).toContain("1 invalid entries");
    expect(rendered(result, true)).toContain("evidence is incomplete");
    expect(rendered(result, true)).toContain("Raw debug data is not persisted");
  });

  it("distinguishes no persisted records, zero historical matches, and invalid-only evidence", async () => {
    const tool = registeredTool();
    const noRecords = await tool.execute({ sessionFile: await sessionFile([]) });
    expect(noRecords.structuredContent.emptyReason).toBe("no-persisted-events");
    expect(noRecords.structuredContent.selection.complete).toBe(true);
    const noMatches = await tool.execute({
      sessionFile: await sessionFile([{ ...event, id: 1, timestamp: 10 }]),
      source: "missing",
    });
    expect(noMatches.structuredContent.emptyReason).toBe("no-matches");
    expect(noMatches.structuredContent.selection.complete).toBe(true);
    const invalid = await tool.execute({ sessionFile: await sessionFile([{ invalid: true }]) });
    expect(invalid.structuredContent.selection.complete).toBe(false);
    expect(rendered(invalid, false)).toContain("invalid entries skipped");
  });

  it("discloses malformed JSONL lines without confusing them with invalid parsed debug entries", async () => {
    const path = await sessionFile([{ ...event, id: 1, timestamp: 10 }]);
    await appendFile(
      path,
      '\n\n \t\n{"type":"message"}\n{"type":"custom","customType":"supi-debug-event","private":"must-not-be-echoed","data":\n{"type":"message",\nnot-json\n',
    );
    const result = await registeredTool().execute({ sessionFile: path });

    expect(result.structuredContent.provenance).toMatchObject({
      kind: "persisted",
      persistedEventCount: 1,
      invalidEventCount: 0,
      malformedLineCount: 3,
    });
    expect(result.structuredContent.selection).toMatchObject({
      matchedEventCount: 1,
      returnedEventCount: 1,
      omittedEventCount: 0,
      complete: false,
    });
    expect(result.details).toMatchObject({ malformedLineCount: 3 });
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining("3 malformed JSONL lines"),
    });
    expect(rendered(result, false)).toContain("3 malformed lines");
    expect(rendered(result, true)).toContain("evidence is incomplete");
    expect(JSON.stringify(result)).not.toContain("must-not-be-echoed");

    const pi = createPiMock();
    registerDebugCommand(pi as never, () => config, Number);
    const command = pi.commands.get("supi-debug") as {
      handler: (args: string, ctx: unknown) => Promise<void>;
    };
    await command.handler(`sessionFile=${path}`, makeCtx({ cwd: "/repo" }));
    expect(pi.messages[0]).toMatchObject({
      content: expect.stringContaining("3 malformed JSONL lines"),
      details: { malformedLineCount: 3 },
    });
  });

  it("does not claim an unparseable-only session has no persisted debug events", async () => {
    const path = await sessionFile([]);
    await appendFile(path, '{"type":"custom","customType":"supi-debug-event","data":\n');
    const result = await registeredTool().execute({ sessionFile: path });
    expect(result.structuredContent).toMatchObject({
      events: [],
      emptyReason: "no-matches",
      provenance: { persistedEventCount: 0, invalidEventCount: 0, malformedLineCount: 1 },
      selection: { complete: false },
    });
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining("1 malformed JSONL line"),
    });
    expect(result.content[0]).toMatchObject({
      text: expect.not.stringContaining("cannot be backfilled"),
    });
    expect(rendered(result, false)).toContain("malformed lines");
  });

  it.each(["live", "historical-empty", "historical-no-matches", "query-limit"])(
    "keeps raw-access warnings in empty %s text and transcript views",
    async (kind) => {
      let params: Record<string, unknown> = { includeRaw: true };
      if (kind === "historical-empty") {
        params = { ...params, sessionFile: await sessionFile([]) };
      } else if (kind === "historical-no-matches") {
        params = {
          ...params,
          sessionFile: await sessionFile([{ ...event, id: 1, timestamp: 10 }]),
          source: "missing",
        };
      } else if (kind === "query-limit") {
        recordDebugEvent(event);
        params.limit = 0.5;
      }
      const historical = kind.startsWith("historical");
      const warning = historical
        ? "Raw debug data is not persisted"
        : "Raw debug data was requested";
      const result = await registeredTool().execute(params);
      expect(result.structuredContent).toMatchObject({
        events: [],
        rawAccessDenied: true,
        rawDataUnavailable: historical,
      });
      expect(result.content[0]).toMatchObject({ text: expect.stringContaining(warning) });
      expect(rendered(result, false)).toContain("raw unavailable");
      expect(rendered(result, true)).toContain(warning);
    },
  );

  it("preserves thrown failures and cancellation instead of returning successful empty evidence", async () => {
    const tool = registeredTool();
    setConfig({ enabled: false });
    await expect(tool.execute()).rejects.toThrow("capture is disabled");
    setConfig({ agentAccess: "off" });
    await expect(tool.execute()).rejects.toThrow("Agent access");
    setConfig();
    await expect(tool.execute({ operationId: "invalid" })).rejects.toThrow(
      "Invalid Debug Operation ID",
    );
    const path = await sessionFile([]);
    await expect(tool.execute({ sessionFile: `${path}.missing` })).rejects.toThrow("ENOENT");
    const controller = new AbortController();
    controller.abort();
    await expect(tool.execute({ sessionFile: path }, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
