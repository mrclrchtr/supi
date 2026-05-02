type ModelChoice = {
  provider: string;
  id: string;
  name?: string;
};

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

/**
 * Return the current pi CLI `--models` patterns, if any.
 *
 * Supports both `--models a,b` and `--models=a,b` forms.
 */
export function extractScopedModelPatterns(argv: string[] = process.argv): string[] {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--models") {
      const value = argv[i + 1];
      return splitModelPatterns(value);
    }
    if (arg?.startsWith("--models=")) {
      return splitModelPatterns(arg.slice("--models=".length));
    }
  }
  return [];
}

/**
 * Derive model choices for review settings.
 *
 * When pi was started with `--models`, prefer that scoped subset. Otherwise,
 * fall back to all currently available models.
 */
export function getReviewModelChoices(
  availableModels: ModelChoice[],
  argv: string[] = process.argv,
): string[] {
  const scopedPatterns = extractScopedModelPatterns(argv);
  const scopedChoices = resolveScopedModelChoices(scopedPatterns, availableModels);
  const baseChoices =
    scopedChoices.length > 0
      ? scopedChoices
      : availableModels.map((model) => toCanonicalModelId(model));
  return dedupe(baseChoices);
}

function splitModelPatterns(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
}

function resolveScopedModelChoices(patterns: string[], availableModels: ModelChoice[]): string[] {
  if (patterns.length === 0) return [];

  const resolved: string[] = [];
  for (const rawPattern of patterns) {
    const pattern = stripThinkingSuffix(rawPattern);
    if (!pattern) continue;

    const matches = matchPattern(pattern, availableModels);
    for (const model of matches) {
      resolved.push(toCanonicalModelId(model));
    }
  }

  return dedupe(resolved);
}

function stripThinkingSuffix(pattern: string): string {
  const lastColon = pattern.lastIndexOf(":");
  if (lastColon === -1) return pattern;

  const suffix = pattern.slice(lastColon + 1).toLowerCase();
  if (!THINKING_LEVELS.has(suffix)) return pattern;
  return pattern.slice(0, lastColon);
}

function matchPattern(pattern: string, availableModels: ModelChoice[]): ModelChoice[] {
  const exactCanonical = availableModels.filter((model) => toCanonicalModelId(model) === pattern);
  if (exactCanonical.length > 0) return exactCanonical;

  const exactId = availableModels.filter((model) => model.id === pattern);
  if (exactId.length > 0) return exactId;

  if (pattern.includes("*")) {
    const regex = globToRegExp(pattern);
    return availableModels.filter((model) => matchesRegex(model, regex));
  }

  const lowered = pattern.toLowerCase();
  return availableModels.filter((model) => matchesSubstring(model, lowered));
}

function matchesRegex(model: ModelChoice, regex: RegExp): boolean {
  return (
    regex.test(toCanonicalModelId(model)) || regex.test(model.id) || regex.test(model.name ?? "")
  );
}

function matchesSubstring(model: ModelChoice, loweredPattern: string): boolean {
  return (
    toCanonicalModelId(model).toLowerCase().includes(loweredPattern) ||
    model.id.toLowerCase().includes(loweredPattern) ||
    (model.name ?? "").toLowerCase().includes(loweredPattern)
  );
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function toCanonicalModelId(model: ModelChoice): string {
  return `${model.provider}/${model.id}`;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
