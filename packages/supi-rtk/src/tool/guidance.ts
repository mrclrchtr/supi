// Prompt guidance for the RTK bash override.
//
// TODO(rtk-ai/rtk#1813): Remove these promptGuidelines once the upstream issue
// "vitest run output truncates failures" is fixed in a released RTK version.
// After that, default compact output will list all failing tests and this
// guidance will no longer be necessary.

export const promptGuidelines = [
  "When running test commands (vitest, jest, pytest, cargo test, etc.), RTK may intercept and compact the output. To see all test failures without truncation, pass `-v` to the command (e.g. `pnpm vitest -v run`). To bypass RTK entirely and get raw output, prefix with `RTK_DISABLED=1`.",
];
