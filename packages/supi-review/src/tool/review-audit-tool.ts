import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { LocalReviewAuditStore } from "../audit/local-review-audit-store.ts";
import { DEFAULT_PAGE_CHARACTERS, MAX_PAGE_CHARACTERS, pageText } from "./output-page.ts";

const reviewAuditSchema = Type.Object(
  {
    artifactId: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 128,
        description:
          "Local replay id returned by an audited supi_review_run task; omit to list replays.",
      }),
    ),
    offset: Type.Optional(
      Type.Integer({
        minimum: 0,
        default: 0,
        description:
          "UTF-16 character offset; use only with artifactId and omit for the first page.",
      }),
    ),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: MAX_PAGE_CHARACTERS,
        default: DEFAULT_PAGE_CHARACTERS,
        description: "Maximum characters for this page; use only with artifactId.",
      }),
    ),
  },
  {
    additionalProperties: false,
    description:
      "Omit artifactId to list local replays. Supply artifactId to read one replay page.",
  },
);

function formatAuditList(audits: Awaited<ReturnType<LocalReviewAuditStore["list"]>>): string {
  if (audits.length === 0) return "No non-expired local reviewer replays were found.";
  return [
    "# Local Reviewer Replays",
    "",
    ...audits.map((audit) => `- ${audit.artifactId} (expires ${audit.expiresAt})`),
  ].join("\n");
}

function modelFacingPage(
  artifactId: string,
  text: string,
  offset?: number,
  limit?: number,
): string {
  const page = pageText(text, offset, limit);
  if (page.nextOffset === undefined) return page.text;
  const body = page.text.slice(0, page.text.lastIndexOf("\n\n[output paged;"));
  return [
    body,
    "",
    `[output paged; call supi_review_audit with ${JSON.stringify({ artifactId, offset: page.nextOffset })}; total characters: ${page.totalCharacters}]`,
  ].join("\n");
}

/** Register explicit retrieval for opt-in, local-only reviewer replay artifacts. */
export function registerReviewAuditTool(pi: ExtensionAPI, store: LocalReviewAuditStore): void {
  pi.registerTool({
    name: "supi_review_audit",
    label: "Inspect Review Replay",
    description: `List local reviewer replays or read up to ${MAX_PAGE_CHARACTERS} UTF-16 characters from one. Available only when review auditing is enabled; replay content may contain raw repository evidence and tool output.`,
    promptSnippet: "List or inspect local reviewer replays",
    promptGuidelines: ["Do not repeat raw supi_review_audit replay content unless necessary."],
    parameters: reviewAuditSchema,
    async execute(_id, params) {
      if (!params.artifactId) {
        return {
          content: [{ type: "text" as const, text: formatAuditList(await store.list()) }],
          details: { kind: "review-audit" as const, artifactId: "" },
        };
      }
      const text = await store.read(params.artifactId);
      if (text === undefined) {
        throw new Error(`Reviewer replay ${params.artifactId} was not found or has expired.`);
      }
      return {
        content: [
          {
            type: "text" as const,
            text: modelFacingPage(params.artifactId, text, params.offset, params.limit),
          },
        ],
        details: { kind: "review-audit" as const, artifactId: params.artifactId },
      };
    },
  });
}
