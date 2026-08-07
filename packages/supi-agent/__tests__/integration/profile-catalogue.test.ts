import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverProfileCatalogue,
  findProjectProfilesDirectory,
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

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "supi-agent-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function sourceRoots() {
  const root = await temporaryDirectory();
  const packageDirectory = join(root, "package");
  const agentDirectory = join(root, "agent");
  await mkdir(packageDirectory, { recursive: true });
  await mkdir(join(agentDirectory, "supi", "agents"), { recursive: true });
  return {
    root,
    packageDirectory,
    agentDirectory,
    globalDirectory: join(agentDirectory, "supi", "agents"),
  };
}

describe("discoverProfileCatalogue", () => {
  it("overlays fields by source precedence and falls through invalid sources", async () => {
    const roots = await sourceRoots();
    await writeProfile(
      roots.packageDirectory,
      "shared",
      manifest({ description: "package", model: "openai/package" }),
    );
    await writeProfile(roots.packageDirectory, "blocked", manifest({ description: "fallback" }));
    await writeProfile(roots.globalDirectory, "shared", { model: "openai/global" });
    await writeProfile(roots.globalDirectory, "blocked", {
      description: "invalid",
      tools: ["unknown" as never],
      systemPrompt: "native",
      instructionScopes: [],
    });
    await mkdir(join(roots.root, ".git"));
    await mkdir(join(roots.root, ".pi", "supi", "agents"), { recursive: true });
    await writeProfile(join(roots.root, ".pi", "supi", "agents"), "shared", {
      thinking: "high",
    });
    execFileSync("git", ["init", "--quiet", roots.root]);

    const catalogue = await discoverProfileCatalogue({
      cwd: roots.root,
      agentDir: roots.agentDirectory,
      packageDirectory: roots.packageDirectory,
      projectTrusted: true,
    });
    const shared = catalogue.profiles.find((profile) => profile.id === "shared");
    const resolved = shared && resolveProfileDefinition(shared);

    expect(resolved).toMatchObject({
      id: "shared",
      source: "project",
      manifest: {
        description: "package",
        model: "openai/global",
        thinking: "high",
        tools: [],
      },
      fieldSources: {
        description: "package",
        tools: "package",
        systemPrompt: "package",
        instructionScopes: "package",
        model: "global",
        thinking: "project",
      },
    });
    expect(catalogue.diagnostics).toEqual([
      expect.objectContaining({ profileId: "blocked", source: "global", code: "invalid-manifest" }),
    ]);
    expect(
      resolveProfileDefinition(catalogue.profiles.find((p) => p.id === "blocked")!),
    ).toMatchObject({
      manifest: { description: "fallback" },
    });
  });

  it("ignores untrusted ancestors and only checks the exact cwd outside Git", async () => {
    const roots = await sourceRoots();
    const nested = join(roots.root, "nested");
    await mkdir(nested, { recursive: true });
    await writeProfile(join(roots.root, ".pi", "supi", "agents"), "ancestor", manifest());
    await writeProfile(join(nested, ".pi", "supi", "agents"), "exact", manifest());

    const untrusted = await discoverProfileCatalogue({
      cwd: nested,
      agentDir: roots.agentDirectory,
      packageDirectory: roots.packageDirectory,
      projectTrusted: false,
    });
    expect(untrusted.profiles).toEqual([]);

    const trusted = await discoverProfileCatalogue({
      cwd: nested,
      agentDir: roots.agentDirectory,
      packageDirectory: roots.packageDirectory,
      projectTrusted: true,
    });
    expect(trusted.profiles.map((profile) => profile.id)).toEqual(["exact"]);

    const projectDirectory = await findProjectProfilesDirectory(nested);
    expect(projectDirectory?.endsWith(join("nested", ".pi", "supi", "agents"))).toBe(true);
  });

  it("uses the nearest trusted project directory up to the Git root", async () => {
    const roots = await sourceRoots();
    const nested = join(roots.root, "src", "nested");
    await mkdir(nested, { recursive: true });
    execFileSync("git", ["init", "--quiet", roots.root]);
    await writeProfile(join(roots.root, ".pi", "supi", "agents"), "root-profile", manifest());
    await writeProfile(join(roots.root, "src", ".pi", "supi", "agents"), "nearest", manifest());

    expect(
      (await findProjectProfilesDirectory(nested))?.endsWith(join("src", ".pi", "supi", "agents")),
    ).toBe(true);
  });

  it("caps sorted effective IDs and reports overflow", async () => {
    const roots = await sourceRoots();
    for (let index = 0; index < 34; index += 1) {
      await writeProfile(
        roots.packageDirectory,
        `profile-${String(index).padStart(2, "0")}`,
        manifest(),
      );
    }

    const catalogue = await discoverProfileCatalogue({
      cwd: roots.root,
      agentDir: roots.agentDirectory,
      packageDirectory: roots.packageDirectory,
      projectTrusted: false,
    });

    expect(catalogue.profiles).toHaveLength(34);
    expect(catalogue.profileIds).toHaveLength(32);
    expect(
      catalogue.diagnostics.filter((diagnostic) => diagnostic.code === "catalogue-overflow"),
    ).toHaveLength(1);
    expect(catalogue.omittedProfileCount).toBe(2);
    expect(catalogue.profileIds).toEqual(
      catalogue.profiles.slice(0, 32).map((profile) => profile.id),
    );
  });

  it("does not let invalid IDs consume effective catalogue slots", async () => {
    const roots = await sourceRoots();
    for (let index = 0; index < 32; index += 1) {
      await writeProfile(roots.packageDirectory, `a-invalid-${String(index).padStart(2, "0")}`, {
        tools: ["unknown" as never],
      });
    }
    await writeProfile(roots.packageDirectory, "z-valid-a", manifest());
    await writeProfile(roots.packageDirectory, "z-valid-b", manifest());

    const catalogue = await discoverProfileCatalogue({
      cwd: roots.root,
      agentDir: roots.agentDirectory,
      packageDirectory: roots.packageDirectory,
      projectTrusted: false,
    });

    expect(catalogue.profileIds).toEqual(["z-valid-a", "z-valid-b"]);
    expect(catalogue.omittedProfileCount).toBe(0);
  });
});
