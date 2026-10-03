import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { createTreeSitterSession } = await jiti.import("../../src/api.ts");
const { createStructuralWorkerProcess } = await jiti.import(
  "../../src/session/structural-worker-process.ts",
);
const cwd = await mkdtemp(join(tmpdir(), "supi-latex-runtime-survival-"));
const source = String.raw`\begin{itemize}
  \item\label{item:first} First item.
\end{itemize}`;
const generations = [];
const errors = [];
const exits = [];
const workers = [];
const workerFactory = ({ cwd: workerCwd, generation }) => {
  generations.push(generation);
  const worker = createStructuralWorkerProcess({ cwd: workerCwd, generation });
  worker.on("error", (error) => errors.push(error.message));
  worker.on("exit", (code) => exits.push(code));
  workers.push(worker);
  return worker;
};
const waitValue = Number(process.env.SUPI_LATEX_PROBE_WAIT_MS ?? 2_000);
const waitMs = Number.isSafeInteger(waitValue) && waitValue >= 0 ? waitValue : 2_000;
const operationId = "op-AAAAAAAAAAAAAAAAAAAAAA";
let session;

try {
  await writeFile(join(cwd, "main.tex"), source);
  session = createTreeSitterSession(cwd, { workerFactory });
  const result = await session.outline("main.tex", { operationId });
  const found =
    result.kind === "success" && flatten(result.data).some((item) => item.name === "item:first");
  writeEvent("result-returned", { kind: result.kind, found });
  if (!found) process.exitCode = 2;

  if (process.argv.includes("--inject-crash")) await workers[0]?.terminate();
  writeEvent("post-result-wait-start", { waitMs });
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const survives =
    generations.length === 1 && generations[0] === 1 && errors.length === 0 && exits.length === 0;
  writeEvent("parser-survived", { survives, generations, errors, exits });
  writeEvent("post-result-wait-complete", { rssBytes: process.memoryUsage().rss });
  if (!survives) process.exitCode = 3;
} finally {
  await session?.dispose();
  await rm(cwd, { recursive: true, force: true });
}

function flatten(items) {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

function writeEvent(event, details) {
  process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
}
