import { registerLanguageBaselineCase } from "./language-baseline-harness.ts";
import { getLanguageCase } from "./language-cases.ts";

for (const typescriptInstallation of ["typescript", "@typescript/native"] as const) {
  registerLanguageBaselineCase({
    ...getLanguageCase("javascript"),
    label: typescriptInstallation === "typescript" ? "JavaScript TS6 TLS" : "JavaScript TS7 native",
    typescriptInstallation,
  });
}
