import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Api,
  type AssistantMessage,
  createAssistantMessageEventStream,
  type Model,
  type ToolResultMessage,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { LocalReviewAuditStore } from "../../src/audit/local-review-audit-store.ts";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";
import { registerReviewAuditTool } from "../../src/tool/review_audit/register.ts";
import { reviewAuditSpec } from "../../src/tool/review_audit/spec.ts";
import { registerReviewOutputTool } from "../../src/tool/review_output/register.ts";
import { reviewOutputSpec } from "../../src/tool/review_output/spec.ts";
import { expectStructuredContent } from "../helpers/structured-result.ts";

function reply(model: Model<Api>, code?: string) {
  const message: AssistantMessage = {
    role: "assistant",
    content:
      code === undefined
        ? [{ type: "text", text: "done" }]
        : [{ type: "toolCall", id: "script", name: "codemode", arguments: { code } }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: code === undefined ? "stop" : "toolUse",
    timestamp: Date.now(),
  };
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "start", partial: { ...message, content: [], stopReason: "pending" } });
  stream.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message });
  return stream;
}

function textContent(result: ToolResultMessage): string {
  return result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

it("routes actual Review readers through Pi default codemode without paging reports or expanding audit selection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "supi-review-codemode-"));
  const reports = new ReviewArtifactStore();
  const audits = new LocalReviewAuditStore({ agentDir: directory });
  const observed: ToolResultEvent[] = [];
  const artifactId = "review-audit-11111111-1111-1111-1111-111111111111";
  const messages = [
    { role: "user", content: "UNSELECTED_REPLAY_SECRET" },
    { role: "assistant", content: [{ type: "text", text: "SELECTED_MESSAGE_SECRET" }] },
  ];
  const raw = JSON.stringify(
    { format: "supi-review-audit/v1", messages, packet: "PRIVATE_PACKET_".repeat(2_000) },
    null,
    2,
  );
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    const auditDirectory = join(directory, "supi-review", "audits");
    await mkdir(auditDirectory, { recursive: true });
    await writeFile(join(auditDirectory, `${artifactId}.json`), raw);
    const settingsManager = SettingsManager.inMemory({
      defaultTools: ["+codemode"],
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: directory,
      agentDir: directory,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        createCodemodeExtension(),
        (pi) => {
          registerReviewOutputTool(pi, reports);
          registerReviewAuditTool(pi, audits);
          pi.on("tool_result", (event) => {
            observed.push(event);
          });
        },
      ],
    });
    await resourceLoader.reload();
    const modelRuntime = await ModelRuntime.create({
      authPath: join(directory, "auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const model = modelRuntime.getModels()[0];
    if (!model) throw new Error("Missing local model catalog for deterministic routing test");
    ({ session } = await createAgentSession({
      cwd: directory,
      agentDir: directory,
      model,
      modelRuntime,
      settingsManager,
      resourceLoader,
      sessionManager: SessionManager.inMemory(directory),
    }));
    await session.bindExtensions({});
    const source = `${"complete report 😀\n".repeat(2_000)}REPORT TAIL`;
    const report = reports.create(source);
    for (const spec of [reviewOutputSpec, reviewAuditSpec]) {
      expect(session.getToolDefinition(spec.name)?.outputSchema).toEqual(spec.outputSchema);
    }
    const runScript = async (code: string) => {
      if (!session) throw new Error("Session not initialized");
      let requests = 0;
      session.agent.streamFunction = (requestedModel) =>
        reply(requestedModel, ++requests === 1 ? code : undefined);
      // Only provider/auth preflight is bypassed; Pi executes codemode, readers, and nested hooks.
      await session.agent.prompt("Run deterministic Review reader script");
      const result = [...session.messages]
        .reverse()
        .find(
          (message): message is ToolResultMessage =>
            message.role === "toolResult" && message.toolName === "codemode",
        );
      if (!result) throw new Error("Missing codemode result");
      return result;
    };
    const result = await runScript(`
      const report = await tools.review_output({ artifactId: ${JSON.stringify(report.id)}, offset: 1000, limit: 1024 });
      const listed = await tools.review_audit({});
      const outline = await tools.review_audit({ artifactId: listed.audits[0].artifactId });
      const message = await tools.review_audit({ artifactId: outline.artifactId, view: "message", messageIndex: outline.messageIndexes[1] });
      const raw = await tools.review_audit({ artifactId: outline.artifactId, view: "raw", limit: 1024 });
      return {
        reportComplete: report.text.length === report.totalCharacters && report.text.endsWith("REPORT TAIL"),
        reportLength: report.text.length,
        listMode: listed.mode, totalAudits: listed.totalAudits,
        outlineMode: outline.mode, roles: outline.rows.map(row => row.role),
        metadataOnly: !JSON.stringify({ listed, outline }).includes("SECRET"),
        messageMode: message.mode, messageIndex: message.messageIndex,
        selectedOnly: message.text.includes("SELECTED_MESSAGE_SECRET") && !message.text.includes("UNSELECTED_REPLAY_SECRET"),
        rawMode: raw.mode, rawIsPage: raw.text.length < raw.totalCharacters && raw.nextOffset !== undefined,
        cleanPages: ![listed, outline, message, raw].some(page => page.text.includes("[output paged;"))
      };
    `);
    expect(result.isError).toBe(false);
    const text = textContent(result);
    for (const fragment of [
      '"reportComplete":true',
      `"reportLength":${source.length}`,
      '"listMode":"list","totalAudits":1',
      '"outlineMode":"outline","roles":["user","assistant"]',
      '"metadataOnly":true',
      '"messageMode":"message","messageIndex":1',
      '"selectedOnly":true',
      '"rawMode":"raw","rawIsPage":true',
      '"cleanPages":true',
    ])
      expect(text).toContain(fragment);

    const readerEvents = observed.filter((event) =>
      ["review_output", "review_audit"].includes(event.toolName),
    );
    expect(readerEvents).toHaveLength(5);
    for (const event of readerEvents) {
      expectStructuredContent(session.getToolDefinition(event.toolName), event);
      expect(event.isError).toBe(false);
    }
    const reportEvent = readerEvents.find((event) => event.toolName === "review_output");
    expect(reportEvent?.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("[output paged; call review_output"),
    });
    expect(
      reportEvent?.content[0]?.type === "text" && reportEvent.content[0].text.length,
    ).toBeLessThanOrEqual(1_024);

    for (const [code, error] of [
      ['return await tools.review_output({ artifactId: "missing" });', "not found or has expired"],
      [
        'return await tools.review_audit({ artifactId: "review-audit-22222222-2222-2222-2222-222222222222" });',
        "not found or has expired",
      ],
      [
        `return await tools.review_audit({ artifactId: "${artifactId}", view: "message" });`,
        "requires a non-negative integer messageIndex",
      ],
    ]) {
      const failure = await runScript(code);
      expect(failure.isError).toBe(true);
      expect(textContent(failure)).toContain(error);
    }
  } finally {
    session?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
