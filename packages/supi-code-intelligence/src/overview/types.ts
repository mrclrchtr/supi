/** Use-case data for the workspace architecture overview. */

/** One discovered workspace package and its manifest-declared surface. */
export interface OverviewModule {
  name: string;
  shortName: string;
  /** One-line manifest description; untrusted repository evidence. */
  description: string | null;
  /** Manifest-declared package relationships to other discovered packages. */
  declaredDependencies: string[];
  /** Field-labelled manifest path declarations, never selected by precedence. */
  declaredEntrypoints: string[];
}

/** Project-level overview data rendered by the overview markdown adapter. */
export interface OverviewData {
  projectName: string | null;
  /** One-line workspace description; untrusted repository evidence. */
  projectDescription: string | null;
  modules: OverviewModule[];
  /** Detected source languages (e.g. ["ts", "js", "py"]). */
  detectedLanguages: string[] | null;
}
