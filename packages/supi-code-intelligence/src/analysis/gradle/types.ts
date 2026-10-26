import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";

/** Explicitly selected runtime; the Tooling API client must never pick a fallback. */
export interface GradleRuntime {
  readonly kind: "distribution" | "installation";
  readonly value: string;
  readonly source: string;
  readonly version: string;
}

/** Gradle-reported identity, independent of a project's possibly duplicate name. */
export interface GradleProjectObservation {
  readonly buildRoot: string;
  readonly path: string;
  readonly name: string;
  readonly directory: string;
  readonly parentPath: string | null;
}

/** One selected-build query, not a parsed Project declaration or a filesystem inventory. */
export type GradleObservation = {
  readonly selectedRoot: string;
  readonly query: "GradleBuild/BasicGradleProject";
  readonly runtime?: GradleRuntime;
} & (
  | {
      readonly status: "complete";
      readonly gradleVersion: string;
      readonly buildRoot: string;
      readonly projects: readonly GradleProjectObservation[];
      readonly includedBuilds: readonly { readonly buildRoot: string }[];
    }
  | {
      readonly status:
        | "blocked"
        | "unavailable"
        | "unsupported"
        | "failed"
        | "interrupted"
        | "timeout"
        | "oversized";
      readonly reason: string;
    }
);

/** Owned query boundary shared by Overview and directory/workspace Orientation. */
export interface GradleObserver {
  observe(root: string, control?: CodeRequestControl): Promise<GradleObservation | undefined>;
}

/** JVM process boundary; tests can supply a controlled process without simulating Gradle internals. */
export type GradleModelQuery = (
  root: string,
  runtime: GradleRuntime,
  control?: CodeRequestControl,
) => Promise<GradleObservation>;
