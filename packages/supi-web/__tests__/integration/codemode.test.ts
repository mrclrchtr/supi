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
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { expect, it, vi } from "vitest";
import extension from "../../src/extension.ts";
import { WEB_TOOL_SPECS } from "../../src/tool/tool-specs.ts";
import { createFakeBx, useFakeBx, writeWebSearchSetting } from "../helpers/fake-bx.ts";
import { expectStructuredContent } from "../helpers/structured-result.ts";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function librarySearchResponse(name: string | null): Response {
  if (name === "missing") {
    return Response.json(
      { error: "no_libraries_found", message: "No libraries found." },
      { status: 404 },
    );
  }
  if (name === "forbidden") {
    return Response.json(
      { error: "unauthorized", message: "Unauthorized fixture" },
      { status: 401 },
    );
  }
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

function contextResponse(format: string | null, sourceUrl: string): Response {
  // Match the real endpoint: JSON requires explicit format negotiation.
  if (format !== "json") {
    return new Response("# Fixture documentation", { headers: { "content-type": "text/plain" } });
  }
  return Response.json({
    codeSnippets: [
      {
        codeTitle: "Example",
        codeDescription: "",
        codeLanguage: "javascript",
        codeList: [{ language: "javascript", code: "const answer = 42" }],
        codeId: sourceUrl,
      },
    ],
    infoSnippets: [{ content: "Fixture guidance", breadcrumb: "Guide", pageId: sourceUrl }],
  });
}

function firecrawlResponse(init?: RequestInit): Response {
  expect(init?.headers).toMatchObject({ Authorization: "Bearer fixture-key" });
  const target = JSON.parse(String(init?.body)).url;
  if (target.endsWith("/provider-failure")) {
    return Response.json({ success: false }, { status: 502 });
  }
  return Response.json({
    success: true,
    data: {
      markdown: "# Recovered article",
      warning: null,
      metadata: { statusCode: 200, cacheState: "hit" },
    },
  });
}

function pageResponse(pathname: string, init?: RequestInit): Response {
  if (pathname !== "/page") {
    return new Response("Not Found", { status: 404, statusText: "Not Found" });
  }
  return new Response(init?.method === "HEAD" ? null : "# Page\n\nBody", {
    headers: { "content-type": "text/markdown" },
  });
}

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
  const results = new Map<string, unknown[]>();
  vi.stubEnv("CONTEXT7_API_KEY", undefined);
  vi.stubEnv("FIRECRAWL_API_KEY", undefined);
  const source = {
    title: "Fixture source",
    url: "https://example.test/source",
    snippets: ["excerpt"],
  };
  useFakeBx(fake, JSON.stringify({ grounding: { generic: [source] } }));
  writeWebSearchSetting(fake.cwd, true);
  writeSupiConfig({ section: "web", scope: "project", cwd: fake.cwd }, { firecrawlEnabled: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v2/libs/search") {
        return librarySearchResponse(url.searchParams.get("libraryName"));
      }
      if (url.pathname === "/api/v2/context") {
        return contextResponse(url.searchParams.get("type"), source.url);
      }
      if (url.origin === "https://api.firecrawl.dev") {
        return firecrawlResponse(init);
      }
      if (url.origin === "https://example.com") {
        return new Response("Forbidden", { status: 403 });
      }
      if (url.origin === "https://example.test") {
        return pageResponse(url.pathname, init);
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
            const events = results.get(event.toolName) ?? [];
            events.push(event);
            results.set(event.toolName, events);
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
    // Context7 credentials must not be required for extension loading or registration.
    await session.bindExtensions({});
    vi.stubEnv("CONTEXT7_API_KEY", "ctx7sk-test-key");
    vi.stubEnv("FIRECRAWL_API_KEY", "fixture-key");
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
      const recovered = await tools.web_fetch_md({ url: "https://example.com/blocked", fetch_mode: "firecrawl_fallback" });
      const rendered = await tools.web_fetch_md({ url: "https://example.com/dynamic", fetch_mode: "firecrawl" });
      const search = await tools.web_search({ query: "offline fixture" });
      const libraries = await tools.web_docs_search({ library_name: "fixture", query: "example" });
      const docs = await tools.web_docs_fetch({ library_id: libraries.results[0].id, query: "example", raw: true });
      const textDocs = await tools.web_docs_fetch({ library_id: libraries.results[0].id, query: "example" });
      const empty = await tools.web_docs_search({ library_name: "missing", query: "example" });
      return { page: page.markdown, source: search.sources[0].title,
        count: search.sourceCount, library: libraries.results[0].id, snippet: docs.snippets[0].content,
        guidance: docs.snippets[1].content, textDocs: textDocs.markdown, emptyCount: empty.count,
        emptyResults: empty.results, recovered: recovered.markdown, retrieval: recovered.retrieval,
        rendered: rendered.markdown };
    `);
    expect(result.isError).toBe(false);
    const text = result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    expect(text).toContain('"source":"Fixture source"');
    expect(text).toContain('"library":"/example/lib"');
    expect(text).toContain('"snippet":"```javascript');
    expect(text).toContain("const answer = 42");
    expect(text).toContain('"guidance":"Fixture guidance"');
    expect(text).toContain('"textDocs":"# Fixture documentation"');
    expect(text).toContain('"emptyCount":0,"emptyResults":[]');
    expect(text).toContain('"page":"# Page\\n\\nBody"');
    expect(text).toContain('"recovered":"# Recovered article"');
    expect(text).toContain('"rendered":"# Recovered article"');
    expect(text).toContain('"retrieval":{"provider":"firecrawl","cacheState":"hit"}');
    for (const spec of WEB_TOOL_SPECS) {
      const events = results.get(spec.name) ?? [];
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expectStructuredContent(session.getToolDefinition(spec.name), event);
        expect(event).toMatchObject({
          isError: false,
          content: [{ type: "text", text: expect.any(String) }],
        });
      }
    }

    const providerFailure = await runScript(
      'return await tools.web_fetch_md({ url: "https://example.com/provider-failure", fetch_mode: "firecrawl_fallback" });',
    );
    expect(providerFailure.isError).toBe(true);
    expect(providerFailure.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Firecrawl failed: HTTP 502"),
        }),
      ]),
    );

    writeSupiConfig(
      { section: "web", scope: "project", cwd: fake.cwd },
      { firecrawlEnabled: false },
    );
    const disabled = await runScript(
      'return await tools.web_fetch_md({ url: "https://example.com/dynamic", fetch_mode: "firecrawl" });',
    );
    expect(disabled.isError).toBe(true);
    expect(disabled.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Firecrawl is disabled"),
        }),
      ]),
    );

    const httpFailure = await runScript(
      'return await tools.web_fetch_md({ url: "https://example.test/missing" });',
    );
    expect(httpFailure.isError).toBe(true);
    const httpErrorText = httpFailure.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    expect(httpErrorText).toContain("https://example.test/missing");
    expect(httpErrorText).toContain("404 Not Found");

    const failure = await runScript(
      'return await tools.web_fetch_md({ url: "ftp://example.test/page" });',
    );
    const context7Failure = await runScript(
      'return await tools.web_docs_search({ library_name: "forbidden", query: "example" });',
    );
    expect(context7Failure.isError).toBe(true);
    expect(context7Failure.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Unauthorized fixture"),
        }),
      ]),
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
    vi.unstubAllEnvs();
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fake.cleanup();
  }
}, 30_000);
