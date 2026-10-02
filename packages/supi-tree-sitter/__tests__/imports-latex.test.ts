import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/api.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-imports-latex-"));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("LaTeX imports", () => {
  it("extracts package, source, and bibliography include paths", async () => {
    writeFileSync(
      join(cwd, "paper.tex"),
      String.raw`\documentclass{article}
\usepackage{amsmath, booktabs}
\input{chapters/method}
\include{conclusion}
\import{chapters/}{appendix}
\import{chapters}{index}
\addbibresource{references.bib}
\bibliographystyle{plain}
\bibliography{legacy}`,
    );
    const session = createTreeSitterSession(cwd);
    try {
      const result = await session.imports("paper.tex");

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.map(({ moduleSpecifier }) => moduleSpecifier)).toEqual([
        "article",
        "amsmath",
        "booktabs",
        "chapters/method",
        "conclusion",
        "chapters/appendix",
        "chapters/index",
        "references.bib",
        "plain",
        "legacy",
      ]);
    } finally {
      await session.dispose();
    }
  });
});
