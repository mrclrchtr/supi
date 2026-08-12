import {
  type Api,
  type AuthResult,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  lazyStream,
  type Model,
  type Provider,
  type ProviderHeaders,
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
  | { ok: true; apiKey?: string; headers?: ProviderHeaders; env?: Record<string, string> }
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

/** Private model runtime plus its authorized active-model selector. */
export interface CreatedAgentRunModelRuntime {
  runtime: ModelRuntime;
  selectModel(model: Model<Api>): boolean;
}

/** Create a private model runtime that delegates only authorized models to borrowed authority. */
export async function createAgentRunModelRuntime(
  authority: AgentRunProviderAuthority,
  models: readonly Model<Api>[],
): Promise<CreatedAgentRunModelRuntime> {
  const configuredModels = uniqueModels(models);
  const originalModel = configuredModels[0];
  if (!originalModel) throw new Error("An Agent Run needs one authorized model");
  if (!authority.getProvider(originalModel.provider)) {
    throw new Error(`Provider is unavailable: ${originalModel.provider}`);
  }
  const authorizedModels = configuredModels.filter(
    (model, index) => index === 0 || authority.getProvider(model.provider) !== undefined,
  );

  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  let activeModel = originalModel;
  const authorizedProviders = new Set(authorizedModels.map((model) => model.provider));
  for (const builtin of runtime.getProviders()) {
    if (!authorizedProviders.has(builtin.id)) {
      runtime.registerNativeProvider(createUnavailableProvider(builtin));
    }
  }
  for (const providerId of authorizedProviders) {
    runtime.registerNativeProvider(
      createBorrowedProvider(
        authority,
        providerId,
        authorizedModels.filter((model) => model.provider === providerId),
        () => activeModel,
      ),
    );
  }
  await runtime.refresh({ allowNetwork: false });
  return {
    runtime,
    selectModel(model) {
      const selected = authorizedModels.find(
        (candidate) => candidate.provider === model.provider && candidate.id === model.id,
      );
      if (!selected) return false;
      activeModel = selected;
      return true;
    },
  };
}

function createBorrowedProvider(
  authority: AgentRunProviderAuthority,
  providerId: string,
  models: readonly Model<Api>[],
  getActiveModel: () => Model<Api>,
): Provider {
  const provider = requireProvider(authority, providerId);
  return {
    id: provider.id,
    name: provider.name,
    get baseUrl() {
      return authority.getProvider(providerId)?.baseUrl;
    },
    get headers() {
      const headers = authority.getProvider(providerId)?.headers;
      return headers ? { ...headers } : undefined;
    },
    auth: {
      apiKey: {
        name: `${provider.name} borrowed authority`,
        resolve: async () => {
          const auth = await authority.getProviderAuth(providerId);
          const activeModel = getActiveModel();
          const requestAuth =
            activeModel.provider === providerId
              ? await authority.getApiKeyAndHeaders?.(activeModel)
              : undefined;
          if (requestAuth && !requestAuth.ok) throw new Error(requestAuth.error);
          if (!auth && !requestAuth?.ok) return undefined;
          return mergeRequestAuth(auth, requestAuth);
        },
      },
    },
    getModels: () => [...models],
    stream: (childModel, context, options) =>
      lazyStream(childModel, async () => {
        const currentProvider = requireProvider(authority, providerId);
        const authorizedModel = requireAuthorizedModel(models, childModel);
        return currentProvider.stream(
          resolveParentModel(currentProvider, childModel, authorizedModel),
          context,
          options,
        );
      }),
    streamSimple: (childModel, context, options) =>
      lazyStream(childModel, async () => {
        const currentProvider = requireProvider(authority, providerId);
        const authorizedModel = requireAuthorizedModel(models, childModel);
        return currentProvider.streamSimple(
          resolveParentModel(currentProvider, childModel, authorizedModel),
          context,
          options,
        );
      }),
  };
}

function uniqueModels(models: readonly Model<Api>[]): Model<Api>[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    const id = `${model.provider}/${model.id}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function requireAuthorizedModel(models: readonly Model<Api>[], requested: Model<Api>): Model<Api> {
  const model = models.find(
    (candidate) => candidate.provider === requested.provider && candidate.id === requested.id,
  );
  if (!model)
    throw new Error(
      `Model is not authorized for this Agent Run: ${requested.provider}/${requested.id}`,
    );
  return model;
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
