import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProfileSettingsSection,
  discoverProfileCatalogue,
  resolveProfileDefinition,
} from "../../src/api.ts";
import { manifest, writeProfile } from "../helpers/profile-fixtures.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function roots() {
  const root = await mkdtemp(join(tmpdir(), "supi-agent-profile-settings-"));
  temporaryDirectories.push(root);
  const packageDirectory = join(root, "package");
  const agentDirectory = join(root, "agent");
  await mkdir(packageDirectory, { recursive: true });
  await mkdir(join(agentDirectory, "supi", "agents"), { recursive: true });
  await writeProfile(packageDirectory, "explore", manifest({ description: "Explore profile" }));
  return { root, packageDirectory, agentDirectory };
}

describe("profile settings", () => {
  it("exposes model and thinking rows and writes only selected fields", async () => {
    const paths = await roots();
    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });
    const entry = catalogue.profiles[0];
    if (!entry) throw new Error("expected explore profile");
    const section = createProfileSettingsSection(entry, catalogue);

    expect(section.id).toBe("agent-profile-explore");
    expect(section.label).toBe("Agent");
    expect(section.subsection).toBe("explore");
    const rows = (await section.read({ scope: "global", cwd: paths.root })).rows;
    expect(rows.map((row) => row.field.kind)).toEqual(["modelPicker", "enum"]);
    expect(rows[0]).toMatchObject({
      displayValue: "Inherit from session (default)",
      editValue: "",
    });
    expect(rows[1]?.field).toMatchObject({
      kind: "enum",
      values: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
    });

    await section.apply({
      scope: "global",
      cwd: paths.root,
      fieldKey: "model",
      action: { kind: "set", value: "openai/gpt-5" },
    });
    const profilePath = join(paths.agentDirectory, "supi", "agents", "explore", "profile.json");
    expect(JSON.parse(await readFile(profilePath, "utf8"))).toEqual({ model: "openai/gpt-5" });

    await section.apply({
      scope: "global",
      cwd: paths.root,
      fieldKey: "thinking",
      action: { kind: "set", value: "high" },
    });
    expect(JSON.parse(await readFile(profilePath, "utf8"))).toEqual({
      model: "openai/gpt-5",
      thinking: "high",
    });

    await section.apply({
      scope: "global",
      cwd: paths.root,
      fieldKey: "model",
      action: { kind: "unset" },
    });
    expect(JSON.parse(await readFile(profilePath, "utf8"))).toEqual({ thinking: "high" });
    await section.apply({
      scope: "global",
      cwd: paths.root,
      fieldKey: "thinking",
      action: { kind: "unset" },
    });
    await expect(readFile(profilePath, "utf8")).rejects.toThrow();
    await expect(stat(dirname(profilePath))).rejects.toThrow();
  });

  it("writes trusted project overrides to the project profile directory", async () => {
    const paths = await roots();
    await writeProfile(
      paths.packageDirectory,
      "explore",
      manifest({ description: "Explore profile", model: "openai/package" }),
    );
    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: true,
    });
    const entry = catalogue.profiles[0];
    if (!entry) throw new Error("expected explore profile");
    const section = createProfileSettingsSection(entry, catalogue);
    const projectRoot = catalogue.sourceDirectories.project;
    if (!projectRoot) throw new Error("expected trusted project profile directory");
    expect(projectRoot.endsWith(join(".pi", "supi", "agents"))).toBe(true);
    await section.apply({
      scope: "project",
      cwd: paths.root,
      fieldKey: "model",
      action: { kind: "set", value: "openai/project" },
    });

    const profilePath = join(projectRoot, "explore", "profile.json");
    expect(JSON.parse(await readFile(profilePath, "utf8"))).toEqual({
      model: "openai/project",
    });
    const rows = (await section.read({ scope: "project", cwd: paths.root })).rows;
    expect(rows[0]).toMatchObject({ inheritanceSource: "default" });
    await section.apply({
      scope: "project",
      cwd: paths.root,
      fieldKey: "model",
      action: { kind: "unset" },
    });
    await expect(stat(join(projectRoot, "explore"))).rejects.toThrow();
  });

  it("applies saved model and thinking settings without a catalogue reload", async () => {
    const paths = await roots();
    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });
    const entry = catalogue.profiles[0];
    if (!entry) throw new Error("expected explore profile");
    const section = createProfileSettingsSection(entry, catalogue);

    await section.apply({
      scope: "global",
      cwd: paths.root,
      fieldKey: "model",
      action: { kind: "set", value: "openai/gpt-5" },
    });
    await section.apply({
      scope: "global",
      cwd: paths.root,
      fieldKey: "thinking",
      action: { kind: "set", value: "high" },
    });

    expect(resolveProfileDefinition(entry, catalogue.sourceDirectories)).toMatchObject({
      manifest: { model: "openai/gpt-5", thinking: "high" },
    });
  });

  it("preserves existing manifest fields during a settings write", async () => {
    const paths = await roots();
    await writeProfile(join(paths.agentDirectory, "supi", "agents"), "explore", {
      description: "local note",
      model: "openai/old",
    });
    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });
    const entry = catalogue.profiles[0];
    if (!entry) throw new Error("expected explore profile");
    const section = createProfileSettingsSection(entry, catalogue);

    await section.apply({
      scope: "global",
      cwd: paths.root,
      fieldKey: "model",
      action: { kind: "set", value: "openai/new" },
    });

    expect(
      JSON.parse(
        await readFile(
          join(paths.agentDirectory, "supi", "agents", "explore", "profile.json"),
          "utf8",
        ),
      ),
    ).toEqual({ description: "local note", model: "openai/new" });
  });

  it("shows an incomplete-profile diagnostic for a profile without a package base", async () => {
    const paths = await roots();
    await writeProfile(`${paths.agentDirectory}/supi/agents`, "orphan", {
      model: "openai/orphan",
    });
    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });
    const entry = catalogue.profiles.find((profile) => profile.id === "orphan");
    if (!entry) throw new Error("expected orphan profile");
    const section = createProfileSettingsSection(entry, catalogue);
    const rows = (await section.read({ scope: "global", cwd: paths.root })).rows;
    const diagnostic = rows.find((row) => row.field.key === "diagnostic");

    expect(diagnostic?.displayValue).toContain("description");
  });

  it("shows an unavailable-source diagnostic instead of repairing invalid JSON", async () => {
    const paths = await roots();
    const directory = join(paths.agentDirectory, "supi", "agents", "explore");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "profile.json"), "{", "utf8");
    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });
    const entry = catalogue.profiles[0];
    if (!entry) throw new Error("expected explore profile");
    const section = createProfileSettingsSection(entry, catalogue);
    const rows = (await section.read({ scope: "global", cwd: paths.root })).rows;
    const diagnostic = rows.find((row) => row.field.key === "diagnostic");

    expect(diagnostic?.displayValue).toContain("profile.json is not valid JSON");
    await expect(
      section.apply({
        scope: "global",
        cwd: paths.root,
        fieldKey: "model",
        action: { kind: "set", value: "openai/gpt-5" },
      }),
    ).rejects.toThrow();
  });
});
