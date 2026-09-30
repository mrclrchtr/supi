import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readdir, readFile, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createAntigravityAdapter } from "../src/agents/antigravity/adapter.ts";
import { getIsolatedAntigravityPaths } from "../src/agents/antigravity/isolated-home.ts";
import { isHttpUrl, isSafeWorkspacePath } from "../src/tool/consulting_run/evidence.ts";

const LIVE_ENVIRONMENT = "SUPI_CONSULTING_LIVE";
const MODEL = "gemini-3.8-flash-low";
const CONTEXT_TOKEN = "supi-consulting-context-token";

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
  const first = await adapter.execute({
    prompt: `Remember the exact token ${CONTEXT_TOKEN}. Name one current official Node.js documentation page about subprocess cancellation and cite it.`,
    model: MODEL,
    canonicalWorkingDirectory: consultationWorkspace,
    workspaceAccess: false,
  });
  requireWebEvidence(first);

  const second = await adapter.execute({
    prompt: `What exact context token did I give you? Answer in one sentence and include ${CONTEXT_TOKEN}.`,
    model: MODEL,
    canonicalWorkingDirectory: consultationWorkspace,
    workspaceAccess: false,
    continuation: first.continuation,
  });
  if (!second.answer.answer.includes(CONTEXT_TOKEN)) {
    throw new Error("The follow-up did not retain the Conversation Handle context.");
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
    requireWebEvidence(workspace);
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

function requireWebEvidence(result: { webUsed: boolean; answer: { sources: unknown[] } }): void {
  if (!result.webUsed || result.answer.sources.length === 0) {
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
