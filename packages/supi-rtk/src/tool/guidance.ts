// Prompt guidance for the RTK bash override.
//
// TODO(rtk-ai/rtk#1813): Remove this promptGuidelines entry once the upstream
// issue "vitest run output truncates failures" is fixed in a released RTK
// version. After that, default compact output should list all failing tests and
// this guidance will no longer be necessary.

export const promptGuidelines = [
  "Use bash with `-v` when running test commands (vitest, jest, pytest, cargo test, etc.) because the RTK bash override may compact failure output. Prefix a bash command with `RTK_DISABLED=1` to bypass the RTK bash override entirely and get raw output.",
];
