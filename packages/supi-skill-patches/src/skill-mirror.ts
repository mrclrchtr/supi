import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { walkFiles } from "./file-walk.ts";

interface UpstreamInventory {
  repository: string;
  tag: string;
  includedGroups: Record<string, true>;
  groups: Record<string, string[]>;
}

interface SkillMarketplacePlugin {
  name: string;
  source: string;
  description: string;
  skills: string[];
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const skillsRoot = join(workspaceRoot, "skills");
const skillMarketplaceManifestPath = join(workspaceRoot, ".claude-plugin/marketplace.json");
const legacySkillPluginManifestPath = join(workspaceRoot, ".claude-plugin/plugin.json");
const inventoryPath = join(packageRoot, "upstream.json");
const upstreamRoot = dirname(
  createRequire(import.meta.url).resolve("mattpocock-skills/package.json"),
);
const upstreamSkillsRoot = join(upstreamRoot, "skills");
const licensePath = join(upstreamRoot, "LICENSE");
const upstreamLicenseName = "LICENSE.mattpocock";

function readInventory(): UpstreamInventory {
  return JSON.parse(readFileSync(inventoryPath, "utf8")) as UpstreamInventory;
}

function groupNames(): string[] {
  return readdirSync(upstreamSkillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function skillNames(group: string): string[] {
  const directory = join(upstreamSkillsRoot, group);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(directory, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function discoverGroups(groupNames: string[]): Record<string, string[]> {
  return Object.fromEntries(groupNames.map((group) => [group, skillNames(group)]));
}

function dependencyTag(): string {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  const specifier = manifest.devDependencies?.["mattpocock-skills"];
  const tag = specifier?.split("#")[1];
  if (!tag) throw new Error("mattpocock-skills must use a tagged Git dependency");
  return tag;
}

function relativeFiles(directory: string): string[] {
  return walkFiles(directory).map((path) => relative(directory, path));
}

function hasSkillLicense(directory: string): boolean {
  return readdirSync(directory, { withFileTypes: true }).some(
    (entry) => entry.isFile() && /^LICENSE(?:\..+)?$/u.test(entry.name),
  );
}

function hasNamedFile(directory: string, name: string): boolean {
  try {
    return statSync(join(directory, name)).isFile();
  } catch {
    return false;
  }
}

/** Treat missing, unreadable, and non-file paths as drift instead of aborting validation. */
function sameFile(left: string, right: string): boolean {
  try {
    if (!statSync(left).isFile() || !statSync(right).isFile()) return false;
    return readFileSync(left).equals(readFileSync(right));
  } catch {
    return false;
  }
}

function includedGroupNames(inventory: UpstreamInventory): string[] {
  return Object.keys(inventory.includedGroups).sort((left, right) => left.localeCompare(right));
}

function formatInventory(inventory: UpstreamInventory): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function isSupiOwnedSkill(group: string, name: string): boolean {
  return hasNamedFile(join(upstreamSkillsRoot, group, name), "LICENSE.mrclrchtr");
}

function publicSkillPaths(
  inventory: UpstreamInventory,
  groups: Record<string, string[]>,
  supiOwned: boolean,
): string[] {
  return includedGroupNames(inventory).flatMap((group) =>
    (groups[group] ?? [])
      .filter((name) => isSupiOwnedSkill(group, name) === supiOwned)
      .map((name) => `./skills/${group}/${name}`),
  );
}

function formatSkillMarketplaceManifest(
  inventory: UpstreamInventory,
  groups: Record<string, string[]>,
): string {
  const mattpocockSkills = publicSkillPaths(inventory, groups, false);
  const supiSkills = publicSkillPaths(inventory, groups, true);
  const plugins: SkillMarketplacePlugin[] = [];
  if (mattpocockSkills.length > 0) {
    plugins.push({
      name: "mattpocock-skills",
      source: "./",
      description: "Skills adapted from Matt Pocock's public collection.",
      skills: mattpocockSkills,
    });
  }
  if (supiSkills.length > 0) {
    plugins.push({
      name: "supi-skills",
      source: "./",
      description: "SuPi-owned public agent skills.",
      skills: supiSkills,
    });
  }

  const manifest = JSON.stringify(
    {
      name: "supi",
      owner: {
        name: "SuPi",
        url: "https://github.com/mrclrchtr/supi",
      },
      description: "SuPi's public agent skills.",
      plugins,
    },
    null,
    2,
  )
    // Keep generated JSON in the same form as Biome for single-item arrays.
    .replace(/("skills": )\[\n\s+("[^"\n]+")\n\s+\]/gu, "$1[$2]");
  return `${manifest}\n`;
}

function validateSkillMarketplaceManifest(
  inventory: UpstreamInventory,
  groups: Record<string, string[]>,
): string[] {
  try {
    if (existsSync(legacySkillPluginManifestPath)) {
      return [
        "Legacy skills plugin manifest found; run `pnpm skills:sync` to remove .claude-plugin/plugin.json",
      ];
    }
    if (
      readFileSync(skillMarketplaceManifestPath, "utf8") ===
      formatSkillMarketplaceManifest(inventory, groups)
    ) {
      return [];
    }
  } catch {
    // Treat a missing or unreadable manifest as drift.
  }
  return ["Generated skills marketplace manifest is stale: .claude-plugin/marketplace.json"];
}

/** Copy each selected pinned upstream skill group into the root skills catalog. */
export function syncSkillMirror(): void {
  const inventory = readInventory();
  const groups = discoverGroups(groupNames());
  const includedGroups = includedGroupNames(inventory);
  for (const group of includedGroups) {
    if (!groups[group]) throw new Error(`Included upstream group disappeared: ${group}`);
  }
  mkdirSync(skillsRoot, { recursive: true });
  mkdirSync(dirname(skillMarketplaceManifestPath), { recursive: true });

  const stagingRoot = mkdtempSync(join(workspaceRoot, ".supi-skills-sync-"));
  try {
    for (const group of includedGroups) {
      const target = join(stagingRoot, group);
      cpSync(join(upstreamSkillsRoot, group), target, { recursive: true });
      for (const name of groups[group] ?? []) {
        const skillTarget = join(target, name);
        if (!hasSkillLicense(skillTarget)) {
          cpSync(licensePath, join(skillTarget, upstreamLicenseName));
        }
      }
    }
    for (const group of includedGroups) {
      rmSync(join(skillsRoot, group), { recursive: true, force: true });
      renameSync(join(stagingRoot, group), join(skillsRoot, group));
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  rmSync(legacySkillPluginManifestPath, { force: true });
  writeFileSync(skillMarketplaceManifestPath, formatSkillMarketplaceManifest(inventory, groups));
  writeFileSync(
    inventoryPath,
    formatInventory({
      repository: inventory.repository,
      tag: dependencyTag(),
      includedGroups: inventory.includedGroups,
      groups,
    }),
  );
}

function validateGroup(group: string, names: string[]): string[] {
  const source = join(upstreamSkillsRoot, group);
  const target = join(skillsRoot, group);
  if (!existsSync(target)) return [`Missing root skill group: ${group}`];

  const generatedLicenses = new Set(
    names
      .filter((name) => !hasSkillLicense(join(source, name)))
      .map((name) => join(name, upstreamLicenseName)),
  );
  const sourceFiles = relativeFiles(source);
  const targetFiles = relativeFiles(target).filter((path) => !generatedLicenses.has(path));
  const errors =
    JSON.stringify(sourceFiles) === JSON.stringify(targetFiles)
      ? []
      : [`File inventory differs for skill group: ${group}`];

  for (const path of sourceFiles) {
    const targetPath = join(target, path);
    if (existsSync(targetPath) && !sameFile(join(source, path), targetPath)) {
      errors.push(`Generated skill group file is stale: ${group}/${path}`);
    }
  }
  for (const name of names) {
    if (hasSkillLicense(join(source, name))) continue;
    const targetLicense = join(target, name, upstreamLicenseName);
    if (!existsSync(targetLicense) || !sameFile(licensePath, targetLicense)) {
      errors.push(`Upstream license is stale for skill: ${group}/${name}`);
    }
  }
  return errors;
}

/** Return drift between the pinned dependency and the committed skills catalog. */
export function validateSkillMirror(): string[] {
  const inventory = readInventory();
  const actualGroups = discoverGroups(groupNames());
  const inventoryErrors =
    JSON.stringify(actualGroups) === JSON.stringify(inventory.groups)
      ? []
      : ["Upstream added or removed stable skills; run skills:sync and review the inventory"];
  const skillErrors = includedGroupNames(inventory).flatMap((group) =>
    validateGroup(group, inventory.groups[group] ?? []),
  );
  const manifestErrors = validateSkillMarketplaceManifest(inventory, actualGroups);
  return [...inventoryErrors, ...skillErrors, ...manifestErrors];
}
