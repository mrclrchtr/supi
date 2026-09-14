---
status: accepted
---

# Keep model requests under PI provider authority

SuPi direct completions will use one shared request module in `supi-core/llm`, backed by the public PI model registry. PI will own authentication, OAuth refresh, provider headers, environment, and effective endpoints. Features will own model selection, prompts, output limits, cancellation, retries, output validation, and error presentation.

Agent Runs will retain their private PI runtime and borrowed Provider Authority. They will not use the direct-completion module. Their provider adapter must preserve the auth-resolved endpoint when it delegates to the parent provider. PI already supplies a stable, separate child session identity; SuPi will keep that mechanism.

## Considered options

- Add provider fixes to each feature: rejected because request policy would remain duplicated.
- Send Agent Runs through the direct-completion module: rejected because a completion does not own a child session, tool loop, or continuation lifecycle.
- Reuse the primary session identity for direct completions: rejected because unrelated prompt streams would share provider routing identity.

## Consequences

- Direct completions will use stable, opaque identities separated by feature prompt stream, PI session, provider, and model. Prompt suggestions will reuse their identity across assistant turns and session resume. These identities reduce routing interference risk; they do not guarantee provider cache reuse.
- PI 0.85.1 OpenCode compatibility will be implemented once for direct completions. It will match PI's provider-ID or exact-host rule and preserve explicit header overrides. An explicit shared session header can remove the default separation.
- Features will not copy resolved credentials into request options. No dependency from `supi-core` to `supi-agent-runtime` will be added.

See the [issue #402 plan](../ops/issue-402-model-requests.md) for scope and verification criteria.
