import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { Value } from "typebox/value";
import { expect, it, vi } from "vitest";
import { createSessionCache } from "../../src/app/app.ts";
import { registerWorkspaceRecoveryHandler } from "../../src/substrate/lsp/recovery.ts";
import { createLspAdapterState, type LspAdapterState } from "../../src/substrate/lsp/state.ts";
import { registerCodeIntelligenceTools } from "../../src/tool/register.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "../../src/tool/specs.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
function reply(
  model: Model<Api>,
  content: AssistantMessage["content"],
  stopReason: "toolUse" | "stop",
) {
  const message: AssistantMessage = {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason,
    timestamp: Date.now(),
  };
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "start", partial: { ...message, content: [], stopReason: "pending" } });
  stream.push({ type: "done", reason: stopReason, message });
  return stream;
}

it("routes all five native tools through Pi default codemode, preserves recovery details, and mutates only on Apply", async () => {
  const directory = mkdtempSync(join(tmpdir(), "code-codemode-"));
  const cwd = join(directory, "workspace");
  const agentDir = join(directory, "agent");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  const file = join(cwd, "index.ts");
  writeFileSync(file, "export function widget() {}\n");
  registerMockProvider(cwd, {
    hover: async () => completedCodeQuery({ contents: "function widget(): void" }),
    refactor: async () => ({
      kind: "precise",
      authorizedMutationRoots: [cwd],
      edits: {
        edits: [
          {
            file,
            range: { start: { line: 0, character: 16 }, end: { line: 0, character: 22 } },
            newText: "gadget",
          },
        ],
      },
    }),
  });
  const sessions = createSessionCache();
  const results: ToolResultEvent[] = [];
  const noteWorkspaceWrites = vi.fn();
  const recovery = createLspAdapterState();
  recovery.controller = {
    cwd,
    workspaceRuntime: { noteWorkspaceWrites },
  } as unknown as LspAdapterState["controller"];
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    const settingsManager = SettingsManager.inMemory({
      defaultTools: ["+codemode"],
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        createCodemodeExtension(),
        (pi) => {
          // Actual public registrations and workflows; only provider observations are controlled.
          registerCodeIntelligenceTools(pi, sessions.getOrCreate);
          registerWorkspaceRecoveryHandler(pi, recovery);
          pi.on("tool_result", (event) => {
            results.push(event);
          });
        },
      ],
    });
    await resourceLoader.reload();
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const model = modelRuntime.getModels()[0];
    if (!model) throw new Error("Missing local model catalog for deterministic stream");
    ({ session } = await createAgentSession({
      cwd,
      agentDir,
      model,
      modelRuntime,
      settingsManager,
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
    }));
    await session.bindExtensions({});
    for (const spec of CODE_INTELLIGENCE_TOOL_SPECS) {
      expect(session.getToolDefinition(spec.name)?.outputSchema).toEqual(spec.outputSchema);
      expect(spec.outputSchema).toBeDefined();
    }
    const runScript = async (code: string) => {
      if (!session) throw new Error("Session not initialized");
      let calls = 0;
      session.agent.streamFunction = (requestedModel) =>
        ++calls === 1
          ? reply(
              requestedModel,
              [
                {
                  type: "toolCall",
                  id: `script-${session?.messages.length}`,
                  name: "codemode",
                  arguments: { code },
                },
              ],
              "toolUse",
            )
          : reply(requestedModel, [{ type: "text", text: "done" }], "stop");
      // Skip only provider auth preflight; real AgentSession executes nested tools and hooks.
      await session.agent.prompt("Run offline native code tools");
      const result = [...session.messages]
        .reverse()
        .find(
          (message): message is ToolResultMessage =>
            message.role === "toolResult" && message.toolName === "codemode",
        );
      if (!result) throw new Error("Missing codemode result");
      return result;
    };
    const planned = await runScript(`
      const inspect = await tools.code_inspect({ point: { file: "index.ts", line: 1, character: 17 } });
      const orientation = await tools.code_orientation({ maxResults: 5 });
      const health = await tools.code_health({ include: ["servers"] });
      const plan = await tools.code_refactor_plan({ target: { anchor: inspect.point }, operation: { rename_symbol: { newName: "gadget" } } });
      store("planId", plan.planId);
      return { hover: inspect.sections.hover.data, file: orientation.workspace.directFiles[0].path,
        server: health.servers[0].name, edits: plan.edits.length, replacement: plan.edits[0].newText };
    `);
    expect(planned.isError).toBe(false);
    expect(planned.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining('"replacement":"gadget"'),
        }),
      ]),
    );
    const text = planned.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    expect(text).toContain('"hover":"function widget(): void"');
    expect(text).toContain('"file":"index.ts"');
    expect(text).toContain('"server":"test-lsp"');
    expect(readFileSync(file, "utf8")).toBe("export function widget() {}\n");
    expect(noteWorkspaceWrites).not.toHaveBeenCalled();
    const applied = await runScript(
      `const result = await tools.code_refactor_apply({ planId: load("planId") }); return { kind: result.kind, changed: result.files[0].file, edits: result.editCount };`,
    );
    expect(applied.isError).toBe(false);
    expect(applied.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining('"kind":"applied","changed":"index.ts","edits":1'),
        }),
      ]),
    );
    expect(readFileSync(file, "utf8")).toBe("export function gadget() {}\n");
    expect(noteWorkspaceWrites).toHaveBeenCalledTimes(1);
    expect(results.find((event) => event.toolName === "code_refactor_apply")).toMatchObject({
      details: { data: { changedFiles: [file] } },
      structuredContent: { kind: "applied" },
    });
    const names = [
      "code_inspect",
      "code_orientation",
      "code_health",
      "code_refactor_plan",
      "code_refactor_apply",
    ];
    for (const name of names) {
      const event = results.find((result) => result.toolName === name);
      const schema = session.getToolDefinition(name)?.outputSchema;
      if (!event || !schema) throw new Error(`Missing actual result/schema: ${name}`);
      expect(event.isError).toBe(false);
      expect(event.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "text", text: expect.any(String) }),
        ]),
      );
      expect([...Value.Errors(schema, event.structuredContent)]).toEqual([]);
      expect(JSON.parse(JSON.stringify(event.structuredContent))).toEqual(event.structuredContent);
    }
    // Corrective outcomes remain data rather than becoming execution failures.
    const invalid = await runScript(
      'return (await tools.code_refactor_apply({ planId: "missing" })).kind;',
    );
    expect(invalid.isError).toBe(false);
    expect(invalid.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("invalid-input") }),
      ]),
    );
    registerMockProvider(cwd, {
      refactor: async () => ({ kind: "unavailable", reason: "Offline refactor capability" }),
    });
    const failure = await runScript(
      'return await tools.code_refactor_plan({ target: { anchor: { file: "index.ts", line: 1, character: 17 } }, operation: { rename_symbol: { newName: "next" } } });',
    );
    expect(failure.isError).toBe(true);
    expect(failure.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("Offline refactor capability") }),
      ]),
    );
  } finally {
    session?.dispose();
    sessions.clear();
    clearMockRuntime();
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
