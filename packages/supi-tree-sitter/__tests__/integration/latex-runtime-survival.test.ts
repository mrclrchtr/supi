import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const probePath = join(packageRoot, "__tests__/fixtures/latex-runtime-survival-probe.mjs");
const rssLimitMiB = 512;
const defaultWaitMs = 2_000;
const waitValue = Number(process.env.SUPI_LATEX_PROBE_WAIT_MS ?? defaultWaitMs);
const waitMs = Number.isSafeInteger(waitValue) && waitValue >= 0 ? waitValue : defaultWaitMs;
const timeoutMs = waitMs + 6_000;

describe("LaTeX Structural Worker memory safety", () => {
  it.skipIf(process.platform === "win32")(
    "keeps the original parser process alive and detects a parser restart",
    async () => {
      const result = await runBoundedProbe();

      expect(result.stdout).toContain('"event":"result-returned","kind":"success","found":true');
      expect(readProbeEvent(result.stdout, "parser-survived")).toMatchObject({
        survives: true,
        generations: [1],
        errors: [],
        exits: [],
      });
      expect(result.stopReason, result.stdout).toBeNull();
      expect(result.exitCode).toBe(0);
      expect(result.peakRssMiB).toBeLessThan(rssLimitMiB);
      expect(result.stdout).toContain('"event":"post-result-wait-complete"');

      const injectedCrash = await runBoundedProbe(true, defaultWaitMs);
      const injectedSurvival = readProbeEvent(injectedCrash.stdout, "parser-survived");
      expect(injectedSurvival).toMatchObject({
        survives: false,
        generations: [1, expect.any(Number)],
      });
      expect(injectedSurvival.generations).toHaveLength(2);
      expect(injectedSurvival.generations[1]).not.toBe(1);
      expect(injectedSurvival.exits).toHaveLength(1);
      expect(injectedCrash.exitCode).toBe(3);
      expect(injectedCrash.peakRssMiB).toBeLessThan(rssLimitMiB);
      expect(injectedCrash.stopReason, injectedCrash.stdout).toBeNull();
    },
    timeoutMs + defaultWaitMs + 12_000,
  );
});

async function runBoundedProbe(
  injectCrash = false,
  probeWaitMs = waitMs,
): Promise<{
  exitCode: number | null;
  peakRssMiB: number;
  stopReason: string | null;
  stdout: string;
}> {
  const probeTimeoutMs = probeWaitMs + 6_000;
  const child = spawn(process.execPath, [probePath, ...(injectCrash ? ["--inject-crash"] : [])], {
    cwd: packageRoot,
    detached: true,
    env: { ...process.env, SUPI_LATEX_PROBE_WAIT_MS: String(probeWaitMs) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid === undefined) throw new Error("Could not start the LaTeX probe process");

  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => (stdout += chunk));
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveClose) => {
      child.once("close", (code, signal) => resolveClose({ code, signal }));
    },
  );
  const started = Date.now();
  let peakRssKiB = 0;
  let stopReason: string | null = null;

  try {
    while (child.exitCode === null && child.signalCode === null) {
      if (Date.now() - started >= probeTimeoutMs) {
        stopReason = "timeout";
        await stopProcessGroup(child.pid);
        break;
      }
      const rssKiB = processGroupRssKiB(child.pid);
      peakRssKiB = Math.max(peakRssKiB, rssKiB);
      if (rssKiB >= rssLimitMiB * 1024) {
        stopReason = "rss-limit";
        await stopProcessGroup(child.pid);
        break;
      }
      await delay(20);
    }
  } catch (error) {
    await stopProcessGroup(child.pid);
    throw error;
  }

  const { code, signal } = await closed;
  return {
    exitCode: code ?? (signal === null ? null : -1),
    peakRssMiB: peakRssKiB / 1024,
    stopReason,
    stdout,
  };
}

function processGroupRssKiB(processGroupId: number): number {
  const result = spawnSync("ps", ["-axo", "pgid=,rss="], {
    encoding: "utf8",
    timeout: 2_000,
  });
  if (result.status !== 0) throw new Error(`RSS monitor failed: ${result.stderr}`);

  let total = 0;
  for (const row of result.stdout.split("\n")) {
    const [groupIdText, rssText] = row.trim().split(/\s+/);
    if (Number(groupIdText) === processGroupId) total += Number(rssText) || 0;
  }
  return total;
}

async function stopProcessGroup(processGroupId: number): Promise<void> {
  signalProcessGroup(processGroupId, "SIGTERM");
  await delay(200);
  signalProcessGroup(processGroupId, "SIGKILL");
}

function signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-processGroupId, signal);
  } catch {
    // The process group may already be closed.
  }
}

interface ParserSurvivalEvent {
  readonly survives: boolean;
  readonly generations: number[];
  readonly errors: string[];
  readonly exits: number[];
}

function readProbeEvent(stdout: string, eventName: string): ParserSurvivalEvent {
  const line = stdout.split("\n").find((value) => value.includes(`"event":"${eventName}"`));
  if (!line) throw new Error(`Probe did not report ${eventName}: ${stdout}`);
  return JSON.parse(line) as ParserSurvivalEvent;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
