/**
 * Session Issues for the SuPi footer.
 *
 * A Session Issue is a GitHub issue or pull request that the first user
 * message on the current session branch refers to. Nothing is persisted: the
 * footer derives the list from the branch on session start and tree
 * navigation, and from the first user message when it arrives.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getCapabilities, hyperlink } from "@earendil-works/pi-tui";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 2000;

/** A GitHub repository, as `owner/repo`. */
export interface GitHubRepo {
  owner: string;
  repo: string;
}

/** An issue reference as written; a bare `#N` has no repository yet. */
export interface IssueRef {
  repo?: GitHubRepo;
  number: number;
}

/** A Session Issue with its repository resolved. */
export interface SessionIssue {
  repo: GitHubRepo;
  number: number;
}

const OWNER = "([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))";
const REPO = "([A-Za-z0-9._-]+)";
const ISSUE_PATTERN = new RegExp(
  [
    // https://github.com/o/r/issues/12 or /pull/12
    `https?://(?:www\\.)?github\\.com/${OWNER}/${REPO}/(?:issues|pull)/(\\d+)(?!\\d)`,
    // o/r#12
    `(?<![\\w./-])${OWNER}/${REPO}#(\\d+)(?!\\w)`,
    // #12 as its own token
    // biome-ignore lint/security/noSecrets: regular expression, not a secret
    "(?<=^|[\\s([])#(\\d+)(?!\\w)",
  ].join("|"),
  "gm",
);

const SKILL_BLOCK = /<skill name="[^"]*" location="[^"]*">[\s\S]*?<\/skill>/g;
const FENCED_CODE = /(```|~~~)[\s\S]*?(?:\1|$(?![\s\S]))/g;
const INLINE_CODE = /`[^`\n]*`/g;

/** Remove expanded skill blocks and code so only prose the user wrote is searched. */
function userProse(text: string): string {
  return text.replace(SKILL_BLOCK, " ").replace(FENCED_CODE, " ").replace(INLINE_CODE, " ");
}

/** Find issue references in a user message, in order of appearance. */
export function extractIssueRefs(text: string): IssueRef[] {
  const refs: IssueRef[] = [];
  for (const match of userProse(text).matchAll(ISSUE_PATTERN)) {
    const [, urlOwner, urlRepo, urlNumber, owner, repo, qualifiedNumber, bareNumber] = match;
    if (urlOwner && urlRepo && urlNumber) {
      refs.push({ repo: { owner: urlOwner, repo: urlRepo }, number: Number(urlNumber) });
    } else if (owner && repo && qualifiedNumber) {
      refs.push({ repo: { owner, repo }, number: Number(qualifiedNumber) });
    } else if (bareNumber) {
      refs.push({ number: Number(bareNumber) });
    }
  }
  return refs.filter((ref) => ref.number > 0);
}

/** Parse a github.com remote URL (HTTPS, SSH, or scp-like). Other hosts return `null`. */
export function parseGitHubRemote(url: string): GitHubRepo | null {
  const match =
    /^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/|(?:[^@/]+@)?github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(
      url.trim(),
    );
  if (!(match?.[1] && match[2])) return null;
  return { owner: match[1], repo: match[2] };
}

function sameRepo(a: GitHubRepo, b: GitHubRepo): boolean {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
  );
}

/**
 * Resolve bare `#N` references against the default repository and drop
 * duplicates. Without a default repository, bare references are dropped.
 */
export function resolveSessionIssues(
  refs: readonly IssueRef[],
  defaultRepo: GitHubRepo | null,
): SessionIssue[] {
  const issues: SessionIssue[] = [];
  for (const ref of refs) {
    const repo = ref.repo ?? defaultRepo;
    if (!repo) continue;
    if (issues.some((i) => i.number === ref.number && sameRepo(i.repo, repo))) continue;
    issues.push({ repo, number: ref.number });
  }
  return issues;
}

/**
 * Format Session Issues as `#12 o/r#5`. Issues in the default repository omit
 * the repository. With `hyperlinks`, each reference links to its GitHub page;
 * `/issues/N` also redirects to pull requests.
 */
export function formatSessionIssues(
  issues: readonly SessionIssue[],
  options: {
    defaultRepo: GitHubRepo | null;
    hyperlinks: boolean;
    style: (text: string) => string;
  },
): string {
  return issues
    .map((issue) => {
      const { owner, repo } = issue.repo;
      const local = options.defaultRepo && sameRepo(issue.repo, options.defaultRepo);
      const label = options.style(`${local ? "" : `${owner}/${repo}`}#${issue.number}`);
      return options.hyperlinks
        ? hyperlink(label, `https://github.com/${owner}/${repo}/issues/${issue.number}`)
        : label;
    })
    .join(" ");
}

/** Text of a user message; image parts are ignored. */
export function userMessageText(message: unknown): string | undefined {
  const m = message as { role?: string; content?: unknown } | undefined;
  if (m?.role !== "user") return undefined;
  if (typeof m.content === "string") return m.content;
  if (!Array.isArray(m.content)) return "";
  return m.content
    .filter((part): part is { type: "text"; text: string } => part?.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/** Text of the first user message on a branch, or `undefined` when there is none yet. */
export function firstUserText(
  entries: ReadonlyArray<{ type: string; message?: unknown }>,
): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const text = userMessageText(entry.message);
    if (text !== undefined) return text;
  }
  return undefined;
}

async function readOriginRepo(cwd: string): Promise<GitHubRepo | null> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });
    return parseGitHubRemote(stdout);
  } catch {
    return null;
  }
}

