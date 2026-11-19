import { initTheme } from "@earendil-works/pi-coding-agent";
import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { capabilitySession, chooseRow } from "../helpers/capability-session.ts";

let session: ReturnType<typeof capabilitySession>;
beforeAll(() => initTheme("dark"));
beforeEach(() => {
  session = capabilitySession();
});
afterEach(() => session.cleanup());

async function openProfiles() {
  await session.event("session_start", { reason: "new" });
  const command = session.open();
  await vi.waitFor(() => expect(session.selector()).toBeDefined());
  session.selector()?.handleInput("\t");
  session.selector()?.handleInput("\t");
  return {
    close: async () => {
      session.selector()?.handleInput("\u001b");
      await command;
    },
  };
}

async function action(text: string, index = 0) {
  const previous = session.selector();
  chooseRow(previous, text, index);
  await vi.waitFor(() => expect(session.selector()).not.toBe(previous));
}

function researchDefault() {
  session.store.save("global", "research", {
    excludedTools: ["first", "absent"],
    hiddenSkills: ["absent-skill"],
  });
  session.store.setDefault("global", "research");
}

describe("capability profile actions", () => {
  it("saves current exclusions in an explicit scope without changing the session copy", async () => {
    researchDefault();
    const ui = await openProfiles();
    const original = session.state();
    vi.mocked(session.ctx.ui.select).mockResolvedValue("Project");
    vi.mocked(session.ctx.ui.input).mockResolvedValue("copy");
    await action("Save current as");
    expect(session.store.read().effectiveProfiles).toContainEqual({
      id: "copy",
      source: "project",
      excludedTools: ["first", "absent"],
      hiddenSkills: ["absent-skill"],
    });
    expect(session.ctx.ui.select).toHaveBeenCalledWith("Save profile in", ["Global", "Project"]);
    expect(session.state()).toEqual(original);
    await ui.close();
  });

  it("requires confirmation to replace a profile and does not apply the replacement", async () => {
    researchDefault();
    session.store.save("global", "target", {});
    const ui = await openProfiles();
    const original = session.state();
    vi.mocked(session.ctx.ui.confirm).mockResolvedValueOnce(false);
    await action("target", 1);
    expect(
      session.store.read().effectiveProfiles.find((profile) => profile.id === "target")
        ?.excludedTools,
    ).toEqual([]);
    await action("target", 1);
    expect(
      session.store.read().effectiveProfiles.find((profile) => profile.id === "target")
        ?.excludedTools,
    ).toEqual(["first", "absent"]);
    expect(session.ctx.ui.confirm).toHaveBeenCalledWith(
      "Replace saved profile?",
      expect.stringContaining("target (global)"),
    );
    expect(session.state()).toEqual(original);
    await ui.close();
  });

  it("warns before deletion exposes global configuration and leaves defaults and the session unchanged", async () => {
    researchDefault();
    session.store.save("project", "research", { excludedTools: ["second"] });
    const ui = await openProfiles();
    const original = session.state();
    vi.mocked(session.ctx.ui.confirm).mockResolvedValueOnce(false);
    await action("research project", 2);
    expect(session.store.read().effectiveProfiles[0]?.source).toBe("project");
    await action("research project", 2);
    expect(session.ctx.ui.confirm).toHaveBeenCalledWith(
      "Delete profile?",
      expect.stringContaining("Known default references: global"),
    );
    expect(session.ctx.ui.confirm).toHaveBeenCalledWith(
      "Delete profile?",
      expect.stringContaining("expose the global definition research"),
    );
    expect(session.store.read().defaultValues.global).toBe("research");
    expect(session.store.read().effectiveProfiles[0]?.source).toBe("global");
    expect(session.state()).toEqual(original);
    await ui.close();
  });

  it("sets scoped defaults, explicit None, and inheritance without changing the current session", async () => {
    researchDefault();
    session.store.save("project", "local", {});
    const ui = await openProfiles();
    const original = session.state();
    vi.mocked(session.ctx.ui.select).mockResolvedValueOnce("local (project)");
    await action("Project default");
    expect(session.store.read().default).toMatchObject({
      status: "resolved",
      id: "local",
      source: "project",
    });
    vi.mocked(session.ctx.ui.select).mockResolvedValueOnce("None");
    await action("Project default");
    expect(session.store.read().default).toEqual({ status: "none", source: "project" });
    vi.mocked(session.ctx.ui.select).mockResolvedValueOnce("Inherit global default");
    await action("Project default");
    expect(session.store.read().default).toMatchObject({
      status: "resolved",
      id: "research",
      source: "global",
    });
    vi.mocked(session.ctx.ui.select).mockResolvedValueOnce("Reset global default");
    await action("Global default");
    expect(session.store.read().default).toEqual({ status: "none" });
    expect(session.state()).toEqual(original);
    await ui.close();
  });

  it("reports a duplicate save without overwriting configuration or the session", async () => {
    researchDefault();
    const ui = await openProfiles();
    const original = session.state();
    vi.mocked(session.ctx.ui.select).mockResolvedValue("Global");
    vi.mocked(session.ctx.ui.input).mockResolvedValue("research");
    await action("Save current as");
    expect(session.ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
      "error",
    );
    expect(session.state()).toEqual(original);
    expect(session.store.read().effectiveProfiles).toHaveLength(1);
    await ui.close();
  });

  it("rechecks profile availability before applying a stale selector row", async () => {
    researchDefault();
    session.store.save("global", "target", { excludedTools: ["second"] });
    const ui = await openProfiles();
    const original = session.state();
    session.store.delete("global", "target");
    await action("target");
    expect(session.ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("no longer available"),
      "error",
    );
    expect(session.state()).toEqual(original);
    expect(session.active()).toEqual(["read", "second"]);
    await ui.close();
  });

  it("marks session edits against the snapshot, not a later configuration edit", async () => {
    researchDefault();
    const ui = await openProfiles();
    session.store.save("global", "research", {}, true);
    expect(session.selector()?.render(180).join("\n")).not.toContain("Modified");
    session.selector()?.handleInput("\t");
    for (const character of "first") session.selector()?.handleInput(character);
    session.selector()?.handleInput("\u001b[B");
    session.selector()?.handleInput(" ");
    expect(session.selector()?.render(180).join("\n")).toContain("Modified");
    expect(footerContributions.getByPlacement("model-start")[0]?.render()).toContain(
      "research Modified",
    );
    session.selector()?.handleInput(" ");
    expect(session.selector()?.render(180).join("\n")).not.toContain("Modified");
    expect(session.state()?.toolDenylist).toEqual(["absent", "first"]);
    await ui.close();
  });
});
