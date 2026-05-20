import type { NormalizedQuestionnaire } from "../types.ts";

export function buildTreeSummaryLabel(
  questionnaire: Pick<NormalizedQuestionnaire, "title" | "questions">,
): string {
  const base =
    questionnaire.title?.trim() || questionnaire.questions.map((q) => q.header).join(", ");
  const trimmed = base.length > 70 ? `${base.slice(0, 67)}...` : base;
  return `ask_user · ${trimmed}`;
}
