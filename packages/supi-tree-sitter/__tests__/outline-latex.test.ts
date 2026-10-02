import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession, type OutlineItem } from "../src/api.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-outline-latex-"));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

async function outline(source: string): Promise<OutlineItem[]> {
  writeFileSync(join(cwd, "paper.tex"), source);
  const session = createTreeSitterSession(cwd);
  try {
    const result = await session.outline("paper.tex");
    expect(result.kind).toBe("success");
    return result.kind === "success" ? result.data : [];
  } finally {
    await session.dispose();
  }
}

function flatten(items: readonly OutlineItem[]): OutlineItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

describe("LaTeX outline", () => {
  it("shows section structure and does not expose paragraph text as declarations", async () => {
    const items = await outline(
      String.raw`\section{Overview}
Introductory text.
\subsection{Setup}
Setup text.
\section{Results}
Result text.`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["Overview", "section"],
      ["Results", "section"],
    ]);
    expect(items[0]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["Setup", "subsection"],
    ]);
  });

  it("shows command, environment, and label definitions from the grammar", async () => {
    const items = flatten(
      await outline(
        String.raw`\newcommand{\vect}[1]{#1}
\newenvironment{proofsketch}{\begin{quote}}{\end{quote}}
\label{sec:intro}`,
      ),
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["\\vect", "command"],
      ["proofsketch", "environment"],
      ["sec:intro", "label"],
    ]);
  });

  it("keeps labels in sectionless list items", async () => {
    const items = flatten(
      await outline(
        String.raw`\begin{itemize}
  \item First item \label{item:first}
\end{itemize}`,
      ),
    );

    expect(items.map(({ name, kind }) => [name, kind])).toContainEqual(["item:first", "label"]);
  });
});
