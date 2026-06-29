# Task 3: Task 3 (GREEN): Enrich directory brief with factual inventory

Extend `RecursiveDirectorySummary` in `brief-focused.ts` with `byExtension`, `totalFiles`, `landmarkFiles`. Populate during the existing recursive walk. Add rendering in `formatNonModuleDir` and `formatModuleBrief` for extension breakdown and landmark files. Extract extension mapping and landmark detection from `use-case/generate-map.ts` into brief-focused helpers.