/**
 * Tracks the Session Issues of the current branch.
 *
 * The `origin` remote is read once per session, and only when a bare `#N`
 * needs it; `rerender` runs when it arrives.
 */
export class SessionIssueTracker {
  private cwd: string | undefined;
  private refs: IssueRef[] = [];
  private hasFirstMessage = false;
  private origin: GitHubRepo | null = null;
  private originRequested = false;
  private generation = 0;

  constructor(private readonly rerender: () => void) {}

  /** Reset for a session and derive the issues from its branch. */
  start(cwd: string, entries: ReadonlyArray<{ type: string; message?: unknown }>): void {
    this.cwd = cwd;
    this.origin = null;
    this.originRequested = false;
    this.generation++;
    this.fromBranch(entries);
  }

  /** Derive the issues again, for example after tree navigation. */
  fromBranch(entries: ReadonlyArray<{ type: string; message?: unknown }>): void {
    const text = firstUserText(entries);
    this.hasFirstMessage = text !== undefined;
    this.refs = text === undefined ? [] : extractIssueRefs(text);
  }

  /** Take a finished message; only the first user message on the branch counts. */
  onMessage(message: unknown): void {
    if (this.hasFirstMessage) return;
    const text = userMessageText(message);
    if (text === undefined) return;
    this.hasFirstMessage = true;
    this.refs = extractIssueRefs(text);
    this.rerender();
  }

  stop(): void {
    this.cwd = undefined;
    this.refs = [];
    this.hasFirstMessage = false;
    this.generation++;
  }

  /** Formatted issues for the footer, or `undefined` when there are none. */
  render(style: (text: string) => string): string | undefined {
    if (this.refs.length === 0) return undefined;
    if (this.refs.some((ref) => !ref.repo)) this.requestOrigin();
    const issues = resolveSessionIssues(this.refs, this.origin);
    if (issues.length === 0) return undefined;
    return formatSessionIssues(issues, {
      defaultRepo: this.origin,
      hyperlinks: getCapabilities().hyperlinks,
      style,
    });
  }

  private requestOrigin(): void {
    if (this.originRequested || !this.cwd) return;
    this.originRequested = true;
    const generation = this.generation;
    void readOriginRepo(this.cwd).then((origin) => {
      if (generation !== this.generation || !origin) return;
      this.origin = origin;
      this.rerender();
    });
  }
}
