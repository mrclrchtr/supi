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
} from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import extension from "../../src/extension.ts";
import { WEB_TOOL_SPECS } from "../../src/tool/tool-specs.ts";
import { createFakeBx, useFakeBx, writeWebSearchSetting } from "../helpers/fake-bx.ts";
import { expectStructuredContent } from "../helpers/structured-result.ts";

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

it("delivers actual web tool data through PI's default codemode and rejects thrown failures", async () => {
  const environment = Object.fromEntries(
    ["PATH", "BX_ARGS_FILE", "BX_OUTPUT", "BX_STDERR", "BX_EXIT_CODE"].map((key) => [
      key,
      process.env[key],
    ]),
  );
  const fake = createFakeBx();
  const results = new Map<string, unknown>();
  const source = {
    title: "Fixture source",
    url: "https://example.test/source",
    snippets: ["excerpt"],
  };
  useFakeBx(fake, JSON.stringify({ grounding: { generic: [source] } }));
  writeWebSearchSetting(fake.cwd, true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v2/libs/search") {
        return Response.json({
          results: [
            {
              id: "/example/lib",
              title: "Fixture library",
              description: "Library docs",
              totalSnippets: 7,
              trustScore: 8,
              benchmarkScore: 90,
            },
          ],
        });
      }
      if (url.pathname === "/api/v2/context") {
        return Response.json([
          { title: "Example", content: "const answer = 42", source: source.url },
        ]);
      }
      if (url.href === "https://example.test/page") {
        return new Response(init?.method === "HEAD" ? null : "# Page\n\nBody", {
          headers: { "content-type": "text/markdown" },
        });
      }
      throw new Error(`Unexpected network request: ${url.origin}${url.pathname}`);
    }),
  );

  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    const settingsManager = SettingsManager.inMemory({
      defaultTools: ["+codemode"],
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: fake.cwd,
      agentDir: fake.directory,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        createCodemodeExtension(),
        extension,
        (pi) => {
          pi.on("tool_result", (event) => {
            results.set(event.toolName, event);
          });
        },
      ],
    });
    await resourceLoader.reload();
    const modelRuntime = await ModelRuntime.create({
      authPath: join(fake.directory, "auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const model = modelRuntime.getModels()[0];
    if (!model) throw new Error("Missing local model catalog for the deterministic stream");
    ({ session } = await createAgentSession({
      cwd: fake.cwd,
      agentDir: fake.directory,
      model,
      modelRuntime,
      settingsManager,
      resourceLoader,
      sessionManager: SessionManager.inMemory(fake.cwd),
    }));
    await session.bindExtensions({});
    for (const spec of WEB_TOOL_SPECS) {
      const tool = session.getToolDefinition(spec.name);
      expect(tool?.parameters).toEqual(spec.parameters);
      expect(tool?.outputSchema).toEqual(spec.outputSchema);
    }

    const runScript = async (code: string) => {
      if (!session) throw new Error("Session not initialized");
      let requests = 0;
      session.agent.streamFunction = (requestedModel) =>
        ++requests === 1
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
      // Bypass only provider-auth preflight; the real AgentSession executes tools and nested hooks.
      await session.agent.prompt("Run offline structured web tools");
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
      const page = await tools.web_fetch_md({ url: "https://example.test/page" });
      const search = await tools.web_search({ query: "offline fixture" });
      const libraries = await tools.web_docs_search({ library_name: "fixture", query: "example" });
      const docs = await tools.web_docs_fetch({ library_id: libraries.results[0].id, query: "example", raw: true });
      return { page: page.markdown, source: search.sources[0].title,
        count: search.sourceCount, library: libraries.results[0].id, snippet: docs.snippets[0].content };
    `);
    expect(result.isError).toBe(false);
    const text = result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    expect(text).toContain('"source":"Fixture source"');
    expect(text).toContain('"library":"/example/lib"');
    expect(text).toContain('"snippet":"const answer = 42"');
    expect(text).toContain('"page":"# Page\\n\\nBody"');
    for (const spec of WEB_TOOL_SPECS) {
      const event = results.get(spec.name);
      expectStructuredContent(session.getToolDefinition(spec.name), event);
      expect(event).toMatchObject({
        isError: false,
        content: [{ type: "text", text: expect.any(String) }],
      });
    }

    const failure = await runScript(
      'return await tools.web_fetch_md({ url: "ftp://example.test/page" });',
    );
    expect(failure.isError).toBe(true);
    expect(failure.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("URL must be http(s)"),
        }),
      ]),
    );
  } finally {
    session?.dispose();
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fake.cleanup();
  }
}, 30_000);
