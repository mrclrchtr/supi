import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { realpathOrResolve } from "./path.ts";
import {
  makeDiagnostic,
  type ProfileCandidate,
  validateProfileDirectory,
} from "./profile-validation.ts";
import {
  type AgentProfile,
  type AgentProfileManifest,
  MAX_PROFILE_COUNT,
  PROFILE_MANIFEST_FIELDS,
  type ProfileCatalogue,
  type ProfileCatalogueEntry,
  type ProfileDiagnostic,
  type ProfileSource,
  type ProfileSourceDirectories,
} from "./types.ts";

const execFileAsync = promisify(execFile);
const packageProfilesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../profiles");
const SOURCE_ORDER: readonly ProfileSource[] = ["package", "global", "project"];
const REQUIRED_FIELDS: readonly (keyof AgentProfileManifest)[] = [
  "description",
  "tools",
  "systemPrompt",
  "instructionScopes",
];

type ProfileSourceDirectory = {
  readonly source: ProfileSource;
  readonly directory: string | undefined;
};

/** Inputs for one immutable Profile Catalogue snapshot. */
export interface DiscoverProfileCatalogueOptions {
  /** Session cwd used for trusted-project profile lookup. */
  readonly cwd: string;
  /** PI agent directory, normally returned by getAgentDir(). */
  readonly agentDir: string;
  /** Whether PI has already trusted the current project. */
  readonly projectTrusted: boolean;
  /** Package profile root; defaults to this package's bundled profiles. */
  readonly packageDirectory?: string;
}

/**
 * Resolve one catalogue entry into a complete effective Agent Profile.
 *
 * When source directories are supplied, Model and Thinking settings are read
 * again so changes from `/supi-settings` apply to the next Agent Run.
 */
