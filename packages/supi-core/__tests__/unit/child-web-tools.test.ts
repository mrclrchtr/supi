import { createEventBus } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  callableChildWebToolNames,
  provideChildWebTools,
  requestChildWebTools,
} from "../../src/session.ts";

const factory = () => () => {};
const context = { configCwd: "/parent" };

describe("session-provided child Web tools", () => {
  it("returns undefined when no Web provider is loaded", () => {
    expect(requestChildWebTools(createEventBus(), context)).toBeUndefined();
  });

  it("captures the provider's current tools synchronously and treats an empty set as absent", () => {
    const events = createEventBus();
    let toolNames: Array<"web_fetch_md" | "web_search"> = ["web_fetch_md"];
    provideChildWebTools(events, () => ({ toolNames, createFactory: factory }));

    expect(requestChildWebTools(events, context)?.toolNames).toEqual(["web_fetch_md"]);
    toolNames = [];
    expect(requestChildWebTools(events, context)).toBeUndefined();
  });

  it("passes the containing session's config directory to the provider", () => {
    const events = createEventBus();
    const seen: string[] = [];
    provideChildWebTools(events, ({ configCwd }) => {
      seen.push(configCwd);
      return { toolNames: ["web_fetch_md"], createFactory: factory };
    });
    requestChildWebTools(events, context);
    expect(seen).toEqual(["/parent"]);
  });

  it("stops answering after unsubscribe", () => {
    const events = createEventBus();
    const stop = provideChildWebTools(events, () => ({
      toolNames: ["web_search"],
      createFactory: factory,
    }));
    stop();
    expect(requestChildWebTools(events, context)).toBeUndefined();
  });

  it("counts only tools callable under Pi exposure rules", () => {
    const pi = {
      getActiveTools: () => ["web_fetch_md", "read"],
      getAllTools: () =>
        [
          { name: "web_fetch_md", exposure: "direct" },
          { name: "web_search", exposure: "direct" },
          { name: "web_docs_search", exposure: "codemode" },
          { name: "web_docs_fetch", exposure: "hidden" },
          { name: "read", exposure: "direct" },
        ] as never,
    };
    expect(callableChildWebToolNames(pi)).toEqual(["web_fetch_md", "web_docs_search"]);
  });
});
