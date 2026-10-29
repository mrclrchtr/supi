import { registerLanguageBaselineCase } from "./language-baseline-harness.ts";
import { getLanguageCase } from "./language-cases.ts";

for (const typescriptInstallation of ["typescript", "@typescript/native"] as const) {
  registerLanguageBaselineCase({
    ...getLanguageCase("typescript"),
    label: typescriptInstallation === "typescript" ? "TypeScript 6 TLS" : "TypeScript 7 native",
    typescriptInstallation,
  });
}
