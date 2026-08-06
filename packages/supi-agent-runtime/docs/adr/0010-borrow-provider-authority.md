# Borrow provider authority through a public PI adapter

The Agent Run must use the containing session's effective provider authority. A fresh PI `ModelRuntime` loses runtime API keys, OAuth state, model-specific headers, environment values, and extension-registered provider implementations.

PI 0.83 does not expose the containing `ModelRuntime` through `ExtensionContext`. We therefore do not wait for an upstream API, use a private cast, or share the mutable parent runtime.

`AgentSessionInputs` requires a narrow caller-owned `AgentRunProviderAuthority` with the public provider and authentication operations. `createAgentRunProviderAuthority()` adapts the containing `ModelRegistry`. The runtime creates a private child `ModelRuntime` with network refresh disabled and registers one native provider adapter. The adapter:

- delegates the current provider implementation and model stream methods;
- resolves provider authentication on every request;
- combines model-specific request key, headers, and environment when PI exposes them;
- preserves provider-owned OAuth refresh, runtime credentials, base URLs, and custom streams;
- keeps child provider registration local to the Agent Run.

The child runtime uses in-memory credential and model stores, so it cannot discover ambient parent credentials or model configuration. The caller passes authority at execution time. Prepared plans store model identity, never authority or credential state. Resources, extensions, tools, and settings remain caller-owned policy and are not inherited from the containing session.

This is an exact behavioral borrow, not a shared `ModelRuntime` identity. Agent Runs remain context-isolated but permission-shared.
