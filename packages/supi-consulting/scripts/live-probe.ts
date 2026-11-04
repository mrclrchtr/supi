import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readdir, readFile, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createAntigravityAdapter } from "../src/agents/antigravity/adapter.ts";
import { getIsolatedAntigravityPaths } from "../src/agents/antigravity/isolated-home.ts";
import { runAntigravityConversation } from "../src/agents/antigravity/process/runner.ts";
import { ANTIGRAVITY_ANSWER_SCHEMA } from "../src/agents/antigravity/structured-output.ts";
import type { AntigravityExecutionFacts } from "../src/agents/antigravity/types.ts";
import {
  classifyAnswerEvidence,
  isHttpUrl,
  isSafeWorkspacePath,
} from "../src/tool/consulting_run/evidence.ts";
import type { ConsultationExecutionFacts } from "../src/types.ts";

const LIVE_ENVIRONMENT = "SUPI_CONSULTING_LIVE";
const MODEL = "gemini-3.8-flash-low";
const CONTEXT_TOKEN = "supi-consulting-context-token";
const SOURCE_URL = "https://nodejs.org/api/child_process.html";

async function main(): Promise<void> {
  if (process.env[LIVE_ENVIRONMENT] !== "1") {
    throw new Error(`Set ${LIVE_ENVIRONMENT}=1 to run the Consulting live probe.`);
  }
  const paths = getIsolatedAntigravityPaths();
  const adapter = createAntigravityAdapter(paths);
  const availability = await adapter.discover();
  if (availability.status !== "available" || !availability.catalogue.includes(MODEL)) {
    throw new Error("The selected model is not available to the isolated Antigravity account.");
  }
  const consultationWorkspace = await realpath(paths.consultationWorkspace);
  // The process interface exposes successful tool names without adding them to the
  // public Consultation contract. Mere web activity or claimed URLs cannot pass.
  const processOptions = {
    paths,
    model: MODEL,
    cwd: consultationWorkspace,
    schema: ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>,
  };
  const first = await runAntigravityConversation({
    ...processOptions,
    prompt: `Remember the exact token ${CONTEXT_TOKEN}. Use search_web to find official Node.js subprocess cancellation documentation, then use read_url_content to read ${SOURCE_URL}. Explain cancellation briefly and cite that exact fetched URL.`,
  });
  if (!first.successfulToolNames.includes("search_web")) {
    throw new Error("The live probe did not observe a successful web search.");
  }
  requireDirectRead(first, consultationWorkspace);

  // The first run has already removed its temporary profile. Resume only by ID,
  // proving the CLI retains the reader and finish capability in conversation state.
  const second = await runAntigravityConversation({
    ...processOptions,
    prompt: `Read ${SOURCE_URL} again using read_url_content and cite that exact URL. In the answer field return only the exact context token I gave you in the preceding request.`,
    conversationId: first.conversationId,
  });
  if (second.conversationId !== first.conversationId) {
    throw new Error("The live probe resumed a different conversation.");
  }
  requireDirectRead(second, consultationWorkspace);
  if (second.answer.answer.trim() !== CONTEXT_TOKEN) {
    throw new Error(
      "The follow-up did not return the requested current-turn answer from conversation context.",
    );
  }

  const fixture = await realpath(await mkdtemp(join(tmpdir(), "supi-consulting-live-")));
  try {
    await cp(join(import.meta.dirname, "../__tests__/fixtures/subprocess-cancellation"), fixture, {
      recursive: true,
    });
    const before = await digestTree(fixture);
    const workspace = await adapter.execute({
      prompt:
        "Inspect the TypeScript subprocess-cancellation fixture. Consult official Node.js documentation and explain the cancellation risk. Return relative file paths within the fixture and source URLs. Do not return absolute file paths.",
      model: MODEL,
      canonicalWorkingDirectory: fixture,
      workspaceAccess: true,
    });
    requireWebEvidence(workspace, fixture);
    requireWorkspaceEvidence(workspace, fixture);
    if (!workspace.workspaceUsed) {
      throw new Error("The workspace probe did not observe workspace activity.");
    }
    const after = await digestTree(fixture);
    if (before !== after) throw new Error("The live probe changed the fixture.");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

type EvidenceFacts = Pick<
  ConsultationExecutionFacts,
  "answer" | "observedSourceHashes" | "observedWorkspacePathHashes"
>;

function requireDirectRead(result: AntigravityExecutionFacts, workspace: string): void {
  if (!result.successfulToolNames.includes("read_url_content")) {
    throw new Error("The live probe did not observe a successful direct URL read.");
  }
  requireWebEvidence(result, workspace);
  const evidence = classifyAnswerEvidence(result.answer, result, workspace);
  if (!evidence.observedSources.some((source) => source.url === SOURCE_URL)) {
    throw new Error("The live probe did not return the fetched URL as observed evidence.");
  }
}

function requireWebEvidence(result: EvidenceFacts, workspace: string): void {
  const evidence = classifyAnswerEvidence(result.answer, result, workspace);
  if (evidence.observedSources.length === 0) {
    throw new Error("The live probe did not observe web evidence.");
  }
  if (!result.answer.sources.every((source) => isHttpUrl(source.url))) {
    throw new Error("The live probe returned an invalid source URL.");
  }
}

function requireWorkspaceEvidence(result: EvidenceFacts, workspace: string): void {
  const evidence = classifyAnswerEvidence(result.answer, result, workspace);
  if (
    evidence.observedWorkspaceEvidence.length === 0 ||
    !result.answer.workspaceEvidence.every((item) => isSafeWorkspacePath(item.path, workspace))
  ) {
    throw new Error("The live probe did not return observed, valid workspace evidence.");
  }
}

async function digestTree(directory: string): Promise<string> {
  const hash = createHash("sha256");
  await digestDirectory(directory, directory, hash);
  return hash.digest("hex");
}

async function digestDirectory(
  directory: string,
  root: string,
  hash: ReturnType<typeof createHash>,
): Promise<void> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    const file = join(directory, entry.name);
    hash.update(relative(root, file));
    if (entry.isDirectory()) {
      hash.update("directory");
      await digestDirectory(file, root, hash);
      continue;
    }
    if (entry.isSymbolicLink()) {
      hash.update("link");
      hash.update(await readlink(file));
      continue;
    }
    if (entry.isFile()) {
      hash.update("file");
      hash.update(await readFile(file));
      continue;
    }
    const info = await lstat(file);
    hash.update(`${info.mode}:${info.size}`);
  }
}

await main();
