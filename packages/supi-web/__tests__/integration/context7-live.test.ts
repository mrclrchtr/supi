import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { expect, it } from "vitest";
import docsExtension from "../../src/docs.ts";
import type { WebDocsFetchOutput } from "../../src/tool/web_docs_fetch/result-schema.ts";
import type { WebDocsSearchOutput } from "../../src/tool/web_docs_search/result-schema.ts";
import { expectStructuredContent } from "../helpers/structured-result.ts";

/** Opt-in provider contract check; ordinary verification must stay offline. */
it.skipIf(process.env.SUPI_WEB_LIVE_TESTS !== "1")(
  "delivers live Context7 results through registered PI tools",
  async () => {
    if (!process.env.CONTEXT7_API_KEY)
      throw new Error("Set CONTEXT7_API_KEY for the live Context7 smoke test.");
    const pi = createPiMock();
    docsExtension(pi as never);
    const search = getTool(pi, "web_docs_search");
    const fetch = getTool(pi, "web_docs_fetch");
    const ctx = makeCtx();
    const query = "How to use hooks for state management";
    const searchResult = await search.execute(
      "live-search",
      {
        library_name: "react",
        query,
      },
      undefined,
      undefined,
      ctx,
    );
    const libraries = expectStructuredContent<WebDocsSearchOutput>(search, searchResult);
    expect(libraries.count).toBe(libraries.results.length);
    const libraryId = libraries.results[0]?.id;
    if (!libraryId) throw new Error("Context7 did not return a React library.");

    for (const raw of [false, true]) {
      const result = await fetch.execute(
        `live-docs-${raw}`,
        {
          library_id: libraryId,
          query,
          raw,
        },
        undefined,
        undefined,
        ctx,
      );
      const data = expectStructuredContent<WebDocsFetchOutput>(fetch, result);
      expect(data.libraryId).toBe(libraryId);
      if (raw) {
        if (data.format !== "snippets") throw new Error("Expected normalized snippets.");
        expect(data.snippets.length).toBeGreaterThan(0);
        expect(data.snippets.every((snippet) => snippet.source.length > 0)).toBe(true);
      } else {
        if (data.format !== "markdown") throw new Error("Expected Markdown documentation.");
        expect(data.markdown.length).toBeGreaterThan(0);
        expect(data.chars).toBe(data.markdown.length);
      }
    }

    // biome-ignore lint/security/noSecrets: public no-match query from the live provider regression
    const unmatched = "qzxv90173afc8d6e29b5";
    const emptyResult = await search.execute(
      "live-empty",
      {
        library_name: unmatched,
        query: unmatched,
      },
      undefined,
      undefined,
      ctx,
    );
    expect(expectStructuredContent<WebDocsSearchOutput>(search, emptyResult)).toMatchObject({
      count: 0,
      results: [],
    });
  },
  60_000,
);
