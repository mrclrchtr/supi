import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPINNER_INTERVAL_MS } from "../../src/spinner-frames.ts";
import { StatusSpinner } from "../../src/status-spinner.ts";

function spinnerIn(mode: ExtensionContext["mode"]) {
  const setStatus = vi.fn();
  const ctx = { mode, ui: { setStatus } } as unknown as ExtensionContext;
  return { spinner: new StatusSpinner(ctx, "test", ["a", "b"]), setStatus };
}

describe("StatusSpinner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("animates frames in the TUI and shows an updated message on the next frame", () => {
    const { spinner, setStatus } = spinnerIn("tui");
    spinner.start("working");
    vi.advanceTimersByTime(SPINNER_INTERVAL_MS);
    spinner.update("still working");
    vi.advanceTimersByTime(SPINNER_INTERVAL_MS);
    spinner.stop();
    vi.advanceTimersByTime(SPINNER_INTERVAL_MS * 3);

    expect(setStatus.mock.calls).toEqual([
      ["test", "a working"],
      ["test", "b working"],
      ["test", "a still working"],
      ["test", undefined],
    ]);
  });

  it.each(["rpc", "json", "print"] as const)(
    "in %s mode sends one status per distinct message and one clear on stop",
    (mode) => {
      const { spinner, setStatus } = spinnerIn(mode);
      spinner.start("working");
      vi.advanceTimersByTime(SPINNER_INTERVAL_MS * 10);
      spinner.update("working");
      spinner.update("1 of 2");
      spinner.update("1 of 2");
      spinner.stop();
      vi.advanceTimersByTime(SPINNER_INTERVAL_MS * 10);

      expect(setStatus.mock.calls).toEqual([
        ["test", "working"],
        ["test", "1 of 2"],
        ["test", undefined],
      ]);
    },
  );

  it("does not show a status for an update after stop outside the TUI", () => {
    const { spinner, setStatus } = spinnerIn("rpc");
    spinner.start("working");
    spinner.stop();
    spinner.update("late");
    spinner.start("again");

    expect(setStatus.mock.calls).toEqual([
      ["test", "working"],
      ["test", undefined],
      ["test", "again"],
    ]);
  });
});
