import { initTheme } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type CommandHarness,
  createCommandHarness,
  interact,
  makeAssistantMessage,
} from "../helpers/command-harness.ts";

const harnesses: CommandHarness[] = [];

beforeAll(() => initTheme("dark"));
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.cleanup();
});

describe("draft ownership and cancellation", () => {
  it("discards local input on Escape without changing the main editor", async () => {
    const harness = makeHarness();
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\u001b");
    });

    await harness.handler("Not confirmed");

    expect(harness.getEditorText()).toBe("post-command baseline");
    expect(harness.requestContexts).toHaveLength(0);
  });

  it("does not transfer a confirmed draft after an external editor write", async () => {
    const harness = makeHarness();
    harness.setCustomDriver((component, index) => {
      if (index !== 0) return;
      harness.setEditorText("newer external draft");
      interact(component, "\r");
    });

    await harness.handler("old local draft");

    expect(harness.getEditorText()).toBe("newer external draft");
    expect(harness.requestContexts).toHaveLength(0);
  });

  it("disposes a cancelled wait while the provider remains unsettled", async () => {
    const harness = makeHarness({ responses: [() => new Promise(() => {})] });
    let waitingScreenDisposed = false;
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index !== 1) return;
      trackDispose(component, () => {
        waitingScreenDisposed = true;
      });
      interact(component, "\u001b");
    });

    await harness.handler("Keep this confirmed draft");

    expect(harness.requestSignals[0]?.aborted).toBe(true);
    expect(waitingScreenDisposed).toBe(true);
    expect(harness.getEditorText()).toBe("Keep this confirmed draft");
    expect(harness.interactions).toHaveLength(2);
  });

  it("ignores a provider rejection after Escape closes and disposes the wait", async () => {
    let rejectRequest!: (error: Error) => void;
    const request = new Promise<never>((_resolve, reject) => {
      rejectRequest = reject;
    });
    const harness = makeHarness({ responses: [() => request] });
    let waitingScreenDisposed = false;
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index !== 1) return;
      trackDispose(component, () => {
        waitingScreenDisposed = true;
      });
      interact(component, "\u001b");
    });

    await harness.handler("Keep this confirmed draft");
    const notifications = [...harness.notifications];
    rejectRequest(new Error("late provider failure"));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(waitingScreenDisposed).toBe(true);
    expect(harness.notifications).toEqual(notifications);
    expect(harness.getEditorText()).toBe("Keep this confirmed draft");
  });

  it("cancels the provider and disposes the wait when the UI fails to open", async () => {
    const harness = makeHarness({ responses: [() => new Promise(() => {})] });
    let waitingScreenDisposed = false;
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index !== 1) return;
      trackDispose(component, () => {
        waitingScreenDisposed = true;
      });
      throw new Error("The wait screen could not open.");
    });

    await harness.handler("Keep this confirmed draft");

    expect(harness.requestSignals[0]?.aborted).toBe(true);
    expect(waitingScreenDisposed).toBe(true);
    expect(harness.getEditorText()).toBe("Keep this confirmed draft");
    expect(harness.notifications.at(-1)?.message).toBe("The wait screen could not open.");
  });

  it("closes a wait immediately when its signal was already aborted", async () => {
    let harness: CommandHarness;
    harness = makeHarness({
      responses: [() => new Promise(() => {})],
      onRequestStart: () => {
        void harness.pi.emit("agent_start", {});
      },
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep this confirmed draft");

    expect(harness.requestSignals[0]?.aborted).toBe(true);
    expect(harness.getEditorText()).toBe("Keep this confirmed draft");
    expect(harness.interactions).toHaveLength(1);
  });

  it("closes an active request before branch navigation", async () => {
    const harness = makeHarness({
      responses: [() => new Promise(() => {})],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 1) void harness.pi.emit("session_before_tree", {});
    });

    await harness.handler("Keep this confirmed draft");

    expect(harness.requestSignals[0]?.aborted).toBe(true);
    expect(harness.getEditorText()).toBe("Keep this confirmed draft");
    expect(harness.interactions).toHaveLength(2);
  });

  it("keeps a newer editor write instead of accepting a stale proposal", async () => {
    const harness = makeHarness({
      responses: [makeAssistantMessage({ kind: "proposal", proposal: "Stale proposal" })],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) {
        harness.setEditorText("newer external draft");
        interact(component, "\r");
      }
    });

    await harness.handler("Confirmed original");

    expect(harness.getEditorText()).toBe("newer external draft");
    expect(harness.notifications.at(-1)?.message).toContain("newer editor state was kept");
  });

  it("does not retry invalid model output or change the confirmed draft", async () => {
    const harness = makeHarness({
      responses: [makeAssistantMessage({ kind: "proposal", proposal: "  " })],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep this draft");

    expect(harness.requestContexts).toHaveLength(1);
    expect(harness.interactions).toHaveLength(2);
    expect(harness.getEditorText()).toBe("Keep this draft");
    expect(harness.notifications.at(-1)?.message).toContain("empty proposal");
  });

  it("rejects drafts above the Unicode code point limit before transfer", async () => {
    const harness = makeHarness();
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("🙂".repeat(32_001));

    expect(harness.requestContexts).toHaveLength(0);
    expect(harness.getEditorText()).toBe("post-command baseline");
    expect(harness.notifications.at(-1)?.message).toContain("32,000 Unicode code points");
  });

  it("does not use the main model when the improver model is disabled", async () => {
    const harness = makeHarness({ configuredModel: "disabled" });

    await harness.handler("This should not be sent");

    expect(harness.requestContexts).toHaveLength(0);
    expect(harness.interactions).toHaveLength(0);
    expect(harness.getEditorText()).toBe("post-command baseline");
  });
});

function makeHarness(options: Parameters<typeof createCommandHarness>[0] = {}): CommandHarness {
  const harness = createCommandHarness(options);
  harnesses.push(harness);
  return harness;
}

function trackDispose(component: unknown, onDispose: () => void): void {
  const disposable = component as { dispose?: () => void };
  const dispose = disposable.dispose;
  disposable.dispose = () => {
    onDispose();
    dispose?.call(disposable);
  };
}
