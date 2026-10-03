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
    expect(items[0]).toMatchObject({ nameAnchor: { line: 1, character: 10 } });
    expect(items[0]?.children?.[0]).toMatchObject({
      nameAnchor: { line: 3, character: 13 },
    });
  });

  it("anchors long titles in starred and optional-title sections", async () => {
    const items = flatten(
      await outline(String.raw`\section*{Overview}
\subsection[Short]{Long title}
\subsubsection{Details}`),
    );

    expect(items.map(({ name, kind, nameAnchor }) => [name, kind, nameAnchor])).toEqual([
      ["Overview", "section", { line: 1, character: 11 }],
      ["Long title", "subsection", { line: 2, character: 20 }],
      ["Details", "subsubsection", { line: 3, character: 16 }],
    ]);
  });

  it("covers punctuation and inner whitespace with one literal title span", async () => {
    const items = await outline(String.raw`\section{  Intro,   overview  }`);

    expect(items[0]).toMatchObject({
      name: "Intro, overview",
      nameAnchor: { line: 1, character: 12 },
      nameEndAnchor: { line: 1, character: 29 },
    });
  });

  it("does not anchor a title that contains an inline label command", async () => {
    const items = await outline(String.raw`\section{Intro\label{sec:intro}}`);

    expect(items[0]?.name).toBe(String.raw`Intro\label{sec:intro}`);
    expect(items[0]?.nameAnchor).toBeUndefined();
    expect(items[0]?.nameEndAnchor).toBeUndefined();
  });

  it("anchors every supported heading command at its title", async () => {
    const items = flatten(
      await outline(String.raw`\part{Part}
\chapter{Chapter}
\section{Section}
\subsection{Subsection}
\subsubsection{Subsubsection}
\paragraph{Paragraph}
\subparagraph{Subparagraph}`),
    );

    expect(items.map(({ name, kind, nameAnchor }) => [name, kind, nameAnchor])).toEqual([
      ["Part", "part", { line: 1, character: 7 }],
      ["Chapter", "chapter", { line: 2, character: 10 }],
      ["Section", "section", { line: 3, character: 10 }],
      ["Subsection", "subsection", { line: 4, character: 13 }],
      ["Subsubsection", "subsubsection", { line: 5, character: 16 }],
      ["Paragraph", "paragraph", { line: 6, character: 12 }],
      ["Subparagraph", "subparagraph", { line: 7, character: 15 }],
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
    expect(items.find(({ name }) => name === "sec:intro")).toMatchObject({
      nameAnchor: { line: 3, character: 8 },
    });
  });

  it("uses the label token for names and anchors when comments occur in its group", async () => {
    const items = flatten(
      await outline(String.raw`\label{sec:intro% trailing comment
}
\label{%
sec:next}`),
    );

    expect(items.filter(({ kind }) => kind === "label")).toMatchObject([
      { name: "sec:intro", nameAnchor: { line: 1, character: 8 } },
      { name: "sec:next", nameAnchor: { line: 4, character: 1 } },
    ]);
  });

  it("keeps complete underscore keys and rejects split key spans", async () => {
    const items = flatten(
      await outline(String.raw`\label{sec:my_label}
\label{sec:intro% trailing comment
}
\label{%
sec:next_label}
\label{sec:part%
suffix}
\label{sec:
split}`),
    );
    const labels = items.filter(({ kind }) => kind === "label");

    expect(labels.map(({ name, nameAnchor }) => [name, nameAnchor])).toEqual([
      ["sec:my_label", { line: 1, character: 8 }],
      ["sec:intro", { line: 2, character: 8 }],
      ["sec:next_label", { line: 5, character: 1 }],
    ]);
  });

  it("parses complete underscore keys in label definitions and references", async () => {
    writeFileSync(
      join(cwd, "paper.tex"),
      String.raw`\label{sec:live_verified}
\ref{sec:live_verified}`,
    );
    const session = createTreeSitterSession(cwd);
    try {
      const definition = await session.query(
        "paper.tex",
        "(label_definition name: (curly_group_label label: (label) @key))",
      );
      const reference = await session.query(
        "paper.tex",
        "(label_reference names: (curly_group_label_list label: (label) @key))",
      );
      const errors = await session.query("paper.tex", "(ERROR) @error");

      expect(definition).toMatchObject({
        kind: "success",
        data: [{ nodeType: "label", text: "sec:live_verified" }],
      });
      expect(reference).toMatchObject({
        kind: "success",
        data: [{ nodeType: "label", text: "sec:live_verified" }],
      });
      expect(errors).toEqual({ kind: "success", data: [] });
      await expect(session.nodeAt("paper.tex", 1, 16)).resolves.toMatchObject({
        kind: "success",
        data: {
          type: "label",
          text: "sec:live_verified",
          ancestry: expect.arrayContaining([
            expect.objectContaining({ type: "curly_group_label" }),
          ]),
        },
      });
      await expect(session.nodeAt("paper.tex", 2, 14)).resolves.toMatchObject({
        kind: "success",
        data: {
          type: "label",
          text: "sec:live_verified",
          ancestry: expect.arrayContaining([
            expect.objectContaining({ type: "curly_group_label_list" }),
          ]),
        },
      });
    } finally {
      await session.dispose();
    }
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
