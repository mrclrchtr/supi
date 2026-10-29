import { type Static, Type } from "typebox";

const pageProperties = {
  text: Type.String({
    description: "Selected page only, without synthetic paging notices or empty-page markers.",
  }),
  offset: Type.Integer({ minimum: 0 }),
  nextOffset: Type.Optional(Type.Integer({ minimum: 0 })),
  totalCharacters: Type.Integer({ minimum: 0 }),
};
const outlineRow = Type.Object(
  {
    index: Type.Integer({ minimum: 0 }),
    role: Type.String(),
    contentKinds: Type.Array(Type.String()),
    contentCharacters: Type.Integer({ minimum: 0 }),
    toolNames: Type.Array(Type.String()),
    stopReason: Type.Optional(Type.String()),
    hasError: Type.Boolean(),
  },
  { additionalProperties: false },
);

/** Native data for exactly the selected audit view/page, never an implicit full replay. */
export const reviewAuditOutputSchema = Type.Union([
  Type.Object(
    {
      mode: Type.Literal("list"),
      audits: Type.Array(
        Type.Object(
          { artifactId: Type.String(), expiresAt: Type.String() },
          { additionalProperties: false },
        ),
      ),
      totalAudits: Type.Integer({ minimum: 0 }),
      ...pageProperties,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      mode: Type.Literal("outline"),
      artifactId: Type.String(),
      rows: Type.Array(outlineRow),
      messageIndexes: Type.Array(Type.Integer({ minimum: 0 })),
      totalMessages: Type.Integer({ minimum: 0 }),
      ...pageProperties,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      mode: Type.Literal("message"),
      artifactId: Type.String(),
      messageIndex: Type.Integer({ minimum: 0 }),
      ...pageProperties,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { mode: Type.Literal("raw"), artifactId: Type.String(), ...pageProperties },
    { additionalProperties: false },
  ),
]);

/** Mode-discriminated script contract; page completion says nothing about Criteria Coverage. */
export type ReviewAuditOutput = Static<typeof reviewAuditOutputSchema>;