export function resolveProfileDefinition(
  entry: ProfileCatalogueEntry,
  sourceDirectories?: ProfileSourceDirectories,
): AgentProfile | ProfileDiagnostic {
  const selected = new Map<
    keyof AgentProfileManifest,
    { value: unknown; candidate: ProfileCandidate }
  >();
  const currentSettingsSources = sourceDirectories
    ? readCurrentProfileSources(entry.id, sourceDirectories)
    : entry.sources;

  for (const field of PROFILE_MANIFEST_FIELDS) {
    const value = resolveField(profileSourcesForField(entry, currentSettingsSources, field), field);
    if (value) selected.set(field, value);
  }

  const missing = REQUIRED_FIELDS.filter((field) => !selected.has(field));
  if (missing.length > 0) {
    const fallback = strongestAvailableSource(entry.sources);
    return makeDiagnostic(
      entry.id,
      fallback?.source ?? "package",
      "incomplete-manifest",
      `Profile is missing required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
      fallback?.directory,
    );
  }

  const promptSelection = selected.get("systemPrompt");
  const customSystemPrompt =
    promptSelection?.value === "custom" ? promptSelection.candidate.customSystemPrompt : undefined;
  if (promptSelection?.value === "custom" && customSystemPrompt === undefined) {
    return makeDiagnostic(
      entry.id,
      promptSelection.candidate.source,
      "invalid-prompt",
      "systemPrompt=custom requires a sibling SYSTEM.md file.",
      promptSelection.candidate.directory,
    );
  }

  const strongest = strongestSelectedSource(selected) ?? strongestAvailableSource(entry.sources);
  if (!strongest) {
    return makeDiagnostic(
      entry.id,
      "package",
      "incomplete-manifest",
      "Profile has no available source.",
    );
  }

  const manifest = buildResolvedManifest(selected);
  const fieldSources = Object.freeze(
    Object.fromEntries(
      [...selected].map(([field, selection]) => [field, selection.candidate.source]),
    ),
  );

  return Object.freeze({
    id: entry.id,
    source: strongest.source,
    directory: strongest.directory,
    manifest,
    fieldSources,
    ...(customSystemPrompt === undefined ? {} : { customSystemPrompt }),
  });
}

/** Discover package, global, and trusted-project profile sources. */
export async function discoverProfileCatalogue(
  options: DiscoverProfileCatalogueOptions,
): Promise<ProfileCatalogue> {
  const projectDirectory = options.projectTrusted
    ? await findProjectProfilesDirectory(options.cwd)
    : undefined;
  const projectWriteDirectory = options.projectTrusted
    ? await findProjectProfilesDirectoryForWrite(options.cwd)
    : undefined;
  const sourceDirectories: ProfileSourceDirectories = Object.freeze({
    package: options.packageDirectory ?? packageProfilesDirectory,
    global: join(options.agentDir, "supi", "agents"),
    ...(projectWriteDirectory === undefined ? {} : { project: projectWriteDirectory }),
  });
  const sources: readonly ProfileSourceDirectory[] = [
    { source: "package", directory: sourceDirectories.package },
    { source: "global", directory: sourceDirectories.global },
    { source: "project", directory: projectDirectory },
  ];
  const grouped = new Map<string, ProfileCandidate[]>();
  const diagnostics: ProfileDiagnostic[] = [];

  for (const source of sources) {
    for (const candidate of readProfileSource(source)) {
      if (candidate.diagnostic?.code === "invalid-profile-id") {
        diagnostics.push(candidate.diagnostic);
        continue;
      }
      const entries = grouped.get(candidate.id) ?? [];
      entries.push(candidate);
      grouped.set(candidate.id, entries);
    }
  }

  const sortedProfileIds = [...grouped.keys()].sort(compareProfileIds);
  const profiles = sortedProfileIds.map((id) => createCatalogueEntry(id, grouped.get(id) ?? []));
  const effectiveProfiles = collectEffectiveProfiles(profiles, diagnostics);
  const profileIds = effectiveProfiles.slice(0, MAX_PROFILE_COUNT).map((profile) => profile.id);
  const omittedProfileCount = Math.max(0, effectiveProfiles.length - profileIds.length);
  if (omittedProfileCount > 0) {
    const firstOmitted = effectiveProfiles[MAX_PROFILE_COUNT];
    const strongest = firstOmitted && strongestAvailableSource(firstOmitted.sources);
    diagnostics.push(
      makeDiagnostic(
        "(overflow)",
        strongest?.source ?? "package",
        "catalogue-overflow",
        `${omittedProfileCount} additional profile IDs were omitted by the ${MAX_PROFILE_COUNT}-profile catalogue limit.`,
        strongest?.directory,
      ),
    );
  }

  const frozenProfiles = Object.freeze(profiles);
  return Object.freeze({
    profiles: frozenProfiles,
    diagnostics: Object.freeze(diagnostics),
    profileIds: Object.freeze(profileIds),
    omittedProfileCount,
    sourceDirectories,
  });
}

/** Locate the nearest existing trusted project profile directory. */
export async function findProjectProfilesDirectory(cwd: string): Promise<string | undefined> {
  const resolvedCwd = realpathOrResolve(cwd);
  const gitRoot = await findGitRoot(resolvedCwd);
  if (!gitRoot) {
    const exact = join(resolvedCwd, ".pi", "supi", "agents");
    return isDirectory(exact) ? exact : undefined;
  }

  let current = resolvedCwd;
  while (true) {
    const candidate = join(current, ".pi", "supi", "agents");
    if (isDirectory(candidate)) return candidate;
    if (current === gitRoot) return undefined;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Return the trusted project profile destination, even before it exists. */
export async function findProjectProfilesDirectoryForWrite(
  cwd: string,
): Promise<string | undefined> {
  const resolvedCwd = realpathOrResolve(cwd);
  const existing = await findProjectProfilesDirectory(resolvedCwd);
  if (existing) return existing;
  const gitRoot = await findGitRoot(resolvedCwd);
  return join(gitRoot ?? resolvedCwd, ".pi", "supi", "agents");
}

function collectEffectiveProfiles(
  profiles: readonly ProfileCatalogueEntry[],
  diagnostics: ProfileDiagnostic[],
): ProfileCatalogueEntry[] {
  const effective: ProfileCatalogueEntry[] = [];
  for (const profile of profiles) {
    diagnostics.push(...profile.diagnostics);
    if (!("code" in resolveProfileDefinition(profile))) effective.push(profile);
  }
  return effective;
}

function createCatalogueEntry(
  id: string,
  candidates: readonly ProfileCandidate[],
): ProfileCatalogueEntry {
  const sources = Object.freeze([...candidates]);
  const description = resolveField(sources, "description")?.value;
  const diagnostics = Object.freeze(
    candidates.flatMap((candidate) => (candidate.diagnostic ? [candidate.diagnostic] : [])),
  );
  return Object.freeze({
    id,
    description: typeof description === "string" ? description : id,
    sources,
    diagnostics,
  });
}

function buildResolvedManifest(
  selected: ReadonlyMap<
    keyof AgentProfileManifest,
    { value: unknown; candidate: ProfileCandidate }
  >,
): AgentProfileManifest {
  return Object.freeze({
    description: selectedValue<string>(selected, "description"),
    tools: Object.freeze([
      ...selectedValue<readonly string[]>(selected, "tools"),
    ]) as AgentProfileManifest["tools"],
    systemPrompt: selectedValue<AgentProfileManifest["systemPrompt"]>(selected, "systemPrompt"),
    instructionScopes: Object.freeze([
      ...selectedValue<readonly string[]>(selected, "instructionScopes"),
    ]) as AgentProfileManifest["instructionScopes"],
    ...(selected.has("model") ? { model: selectedValue<string>(selected, "model") } : {}),
    ...(selected.has("thinking")
      ? { thinking: selectedValue<AgentProfileManifest["thinking"]>(selected, "thinking") }
      : {}),
    ...(selected.has("timeoutMinutes")
      ? { timeoutMinutes: selectedValue<number>(selected, "timeoutMinutes") }
      : {}),
  });
}

function selectedValue<T>(
  selected: ReadonlyMap<
    keyof AgentProfileManifest,
    { value: unknown; candidate: ProfileCandidate }
  >,
  field: keyof AgentProfileManifest,
): T {
  const selection = selected.get(field);
  if (!selection) throw new Error(`Missing resolved profile field: ${field}.`);
  return selection.value as T;
}

function profileSourcesForField(
  entry: ProfileCatalogueEntry,
  currentSettingsSources: readonly ProfileCandidate[],
  field: keyof AgentProfileManifest,
): readonly ProfileCandidate[] {
  return field === "model" || field === "thinking" ? currentSettingsSources : entry.sources;
}

function resolveField(
  sources: readonly ProfileCandidate[],
  field: keyof AgentProfileManifest,
): { value: unknown; candidate: ProfileCandidate } | undefined {
  for (const candidate of sourcesByPrecedence(sources)) {
    if (candidate.diagnostic || !candidate.manifest) continue;
    if (Object.hasOwn(candidate.manifest, field)) {
      return { value: candidate.manifest[field], candidate };
    }
  }
  return undefined;
}

function strongestAvailableSource(
  sources: readonly ProfileCandidate[],
): ProfileCandidate | undefined {
  return sourcesByPrecedence(sources).find(
    (candidate) => !candidate.diagnostic && candidate.manifest,
  );
}

function sourcesByPrecedence(sources: readonly ProfileCandidate[]): ProfileCandidate[] {
  return [...SOURCE_ORDER]
    .reverse()
    .flatMap((source) => sources.filter((candidate) => candidate.source === source));
}

function strongestSelectedSource(
  selected: ReadonlyMap<
    keyof AgentProfileManifest,
    { value: unknown; candidate: ProfileCandidate }
  >,
): ProfileCandidate | undefined {
  return [...selected.values()]
    .map((value) => value.candidate)
    .sort((left, right) => sourceRank(right.source) - sourceRank(left.source))[0];
}

function sourceRank(source: ProfileSource): number {
  return SOURCE_ORDER.indexOf(source);
}

function readProfileSource(source: ProfileSourceDirectory): ProfileCandidate[] {
  const directory = source.directory;
  if (!directory || !isDirectory(directory)) return [];
  try {
    return readdirSync(directory, { withFileTypes: true, encoding: "utf8" })
      .filter((entry) => entry.isDirectory())
      .map((entry) => validateProfileDirectory(source.source, join(directory, entry.name)))
      .sort((left, right) => compareProfileIds(left.id, right.id));
  } catch {
    return [];
  }
}

function compareProfileIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Read the current package, global, and trusted-project sources for one Profile ID. */
export function readCurrentProfileSources(
  profileId: string,
  sourceDirectories: ProfileSourceDirectories,
): ProfileCandidate[] {
  return SOURCE_ORDER.flatMap((source) => {
    const root = sourceDirectory(sourceDirectories, source);
    if (!root) return [];
    const directory = join(root, profileId);
    return isDirectory(directory) ? [validateProfileDirectory(source, directory)] : [];
  });
}

function sourceDirectory(
  directories: ProfileSourceDirectories,
  source: ProfileSource,
): string | undefined {
  switch (source) {
    case "package":
      return directories.package;
    case "global":
      return directories.global;
    case "project":
      return directories.project;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function findGitRoot(cwd: string): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
      ),
    });
    const root = result.stdout.trim();
    return root ? realpathOrResolve(root) : undefined;
  } catch {
    return undefined;
  }
}
