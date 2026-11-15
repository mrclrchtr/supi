import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countBranchStashes,
  emptyGitCounts,
  formatGitCounts,
  type GitCounts,
  GitCountsRefresher,
  parsePorcelainStatus,
} from "../../src/footer-git-status.ts";
import { getFooterGlyphs, resolveIconMode } from "../../src/footer-icons.ts";

describe("parsePorcelainStatus", () => {
  it("parses tracking info and file states", () => {
    const { branch, counts } = parsePorcelainStatus(
      [
        "## feat/x...origin/feat/x [ahead 2, behind 1]",
        "M  staged.ts",
        " M modified.ts",
        "MM both.ts",
        "A  added.ts",
        "R  old.ts -> new.ts",
        " D gone.ts",
        "UU conflict.ts",
        "?? new.txt",
        "",
      ].join("\n"),
    );

    expect(branch).toBe("feat/x");
    expect(counts).toMatchObject({
      ahead: 2,
      behind: 1,
      staged: 3,
      modified: 2,
      renamed: 1,
      deleted: 1,
      conflicted: 1,
      untracked: 1,
    });
  });

  it("handles detached HEAD and branches without upstream", () => {
    expect(parsePorcelainStatus("## HEAD (no branch)\n").branch).toBeNull();
    expect(parsePorcelainStatus("## main\n").branch).toBe("main");
    expect(parsePorcelainStatus("## No commits yet on main\n").branch).toBe("main");
  });
});

describe("countBranchStashes", () => {
  it("counts only stashes from the current branch (stash stack is shared across worktrees)", () => {
    const subjects = [
      "WIP on main: abc123 msg",
      "On main: tagged",
      "WIP on other: def456 msg",
      "On main-2: not main",
    ].join("\n");
    expect(countBranchStashes(subjects, "main")).toBe(2);
    expect(countBranchStashes(subjects, null)).toBe(0);
  });
});

describe("formatGitCounts", () => {
  it("shows only non-zero counts", () => {
    const counts: GitCounts = { ...emptyGitCounts(), ahead: 2, modified: 3, untracked: 1 };
    expect(formatGitCounts(counts, getFooterGlyphs("ascii"))).toBe("^2 !3 ?1");
    expect(formatGitCounts(emptyGitCounts(), getFooterGlyphs("ascii"))).toBe("");
  });
});

describe("resolveIconMode", () => {
  const utf8 = { LANG: "en_US.UTF-8" };

  it("keeps explicit modes", () => {
    expect(resolveIconMode("unicode", {}, false)).toBe("unicode");
  });

  it("resolves auto from the terminal environment", () => {
    expect(resolveIconMode("auto", utf8, true)).toBe("nerd");
    expect(resolveIconMode("auto", { ...utf8, SSH_TTY: "/dev/ttys001" }, true)).toBe("unicode");
    expect(resolveIconMode("auto", utf8, false)).toBe("ascii");
    expect(resolveIconMode("auto", { LANG: "C" }, true)).toBe("ascii");
  });
});

describe("GitCountsRefresher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses bursts into one leading and one trailing read", async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => emptyGitCounts());
    const refresher = new GitCountsRefresher(() => {}, read, 1000);

    refresher.request("/repo");
    refresher.request("/repo");
    refresher.request("/repo");
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("ignores results that arrive after dispose", async () => {
    let resolve: (counts: GitCounts) => void = () => {};
    const onChange = vi.fn();
    const refresher = new GitCountsRefresher(
      onChange,
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );

    refresher.request("/repo", true);
    refresher.dispose();
    resolve({ ...emptyGitCounts(), modified: 1 });
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
    expect(refresher.current).toBeNull();
  });
});

describe("buildPwdLine", () => {
  it("renders icons and git status after the branch", async () => {
    const { buildPwdLine } = await import("../../src/supi-footer-helpers.ts");
    const base = { cwd: "/repo", gitBranch: "main", sessionName: undefined, gitStatus: "!1" };

    expect(buildPwdLine({ ...base, glyphs: getFooterGlyphs("ascii") })).toBe("/repo (main) !1");
    expect(buildPwdLine({ ...base, glyphs: getFooterGlyphs("unicode") })).toBe(
      "▸ /repo  ⎇ main !1",
    );
  });
});
