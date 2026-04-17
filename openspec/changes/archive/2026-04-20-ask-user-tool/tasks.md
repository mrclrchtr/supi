## 1. Extension scaffolding and tool surface

- [x] 1.1 Create the `ask-user/` extension module structure for schema/types, normalization, flow, UI, and rendering helpers
- [x] 1.2 Add `./ask-user/ask-user.ts` to `package.json` and expose the `ask_user` tool with prompt snippet/guidelines
- [x] 1.3 Define the external tool parameter schema and internal result/detail types for bounded `choice`, `text`, and `yesno` questionnaires, including per-answer source metadata and explicit terminal-state metadata

## 2. Questionnaire normalization and flow

- [x] 2.1 Implement questionnaire normalization and validation for question count, unique IDs, header bounds, choice option bounds, and recommendation targets
- [x] 2.2 Implement the shared questionnaire flow state for single-question completion, multi-question navigation, review, user cancellation, `signal.aborted`, and single-active-questionnaire enforcement
- [x] 2.3 Implement answer normalization so structured selections, `Other` responses, non-empty freeform text, yes/no answers, and optional comments are stored in one consistent result model

## 3. Interactive UI paths

- [x] 3.1 Build the rich overlay questionnaire UI for structured questions, typed text answers, recommendations, optional comments, and multi-question review
- [x] 3.2 Implement the fallback dialog/input adapter using `ctx.ui.select()`, `ctx.ui.confirm()`, and `ctx.ui.input()` with behavior that matches the normalized questionnaire semantics and RPC-mode capability rules
- [x] 3.3 Return clear no-UI errors when neither the rich nor fallback interaction path is available

## 4. Transcript output and tool integration

- [x] 4.1 Implement concise call/result summaries and structured `details` payloads that distinguish submitted, cancelled, and aborted outcomes
- [x] 4.2 Add custom `renderCall` and `renderResult` output so `ask_user` interactions remain readable in the session transcript
- [x] 4.3 Wire the tool execute path to choose the correct UI adapter, format hybrid results, and preserve explicit terminal state metadata

## 5. Tests and verification

- [x] 5.1 Add unit tests for schema validation, normalization, recommendation handling, and result formatting
- [x] 5.2 Add behavior tests for single-question, multi-question, `Other`, comment, non-empty text validation, user-cancel, signal-abort, concurrency guard, and fallback-dialog flows
- [x] 5.3 Add a guidance-focused behavior test that verifies `ask_user` prompt snippet/guidelines steer the model toward focused decision questions
- [x] 5.4 Run `pnpm typecheck`, `pnpm test`, `pnpm biome:ai`, and `pnpm pack:check` to verify the change is implementation-ready
