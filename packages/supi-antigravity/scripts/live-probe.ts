import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readdir, readFile, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { isWebToolName, isWorkspaceToolName } from "../src/activity.ts";
import { discoverAntigravityAvailability } from "../src/availability.ts";
import { ConversationHandleStore } from "../src/conversation/handles.ts";
import { getIsolatedAntigravityPaths } from "../src/isolated-home.ts";
import { runAntigravityConversation } from "../src/process/runner.ts";
import { ANTIGRAVITY_ANSWER_SCHEMA } from "../src/structured-output.ts";
import { isHttpUrl, isSafeWorkspacePath } from "../src/tool/antigravity_run/evidence.ts";
import type { CuratedModel } from "../src/types.ts";

const LIVE_ENVIRONMENT = "SUPI_ANTIGRAVITY_LIVE";
const MODEL: CuratedModel = "gemini-3.8-flash-low";
const CONTEXT_TOKEN = "supi-antigravity-context-token";

async function main(): Promise<void> {
  if (process.env[LIVE_ENVIRONMENT] !== "1") {
    throw new Error(`Set ${LIVE_ENVIRONMENT}=1 to run the Antigravity live probe.`);
  }
  const availability = await discoverAntigravityAvailability();
  if (availability.status !== "available" || !availability.catalogue.includes(MODEL)) {
    throw new Error("Gemini 3.8 Flash Low is not available in the isolated Antigravity account.");
  }

  const paths = getIsolatedAntigravityPaths();
  const handles = new ConversationHandleStore();
  const first = await runAntigravityConversation({
    paths,
    cwd: paths.consultationWorkspace,
    prompt: `Remember the exact token ${CONTEXT_TOKEN}. Name one current official Node.js documentation page about subprocess cancellation and cite it.`,
    model: MODEL,
    schema: ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>,
  });
  requireWebEvidence(first);
  const record = handles.create({
    rawAntigravityId: first.conversationId,
    model: MODEL,
    canonicalWorkingDirectory: paths.consultationWorkspace,
    workspaceAccess: false,
    cliVersion: availability.cliVersion,
  });
  const second = await runAntigravityConversation({
    paths,
    cwd: paths.consultationWorkspace,
    prompt: `What exact context token did I give you? Answer in one sentence and include ${CONTEXT_TOKEN}.`,
    model: MODEL,
    conversationId: record.rawAntigravityId,
    schema: ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>,
  });
  if (
    second.conversationId !== record.rawAntigravityId ||
    !second.answer.answer.includes(CONTEXT_TOKEN)
  ) {
    throw new Error("Antigravity follow-up did not retain the Conversation Handle context.");
  }

  const fixture = await realpath(await mkdtemp(join(tmpdir(), "supi-antigravity-live-")));
  try {
    await cp(join(import.meta.dirname, "../__tests__/fixtures/subprocess-cancellation"), fixture, {
      recursive: true,
    });
    const before = await digestTree(fixture);
    const workspace = await runAntigravityConversation({
      paths,
      cwd: fixture,
      prompt:
        "Inspect the TypeScript subprocess-cancellation fixture. Consult official Node.js documentation and explain the cancellation risk. Return relative file paths within the fixture and source URLs. Do not return absolute file paths.",
      model: MODEL,
      workspaceDirectory: fixture,
      schema: ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>,
    });
    requireWebEvidence(workspace);
    requireWorkspaceEvidence(workspace, fixture);
    if (!workspace.successfulToolNames.some(isWorkspaceToolName)) {
      throw new Error("The workspace probe did not observe workspace activity.");
    }
    const after = await digestTree(fixture);
    if (before !== after) throw new Error("The live probe changed the fixture.");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

function requireWebEvidence(result: {
  successfulToolNames: string[];
  answer: { sources: unknown[] };
}): void {
  const web = result.successfulToolNames.some(isWebToolName);
  if (!web || result.answer.sources.length === 0) {
    throw new Error("The live probe did not observe web evidence.");
  }
  if (
    !result.answer.sources.every(
      (source) => isRecord(source) && typeof source.url === "string" && isHttpUrl(source.url),
    )
  ) {
    throw new Error("The live probe returned an invalid source URL.");
  }
}

function requireWorkspaceEvidence(
  result: { answer: { workspaceEvidence: unknown[] } },
  workspace: string,
): void {
  if (
    result.answer.workspaceEvidence.length === 0 ||
    !result.answer.workspaceEvidence.every(
      (item) =>
        isRecord(item) &&
        typeof item.path === "string" &&
        isSafeWorkspacePath(item.path, workspace),
    )
  ) {
    throw new Error("The live probe did not return valid workspace evidence.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
