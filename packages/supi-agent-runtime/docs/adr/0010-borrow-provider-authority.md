# Borrow provider authority through a public PI adapter

The Agent Run must use the containing session's effective provider authority. A fresh PI `ModelRuntime` loses runtime API keys, OAuth state, model-specific headers, environment values, and extension-registered provider implementations.

PI 0.83 does not expose the containing `ModelRuntime` through `ExtensionContext`. We therefore do not wait for an upstream API, use a private cast, or share the mutable parent runtime.

`AgentSessionInputs` requires a narrow caller-owned `AgentRunProviderAuthority` with the public provider and authentication operations. `createAgentRunProviderAuthority()` adapts the containing `ModelRegistry`. The runtime creates a private child `ModelRuntime` with network refresh disabled and registers one native provider adapter. The adapter:

- delegates the current provider implementation and model stream methods;
- resolves provider authentication on every request;
- resolves chat-model request keys, headers, environment, and effective base URLs for the exact chat model being dispatched;
- preserves provider-owned OAuth refresh, runtime credentials, base URLs, and custom streams;
- keeps child provider registration local to the Agent Run.

For explicitly opted-in codemode children, callers capture `captureAgentRunAuxiliaryModels(authority)` once per top-level invocation and pass that immutable classifier/image catalogue as `AgentSessionInputs.authorizedAuxiliaryModels`. Omission leaves auxiliary access empty. The child runtime exposes only this snapshot for auxiliary enumeration and provider/model lookup, and validates the same snapshot again at dispatch. Classifier and image requests are delegated to the containing registry with the authorized model identity and cancellation signal only. The parent registry resolves that model's request-time auth, headers, and endpoint; auth prepared for the currently selected chat model is never forwarded to an auxiliary request. The snapshot is not refreshed during a run, and credentials are not copied into model-facing catalogue data.

For each delegated request, the adapter keeps the matching parent catalog model when available, so provider-specific model metadata and custom stream behavior remain active. It then applies the effective `baseUrl` from the prepared child model to the delegated model for both `stream` and `streamSimple`. If catalog lookup fails, it applies the same endpoint to the authorized fallback.

The child runtime uses in-memory credential and model stores, so it cannot discover ambient parent credentials or model configuration. The caller passes authority at execution time. Prepared plans store model identity, never authority or credential state. Resources, extensions, tools, and settings remain caller-owned policy and are not inherited from the containing session.

This is an exact behavioral borrow, not a shared `ModelRuntime` identity. Agent Runs remain context-isolated but permission-shared.
