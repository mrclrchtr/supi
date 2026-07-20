import { canonicalDeclarationKind } from "../analysis/target/identity.ts";
import type { TargetOutcome } from "../analysis/target/types.ts";
import type {
  AnchorKind,
  TargetRegistrationInput,
  TargetRegistrationOutput,
} from "./target-store.ts";

/** Registered candidate returned when target selection remains unresolved. */
export interface TargetWorkflowCandidate {
  readonly targetId: string;
  readonly name: string;
  readonly kind: string | null;
  readonly container: string | null;
  readonly file: string;
  readonly line: number;
  readonly character: number;
  readonly rank: number;
  readonly anchorKind: AnchorKind;
}

/** Materialize only the bounded candidates already selected by the resolver. */
export function registerTargetCandidates(
  candidates: Extract<TargetOutcome, { kind: "disambiguation" | "kind-mismatch" }>["candidates"],
  registerTarget: (input: TargetRegistrationInput) => TargetRegistrationOutput,
): ReadonlyArray<TargetWorkflowCandidate> {
  return Object.freeze(
    candidates.map((candidate) => {
      const registered = registerTarget({
        file: candidate.file,
        position: { line: candidate.line - 1, character: candidate.character - 1 },
        declarationPosition: {
          line: candidate.declarationAnchor.line - 1,
          character: candidate.declarationAnchor.character - 1,
        },
        declarationOccurrence: candidate.declarationOccurrence,
        displayLine: candidate.line,
        displayCharacter: candidate.character,
        name: candidate.name,
        kind: candidate.kind,
        identityKind: canonicalDeclarationKind(candidate.kind),
        confidence: "semantic",
        provenance: ["semantic"],
        anchorKind: candidate.anchorKind,
        container: candidate.container,
      });
      return Object.freeze({
        targetId: registered.targetId,
        name: candidate.name,
        kind: candidate.kind,
        container: candidate.container,
        file: candidate.file,
        line: candidate.line,
        character: candidate.character,
        rank: candidate.rank,
        anchorKind: candidate.anchorKind,
      });
    }),
  );
}
