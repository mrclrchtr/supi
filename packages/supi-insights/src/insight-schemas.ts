import { type Static, Type } from "typebox";

/** Validated result schemas for each generated insight section. */
export const INSIGHT_SCHEMAS = {
  projectAreas: Type.Object({
    areas: Type.Array(
      Type.Object({
        name: Type.String(),
        sessionCount: Type.Number(),
        description: Type.String(),
      }),
    ),
  }),
  interactionStyle: Type.Object({
    narrative: Type.String(),
    keyPattern: Type.String(),
  }),
  whatWorks: Type.Object({
    intro: Type.String(),
    impressiveWorkflows: Type.Array(
      Type.Object({
        title: Type.String(),
        description: Type.String(),
      }),
    ),
  }),
  frictionAnalysis: Type.Object({
    intro: Type.String(),
    categories: Type.Array(
      Type.Object({
        category: Type.String(),
        description: Type.String(),
        examples: Type.Array(Type.String()),
      }),
    ),
  }),
  suggestions: Type.Object({
    claudeMdAdditions: Type.Array(
      Type.Object({
        addition: Type.String(),
        why: Type.String(),
        promptScaffold: Type.String(),
      }),
    ),
    featuresToTry: Type.Array(
      Type.Object({
        feature: Type.String(),
        oneLiner: Type.String(),
        whyForYou: Type.String(),
        exampleCode: Type.String(),
      }),
    ),
    usagePatterns: Type.Array(
      Type.Object({
        title: Type.String(),
        suggestion: Type.String(),
        detail: Type.String(),
        copyablePrompt: Type.String(),
      }),
    ),
  }),
  onTheHorizon: Type.Object({
    intro: Type.String(),
    opportunities: Type.Array(
      Type.Object({
        title: Type.String(),
        whatsPossible: Type.String(),
        howToTry: Type.String(),
        copyablePrompt: Type.String(),
      }),
    ),
  }),
  atAGlance: Type.Object({
    whatsWorking: Type.String(),
    whatsHindering: Type.String(),
    quickWins: Type.String(),
    ambitiousWorkflows: Type.String(),
  }),
  funEnding: Type.Object({
    headline: Type.String(),
    detail: Type.String(),
  }),
} as const;

/** Schema type map keyed by insight section name. */
export type InsightSchemaMap = typeof INSIGHT_SCHEMAS;

/** Result types derived from the schemas used to validate model output. */
export type InsightResultMap = {
  -readonly [Name in keyof InsightSchemaMap]: Static<InsightSchemaMap[Name]>;
};
