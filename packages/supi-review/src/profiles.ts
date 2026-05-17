import type { ReviewProfile } from "./types.ts";

const STARTER_PROFILES: ReviewProfile[] = [
  {
    id: "general",
    label: "General",
    description: "Standard review covering correctness, security, performance, and maintainability",
    systemPrompt: "",
  },
  {
    id: "security",
    label: "Security",
    description:
      "Focused security review — injection risks, auth bypasses, secrets exposure, data validation",
    systemPrompt: [
      "--- Security review guidance ---",
      "Prioritize the following areas:",
      "- Injection risks: SQL, command, template injection in user-facing inputs",
      "- Authentication & authorization: missing checks, privilege escalation, session handling",
      "- Secrets exposure: hardcoded keys/tokens, logging sensitive data, insecure storage",
      "- Data validation: insufficient input sanitisation, unsafe deserialization",
      "- Cryptographic misuse: weak algorithms, hardcoded IVs/seeds, signature validation gaps",
      "",
      "Flag anything that could lead to data loss, unauthorized access, or privilege escalation as critical priority.",
    ].join("\n"),
  },
  {
    id: "api-maintainability",
    label: "API & Maintainability",
    description:
      "Focused on API design, breaking changes, consistency, and long-term code maintainability",
    systemPrompt: [
      "--- API & maintainability review guidance ---",
      "Prioritize the following areas:",
      "- API design: inconsistent signatures, breaking contract changes, poor ergonomics",
      "- Breaking changes: modified exported types, removed public APIs, changed parameter shapes",
      "- Code clarity: unclear naming, missing abstractions, overly nested control flow",
      "- Duplication: repeated patterns that should be extracted, copy-pasted code blocks",
      "- Documentation gaps: missing JSDoc, stale comments, undocumented exports",
    ].join("\n"),
  },
];

/** Returns all available starter review profiles. */
export function getProfiles(): ReviewProfile[] {
  return STARTER_PROFILES;
}

/** Returns the profile with the given id, or undefined if not found. */
export function getProfile(id: string): ReviewProfile | undefined {
  return STARTER_PROFILES.find((p) => p.id === id);
}
