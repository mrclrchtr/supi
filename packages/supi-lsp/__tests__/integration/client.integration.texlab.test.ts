import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import { getServerForFile, loadConfig } from "../../src/config/config.ts";
import type { ServerConfig } from "../../src/config/types.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

const FIXTURE = fileURLToPath(new URL("../fixtures/lsp-semantic-server.mjs", import.meta.url));
const HAS_TEXLAB = hasCommand("texlab");
const TEXLAB_SOURCE = String.raw`\documentclass{article}
\begin{document}
\section{Introduction}
\label{sec:intro}
See \ref{sec:intro}.
\end{document}
`;

function readRequests(logPath: string): Array<{ method: string; params: unknown }> {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { method: string; params: unknown });
}

describe("Texlab document routing integration", () => {
  it("routes TeX and BibTeX files and sends Texlab language IDs", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-texlab-integration-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-texlab-home-"));
    const logPath = path.join(cwd, "server.log");
    const texFile = path.join(cwd, "paper.tex");
    const bibFile = path.join(cwd, "references.bib");
    fs.writeFileSync(texFile, "\\section{Intro}\n");
    fs.writeFileSync(bibFile, "@book{key, title={Title}}\n");

    let client: LspClient | undefined;
    try {
      const config = loadConfig(cwd, { homeDir: homeDir }).servers.latex;
      if (!config) throw new Error("The built-in Texlab server is missing.");
      expect(getServerForFile({ servers: { latex: config } }, texFile)?.[0]).toBe("latex");
      expect(getServerForFile({ servers: { latex: config } }, bibFile)?.[0]).toBe("latex");

      const fixtureConfig: ServerConfig = {
        ...config,
        command: process.execPath,
        args: [FIXTURE, logPath],
      };
      client = new LspClient("latex", fixtureConfig, cwd);
      await client.start();
      client.didOpen(texFile, fs.readFileSync(texFile, "utf8"));
      client.didOpen(bibFile, fs.readFileSync(bibFile, "utf8"));

      const requests = await waitFor(
        async () => readRequests(logPath),
        (items) => items.filter(({ method }) => method === "textDocument/didOpen").length === 2,
        { timeoutMs: 2_000, retryDelayMs: 10, label: "Texlab didOpen requests" },
      );
      const documents = requests
        .filter(({ method }) => method === "textDocument/didOpen")
        .map(
          ({ params }) =>
            (params as { textDocument: { languageId: string } }).textDocument.languageId,
        );
      expect(documents).toEqual(["latex", "bibtex"]);
    } finally {
      if (client?.status === "running") await client.shutdown();
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  }, 10_000);
});

describe.skipIf(!HAS_TEXLAB)("installed Texlab diagnostics integration", () => {
  it("keeps push-only diagnostic evidence unconfirmed", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-texlab-diagnostics-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-texlab-home-"));
    const texFile = path.join(cwd, "paper.tex");
    fs.writeFileSync(texFile, TEXLAB_SOURCE);

    const config = loadConfig(cwd, { homeDir }).servers.latex;
    if (!config) throw new Error("The built-in Texlab server is missing.");
    const client = new LspClient("latex", config, cwd);
    try {
      await client.start();
      expect(client.hasDiagnosticProvider).toBe(false);
      expect(client.hasDiagnosticRequestAdapter).toBe(false);
      client.didOpen(texFile, TEXLAB_SOURCE);

      const refresh = await client.refreshOpenDiagnostics({ maxWaitMs: 1_000, quietMs: 20 });
      expect(refresh).toMatchObject({ requested: 1, confirmed: 0, unconfirmed: 1 });

      const result = await client.syncAndWaitForDiagnostics(texFile, TEXLAB_SOURCE, undefined, {
        contentIsAuthoritative: true,
      });
      expect(result.kind).not.toBe("completed");
      if (result.kind !== "completed") {
        expect(result.reason).toContain(
          "empty publication cannot confirm that the document is clean",
        );
      }
    } finally {
      if (client.status === "running") await client.shutdown();
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  }, 15_000);
});
