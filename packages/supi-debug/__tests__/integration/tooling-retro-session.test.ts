import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionUIContext,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  configureDebugRegistry,
  type DebugEventView,
  resetDebugRegistry,
  subscribeDebugPersistence,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, expect, it } from "vitest";
import { buildToolingRetroPrompt } from "../../src/tooling-retro/prompt.ts";
import { registerToolingRetroCommand } from "../../src/tooling-retro/register.ts";
import { TOOLING_RETRO_REPORT_TYPE } from "../../src/tooling-retro/render.ts";

const roots: string[] = [];
let persisted: DebugEventView[];

beforeEach(() => {
  resetDebugRegistry();
  persisted = [];
  configureDebugRegistry({ enabled: true });
  subscribeDebugPersistence((event) => persisted.push(event));
});

afterEach(async () => {
  resetDebugRegistry();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function contextText(context: TranscriptContext): string {
  return JSON.stringify(context.messages);
}

async function createSession(
  responses: Array<AssistantMessage | ((c: TranscriptContext) => AssistantMessage)>,
  ui?: Partial<ExtensionUIContext>,
) {
  const cwd = await mkdtemp(join(tmpdir(), "supi-tooling-retro-"));
  roots.push(cwd);
  const faux = fauxProvider();
  faux.setResponses(responses);
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    extensionFactories: [(pi) => registerToolingRetroCommand(pi)],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "",
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model: faux.getModel(),
    modelRuntime,
    tools: [],
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });
  await bind(session, ui);
  return { session, faux };
}

/** Bind print mode; `ui` enables dialogs with only the given methods, other UI calls do nothing. */
async function bind(session: AgentSession, ui?: Partial<ExtensionUIContext>) {
  const uiContext = ui
    ? (new Proxy(ui, {
        get: (target, key) => target[key as keyof ExtensionUIContext] ?? (() => undefined),
      }) as ExtensionUIContext)
    : undefined;
  await session.bindExtensions({
    mode: "print",
    uiContext,
    commandContextActions: {
      waitForIdle: () => session.waitForIdle(),
      newSession: async () => ({ cancelled: true }),
      fork: async () => ({ cancelled: true }),
      navigateTree: async (targetId, options) => ({
        cancelled: (await session.navigateTree(targetId, options)).cancelled,
      }),
      switchSession: async () => ({ cancelled: true }),
      reload: async () => {},
    },
  });
}

it("continues the task without the retrospective in the next request's context", async () => {
  const seen: string[] = [];
  const { session } = await createSession([
    fauxAssistantMessage("Task done."),
    (context) => {
      seen.push(contextText(context));
      return fauxAssistantMessage("## SuPi Tooling Retrospective\nHelpful.");
    },
    (context) => {
      seen.push(contextText(context));
      return fauxAssistantMessage("Next step done.");
    },
  ]);
  try {
    await session.prompt("Do the task");
    await session.prompt("/supi-tooling-retro");
    await session.prompt("Next step");

    expect(seen[0]).toContain("Produce a compact retrospective");
    expect(seen[1]).toContain("Task done.");
    expect(seen[1]).toContain("Next step");
    expect(seen[1]).not.toContain("Produce a compact retrospective");
    expect(seen[1]).not.toContain("SuPi Tooling Retrospective");

    expect(persisted.filter((event) => event.category === "tooling-retrospective")).toHaveLength(1);
    const branch = session.sessionManager.getBranch();
    const reportEntry = branch.find(
      (entry) => entry.type === "custom" && entry.customType === TOOLING_RETRO_REPORT_TYPE,
    );
    expect(reportEntry).toMatchObject({
      data: { text: "## SuPi Tooling Retrospective\nHelpful.", stored: true },
    });
    // The side branch stays in the session file.
    expect(JSON.stringify(session.sessionManager.getEntries())).toContain(
      buildToolingRetroPrompt([]).slice(0, 40),
    );
  } finally {
    session.dispose();
  }
});

it("returns to the anchor without storing a failed retrospective", async () => {
  const seen: string[] = [];
  const { session } = await createSession([
    fauxAssistantMessage("Task done."),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider failed" }),
    (context) => {
      seen.push(contextText(context));
      return fauxAssistantMessage("Next step done.");
    },
  ]);
  try {
    await session.prompt("Do the task");
    await session.prompt("/supi-tooling-retro");
    await session.prompt("Next step");

    expect(seen[0]).not.toContain("Produce a compact retrospective");
    expect(persisted.filter((event) => event.category === "tooling-retrospective")).toHaveLength(0);
  } finally {
    session.dispose();
  }
});

it("keeps a main-path retrospective in the next request's context", async () => {
  const seen: string[] = [];
  const { session } = await createSession(
    [
      fauxAssistantMessage("Task done."),
      fauxAssistantMessage("## SuPi Tooling Retrospective\nHelpful."),
      (context) => {
        seen.push(contextText(context));
        return fauxAssistantMessage("Next step done.");
      },
    ],
    { select: async (_title, options) => options.find((option) => option.startsWith("Main path")) },
  );
  try {
    await session.prompt("Do the task");
    await session.prompt("/supi-tooling-retro");
    await session.prompt("Next step");

    expect(seen[0]).toContain("Produce a compact retrospective");
    expect(seen[0]).toContain("SuPi Tooling Retrospective");
    expect(persisted.filter((event) => event.category === "tooling-retrospective")).toHaveLength(1);
  } finally {
    session.dispose();
  }
});
