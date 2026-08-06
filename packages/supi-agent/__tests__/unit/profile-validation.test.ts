import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProfileCatalogue, resolveProfileDefinition } from "../../src/api.ts";
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
  const root = await mkdtemp(join(tmpdir(), "supi-agent-validation-"));
  temporaryDirectories.push(root);
  return {
    root,
    packageDirectory: join(root, "package"),
    agentDirectory: join(root, "agent"),
  };
}

describe("profile validation", () => {
  it("accepts tool-free and custom-prompt profiles", async () => {
    const paths = await roots();
    await writeProfile(
      paths.packageDirectory,
      "custom",
      manifest({ systemPrompt: "custom" }),
      "Complete prompt",
    );

    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });

    expect(catalogue.diagnostics).toEqual([]);
    expect(catalogue.profiles[0]?.id).toBe("custom");
    expect(catalogue.profiles[0]?.sources[0]).toMatchObject({
      customSystemPrompt: "Complete prompt",
      manifest: { tools: [], systemPrompt: "custom" },
    });
    const custom = catalogue.profiles[0];
    if (!custom) throw new Error("expected custom profile");
    expect(resolveProfileDefinition(custom)).toMatchObject({
      customSystemPrompt: "Complete prompt",
      manifest: { tools: [], systemPrompt: "custom" },
    });
  });

  it("rejects invalid Profile IDs without exposing control or credential text", async () => {
    const paths = await roots();
    await writeProfile(paths.packageDirectory, "Bad_ID", manifest());
    await writeProfile(paths.packageDirectory, `${"a".repeat(65)}\napi_key=secret`, manifest());

    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });

    expect(catalogue.profiles).toEqual([]);
    expect(catalogue.diagnostics).toEqual([
      expect.objectContaining({ profileId: "Bad_ID", code: "invalid-profile-id" }),
      expect.objectContaining({ profileId: expect.not.stringContaining("api_key") }),
    ]);
    expect(
      catalogue.diagnostics.every((diagnostic) => !/[\\n\\r]/.test(diagnostic.profileId)),
    ).toBe(true);
  });

  it.each([
    ["unknown-field", { extra: true }],
    ["bad-model", { model: "claude" }],
    ["bad-timeout", { timeoutMinutes: 0 }],
    ["bad-thinking", { thinking: "super" as never }],
    ["long-description", { description: "x".repeat(201) }],
    ["duplicate-tools", { tools: ["read", "read"] }],
    ["duplicate-scopes", { instructionScopes: ["global", "global"] }],
  ])("rejects %s as an unavailable source", async (_name, extra) => {
    const paths = await roots();
    await writeProfile(paths.packageDirectory, "invalid", { ...manifest(), ...extra });

    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });

    expect(catalogue.profiles).toHaveLength(1);
    expect(catalogue.profiles[0]?.sources[0]?.diagnostic).toEqual(
      expect.objectContaining({ profileId: "invalid", code: "invalid-manifest" }),
    );
    expect(catalogue.diagnostics).toEqual([
      expect.objectContaining({ profileId: "invalid", code: "invalid-manifest" }),
    ]);
  });

  it("accepts provider/model IDs whose model portion contains slashes", async () => {
    const paths = await roots();
    await writeProfile(
      paths.packageDirectory,
      "slash-model",
      manifest({ model: "openrouter/moonshotai/kimi-k2" }),
    );

    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });

    expect(catalogue.diagnostics).toEqual([]);
    expect(catalogue.profiles[0]?.sources[0]?.manifest?.model).toBe(
      "openrouter/moonshotai/kimi-k2",
    );
  });

  it("accepts a partial manifest and resolves required fields from the package source", async () => {
    const paths = await roots();
    await writeProfile(paths.packageDirectory, "partial", manifest({ tools: ["read"] }));
    await writeProfile(`${paths.agentDirectory}/supi/agents`, "partial", {
      model: "openai/test",
    });

    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });
    const profile = catalogue.profiles[0];
    expect(profile?.sources).toHaveLength(2);
    expect(profile && resolveProfileDefinition(profile)).toMatchObject({
      manifest: { description: "Test profile", tools: ["read"], model: "openai/test" },
    });
  });

  it("defers completeness failure until profile resolution", async () => {
    const paths = await roots();
    await writeProfile(`${paths.agentDirectory}/supi/agents`, "partial", {
      model: "openai/test",
    });

    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });
    const profile = catalogue.profiles[0];
    if (!profile) throw new Error("expected partial profile");
    expect(catalogue.diagnostics).toEqual([]);
    expect(resolveProfileDefinition(profile)).toMatchObject({
      code: "incomplete-manifest",
      message: expect.stringContaining("description"),
    });
  });

  it("requires the complete custom prompt and bounds diagnostics", async () => {
    const paths = await roots();
    await writeProfile(paths.packageDirectory, "custom", manifest({ systemPrompt: "custom" }));

    const catalogue = await discoverProfileCatalogue({
      cwd: paths.root,
      agentDir: paths.agentDirectory,
      packageDirectory: paths.packageDirectory,
      projectTrusted: false,
    });

    expect(catalogue.diagnostics[0]).toMatchObject({ profileId: "custom", code: "invalid-prompt" });
    expect(catalogue.diagnostics[0].message.length).toBeLessThanOrEqual(240);
  });
});
