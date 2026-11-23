/**
 * Vitest setup file for the `servers` project: capture SuPi debug events per
 * test and write them as JSON when the test fails.
 *
 * Capture runs only when `SUPI_TEST_DEBUG_DIR` names an output directory.
 * `SUPI_TEST_DEBUG_PASSED=1` also writes passing tests, which turns a local
 * loop over one test into a timeline comparison without editing the test.
 *
 * Events are collected through a listener into a buffer owned by this file.
 * File-level `afterEach` hooks run before `onTestFinished`, and several of
 * them call `resetDebugRegistry()`, which empties the registry's own buffer.
 * A `resetDebugRegistry()` call inside a test body also removes the listener,
 * so events after it are not captured.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  configureDebugRegistry,
  type DebugEventView,
  isDebugRegistryEnabled,
  subscribeDebugEvents,
} from "@mrclrchtr/supi-core/debug";
import { beforeEach } from "vitest";

const outputDir = process.env.SUPI_TEST_DEBUG_DIR;
const writePassed = process.env.SUPI_TEST_DEBUG_PASSED === "1";
const MAX_CAPTURED_EVENTS = 1_000;

if (outputDir) {
  beforeEach((context) => {
    if (!isDebugRegistryEnabled()) configureDebugRegistry({ enabled: true });
    const startedAt = Date.now();
    const events: DebugEventView[] = [];
    const unsubscribe = subscribeDebugEvents((event) => {
      events.push(event);
      if (events.length > MAX_CAPTURED_EVENTS) events.shift();
    });
    context.onTestFinished(() => {
      unsubscribe();
      const state = context.task.result?.state;
      if (state !== "fail" && !(writePassed && state === "pass")) return;
      writeCapture(outputDir, {
        file: path.relative(process.cwd(), context.task.file.filepath),
        test: context.task.fullName,
        state,
        startedAt,
        events: events.map((event) => ({ elapsedMs: event.timestamp - startedAt, ...event })),
      });
    });
  });
}

function writeCapture(
  dir: string,
  capture: { file: string; test: string; state: string; startedAt: number; events: unknown[] },
): void {
  fs.mkdirSync(dir, { recursive: true });
  const slug = capture.test.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 160);
  const target = path.join(dir, `${slug}-${capture.state}-${capture.startedAt}.json`);
  fs.writeFileSync(target, `${JSON.stringify(capture, null, 2)}\n`);
}
