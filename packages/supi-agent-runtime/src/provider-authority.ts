import {
  type Api,
  type AuthResult,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type Model,
  type Provider,
} from "@earendil-works/pi-ai";
import { type ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";

/** Provider and authentication authority borrowed from the containing PI session. */
export interface AgentRunProviderAuthority {
  /** Return the current implementation for one provider. */
  getProvider(providerId: string): Provider | undefined;
  /** Resolve current provider authentication, including runtime credentials and OAuth refresh. */
  getProviderAuth(providerId: string): Promise<AuthResult | undefined>;
  /** Resolve model-specific headers, environment, and request API key when PI exposes them. */
  getApiKeyAndHeaders?: (model: Model<Api>) => Promise<AgentRunRequestAuth>;
}

/** Model-specific request auth returned by PI's compatibility registry facade. */
export type AgentRunRequestAuth =
  | { ok: true; apiKey?: string; headers?: Record<string, string>; env?: Record<string, string> }
  | { ok: false; error: string };

/** Adapt PI's public model registry to the narrow Agent Run authority interface. */
export function createAgentRunProviderAuthority(
  registry: Pick<ModelRegistry, "getProvider" | "getProviderAuth" | "getApiKeyAndHeaders">,
): AgentRunProviderAuthority {
  return {
    getProvider: (providerId) => registry.getProvider(providerId),
    getProviderAuth: (providerId) => registry.getProviderAuth(providerId),
    getApiKeyAndHeaders: (model) => registry.getApiKeyAndHeaders(model),
  };
}

/** Create a private model runtime that delegates one provider to borrowed authority. */
export async function createAgentRunModelRuntime(
  authority: AgentRunProviderAuthority,
  model: Model<Api>,
): Promise<ModelRuntime> {
  const provider = authority.getProvider(model.provider);
  if (!provider) throw new Error(`Provider is unavailable: ${model.provider}`);

  const borrowedProvider: Provider = {
    id: provider.id,
    name: provider.name,
    get baseUrl() {
      return authority.getProvider(model.provider)?.baseUrl;
    },
    get headers() {
      const headers = authority.getProvider(model.provider)?.headers;
      return headers ? { ...headers } : undefined;
    },
    auth: {
      apiKey: {
        name: `${provider.name} borrowed authority`,
        resolve: async () => {
          const auth = await authority.getProviderAuth(model.provider);
          const requestAuth = await authority.getApiKeyAndHeaders?.(model);
          if (requestAuth && !requestAuth.ok) throw new Error(requestAuth.error);
          if (!auth && !requestAuth?.ok) return undefined;
          return mergeRequestAuth(auth, requestAuth);
        },
      },
    },
    getModels: () => {
      const currentProvider = authority.getProvider(model.provider);
      if (!currentProvider) return [];
      try {
        return currentProvider.getModels().filter((candidate) => candidate.id === model.id);
      } catch {
        return [];
      }
    },
    stream: (childModel, context, options) => {
      const currentProvider = requireProvider(authority, model.provider);
      return currentProvider.stream(
        resolveParentModel(currentProvider, childModel, model),
        context,
        options,
      );
    },
    streamSimple: (childModel, context, options) => {
      const currentProvider = requireProvider(authority, model.provider);
      return currentProvider.streamSimple(
        resolveParentModel(currentProvider, childModel, model),
        context,
        options,
      );
    },
  };

  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  for (const builtin of runtime.getProviders()) {
    if (builtin.id !== model.provider)
      runtime.registerNativeProvider(createUnavailableProvider(builtin));
  }
  runtime.registerNativeProvider(borrowedProvider);
  await runtime.refresh({ allowNetwork: false });
  return runtime;
}

function createUnavailableProvider(provider: Provider): Provider {
  return {
    id: provider.id,
    name: `${provider.name} unavailable to this Agent Run`,
    auth: {
      apiKey: {
        name: "Unavailable provider",
        resolve: async () => undefined,
      },
    },
    getModels: () => [],
    stream: () => {
      throw new Error(`Provider is unavailable to this Agent Run: ${provider.id}`);
    },
    streamSimple: () => {
      throw new Error(`Provider is unavailable to this Agent Run: ${provider.id}`);
    },
  };
}

function requireProvider(authority: AgentRunProviderAuthority, providerId: string): Provider {
  const provider = authority.getProvider(providerId);
  if (!provider) throw new Error(`Provider is unavailable: ${providerId}`);
  return provider;
}

function resolveParentModel(
  provider: Provider,
  childModel: Model<Api>,
  fallback: Model<Api>,
): Model<Api> {
  try {
    return provider.getModels().find((candidate) => candidate.id === childModel.id) ?? fallback;
  } catch {
    return fallback;
  }
}

function mergeRequestAuth(
  providerAuth: AuthResult | undefined,
  requestAuth: AgentRunRequestAuth | undefined,
): AuthResult {
  const auth = providerAuth?.auth;
  const resolved = requestAuth?.ok ? requestAuth : undefined;
  return {
    ...(providerAuth?.source ? { source: providerAuth.source } : {}),
    ...(providerAuth?.env || resolved?.env
      ? { env: { ...(providerAuth?.env ?? {}), ...(resolved?.env ?? {}) } }
      : {}),
    auth: {
      ...(auth ?? {}),
      ...(resolved?.apiKey ? { apiKey: resolved.apiKey } : {}),
      ...(auth?.headers || resolved?.headers
        ? { headers: { ...(auth?.headers ?? {}), ...(resolved?.headers ?? {}) } }
        : {}),
    },
  };
}
