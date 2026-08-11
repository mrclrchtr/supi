import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
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

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const skillsRoot = join(workspaceRoot, "skills");
const inventoryPath = join(packageRoot, "upstream.json");
const upstreamRoot = dirname(
  createRequire(import.meta.url).resolve("mattpocock-skills/package.json"),
);
const upstreamSkillsRoot = join(upstreamRoot, "skills");
const licensePath = join(upstreamRoot, "LICENSE");

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

function sameFile(left: string, right: string): boolean {
  return readFileSync(left).equals(readFileSync(right));
}

function includedGroupNames(inventory: UpstreamInventory): string[] {
  return Object.keys(inventory.includedGroups);
}

function formatInventory(inventory: UpstreamInventory): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

/** Copy the patched stable upstream skills into the root skills catalog. */
export function syncSkillMirror(): void {
  const inventory = readInventory();
  const groups = discoverGroups(groupNames());
  const includedGroups = includedGroupNames(inventory);
  for (const group of includedGroups) {
    if (!groups[group]) throw new Error(`Included upstream group disappeared: ${group}`);
  }
  const oldNames = new Set(includedGroups.flatMap((group) => inventory.groups[group] ?? []));
  const currentEntries = includedGroups.flatMap((group) =>
    (groups[group] ?? []).map((name) => ({ group, name })),
  );
  mkdirSync(skillsRoot, { recursive: true });
  for (const { name } of currentEntries) {
    if (!oldNames.has(name) && existsSync(join(skillsRoot, name))) {
      throw new Error(`Skill output collides with unmanaged skill: ${name}`);
    }
  }

  const stagingRoot = mkdtempSync(join(workspaceRoot, ".supi-skills-sync-"));
  try {
    for (const { group, name } of currentEntries) {
      const target = join(stagingRoot, name);
      if (existsSync(target)) throw new Error(`Duplicate included skill name: ${name}`);
      cpSync(join(upstreamSkillsRoot, group, name), target, { recursive: true });
      cpSync(licensePath, join(target, "LICENSE.mattpocock"));
    }
    for (const name of oldNames) rmSync(join(skillsRoot, name), { recursive: true, force: true });
    for (const { name } of currentEntries) {
      renameSync(join(stagingRoot, name), join(skillsRoot, name));
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

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

function validateSkill(group: string, name: string): string[] {
  const source = join(upstreamSkillsRoot, group, name);
  const target = join(skillsRoot, name);
  if (!existsSync(target)) return [`Missing root skill: ${name}`];

  const sourceFiles = relativeFiles(source);
  const targetFiles = relativeFiles(target).filter((path) => path !== "LICENSE.mattpocock");
  if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) {
    return [`File inventory differs for skill: ${name}`];
  }

  const errors = sourceFiles.flatMap((path) =>
    sameFile(join(source, path), join(target, path))
      ? []
      : [`Generated skill is stale: ${name}/${path}`],
  );
  if (!sameFile(licensePath, join(target, "LICENSE.mattpocock"))) {
    errors.push(`Upstream license is stale for skill: ${name}`);
  }
  return errors;
}

/** Return drift between the pinned patched dependency and the committed skills catalog. */
export function validateSkillMirror(): string[] {
  const inventory = readInventory();
  const actualGroups = discoverGroups(groupNames());
  const inventoryErrors =
    JSON.stringify(actualGroups) === JSON.stringify(inventory.groups)
      ? []
      : ["Upstream added or removed stable skills; run skills:sync and review the inventory"];
  const skillErrors = includedGroupNames(inventory).flatMap((group) =>
    (inventory.groups[group] ?? []).flatMap((name) => validateSkill(group, name)),
  );
  return [...inventoryErrors, ...skillErrors];
}
