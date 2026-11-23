import { describe, expect, it } from "vitest";
import {
  extractIssueRefs,
  firstUserText,
  formatSessionIssues,
  parseGitHubRemote,
  resolveSessionIssues,
} from "../../src/session-issues.ts";

const origin = { owner: "mrclrchtr", repo: "supi" };

function issues(text: string, defaultRepo = origin) {
  return resolveSessionIssues(extractIssueRefs(text), defaultRepo).map(
    (i) => `${i.repo.owner}/${i.repo.repo}#${i.number}`,
  );
}

describe("extractIssueRefs", () => {
  it("finds URLs, qualified and bare references in order", () => {
    expect(
      issues(
        "See https://github.com/acme/app/issues/12, then acme/lib#5 and (#7). Also https://github.com/acme/app/pull/3",
      ),
    ).toEqual(["acme/app#12", "acme/lib#5", "mrclrchtr/supi#7", "acme/app#3"]);
  });

  it("requires bare references to be standalone tokens", () => {
    expect(issues("a#12 #12abc #fff color:#123 path/#4 fix #9.")).toEqual(["mrclrchtr/supi#9"]);
  });

  it("ignores skill blocks and code", () => {
    const text = [
      '<skill name="x" location="/s/SKILL.md">',
      "Closes #1",
      "</skill>",
      "",
      "Look at #2, not `#3`.",
      "```",
      "Refs #4",
      "```",
    ].join("\n");
    expect(issues(text)).toEqual(["mrclrchtr/supi#2"]);
  });

  it("deduplicates the same issue across notations", () => {
    expect(issues("#12 mrclrchtr/supi#12 https://github.com/MrClrChtr/Supi/issues/12")).toEqual([
      "mrclrchtr/supi#12",
    ]);
  });

  it("ignores other hosts", () => {
    expect(
      issues("https://gitlab.com/acme/app/-/issues/1 https://ghe.corp/acme/app/issues/2"),
    ).toEqual([]);
  });
});

describe("resolveSessionIssues", () => {
  it("drops bare references without a GitHub origin", () => {
    expect(resolveSessionIssues(extractIssueRefs("#1 acme/app#2"), null)).toEqual([
      { repo: { owner: "acme", repo: "app" }, number: 2 },
    ]);
  });
});

describe("parseGitHubRemote", () => {
  it.each([
    ["git@github.com:mrclrchtr/supi.git"],
    ["https://github.com/mrclrchtr/supi.git"],
    ["https://user@github.com/mrclrchtr/supi"],
    ["ssh://git@github.com/mrclrchtr/supi.git\n"],
  ])("parses %j", (url) => {
    expect(parseGitHubRemote(url)).toEqual(origin);
  });

  it("rejects other hosts", () => {
    expect(parseGitHubRemote("git@gitlab.com:mrclrchtr/supi.git")).toBeNull();
  });
});

describe("formatSessionIssues", () => {
  it("omits the default repository from the label", () => {
    const text = formatSessionIssues(
      [
        { repo: origin, number: 12 },
        { repo: { owner: "acme", repo: "app" }, number: 5 },
      ],
      { defaultRepo: origin, hyperlinks: false, style: (t) => t },
    );
    expect(text).toBe("#12 acme/app#5");
  });
});

describe("firstUserText", () => {
  it("returns the first user message on the branch", () => {
    expect(
      firstUserText([
        { type: "model_change" },
        { type: "message", message: { role: "assistant", content: [] } },
        { type: "message", message: { role: "user", content: [{ type: "text", text: "first" }] } },
        { type: "message", message: { role: "user", content: "second" } },
      ]),
    ).toBe("first");
  });
});
