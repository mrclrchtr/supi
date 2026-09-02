import { describe, expect, it } from "vitest";
import {
  buildProcessCrashRecoveryReport,
  type ProcessCrashRecoveryRouteResult,
} from "../../src/manager/manager-process-crash-report.ts";

function route(
  name: string,
  root: string,
  outcome: ProcessCrashRecoveryRouteResult["outcome"],
  failureMessage?: string,
): ProcessCrashRecoveryRouteResult {
  return { name, root, outcome, ...(failureMessage ? { failureMessage } : {}) };
}

describe("process-crash recovery report", () => {
  it("counts, orders, bounds, and assigns route actions", () => {
    const routes = [
      route("recovered-server", "/workspace/z", "recovered"),
      route("skipped-server", "/workspace/a", "skipped-no-retained-file"),
      route("failed-server", "/workspace/c", "recovery-failed", "startup failed"),
      route("exhausted-server", "/workspace/b", "recovery-exhausted"),
      ...Array.from({ length: 17 }, (_, index) =>
        route(`extra-${index}`, `/workspace/extra-${index}`, "recovered"),
      ),
    ];

    const report = buildProcessCrashRecoveryReport(routes, "/workspace");

    expect(report).toEqual({
      recoveredRoutes: 18,
      skippedRoutes: 1,
      failedRoutes: 1,
      exhaustedRoutes: 1,
      entries: [
        {
          name: "failed-server",
          root: "c",
          outcome: "recovery-failed",
          nextAction: "reload-workspace",
          failureMessage: "startup failed",
        },
        {
          name: "exhausted-server",
          root: "b",
          outcome: "recovery-exhausted",
          nextAction: "reload-workspace",
        },
        {
          name: "skipped-server",
          root: "a",
          outcome: "skipped-no-retained-file",
          nextAction: "use-exact-file",
        },
        {
          name: "extra-0",
          root: "extra-0",
          outcome: "recovered",
        },
        {
          name: "extra-1",
          root: "extra-1",
          outcome: "recovered",
        },
        {
          name: "extra-10",
          root: "extra-10",
          outcome: "recovered",
        },
        {
          name: "extra-11",
          root: "extra-11",
          outcome: "recovered",
        },
        {
          name: "extra-12",
          root: "extra-12",
          outcome: "recovered",
        },
        {
          name: "extra-13",
          root: "extra-13",
          outcome: "recovered",
        },
        {
          name: "extra-14",
          root: "extra-14",
          outcome: "recovered",
        },
        {
          name: "extra-15",
          root: "extra-15",
          outcome: "recovered",
        },
        {
          name: "extra-16",
          root: "extra-16",
          outcome: "recovered",
        },
        {
          name: "extra-2",
          root: "extra-2",
          outcome: "recovered",
        },
        {
          name: "extra-3",
          root: "extra-3",
          outcome: "recovered",
        },
        {
          name: "extra-4",
          root: "extra-4",
          outcome: "recovered",
        },
        {
          name: "extra-5",
          root: "extra-5",
          outcome: "recovered",
        },
      ],
      omittedEntries: 5,
    });
  });

  it("limits failure details to 512 UTF-16 code units", () => {
    const report = buildProcessCrashRecoveryReport(
      [route("typescript", "/workspace", "recovery-failed", "x".repeat(600))],
      "/workspace",
    );

    const failureMessage = report.entries[0]?.failureMessage;
    expect(failureMessage).toHaveLength(512);
    expect(failureMessage?.endsWith("…")).toBe(true);
  });
});
