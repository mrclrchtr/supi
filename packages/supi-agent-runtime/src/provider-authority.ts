import {
  type Api,
  type AssistantImages,
  type AuthResult,
  type ClassifierApi,
  type ClassifierContext,
  type ClassifierModel,
  type ClassifierResult,
  type ImageApi,
  type ImageModel,
  type ImagesContext,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  lazyStream,
  type Model,
  type ModelsClassifierOptions,
  type ModelsImagesOptions,
  type Provider,
  type ProviderHeaders,
} from "@earendil-works/pi-ai";
import { type ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { type AgentRunAuxiliaryModelSnapshot, freezeAuxiliaryModels } from "./auxiliary-models.ts";

/** Provider and authentication authority borrowed from the containing PI session. */
export interface AgentRunProviderAuthority {
  /** Return the current implementation for one provider. */
  getProvider(providerId: string): Provider | undefined;
  /** Resolve current provider authentication, including runtime credentials and OAuth refresh. */
  getProviderAuth(providerId: string): Promise<AuthResult | undefined>;
  /** Resolve model-specific request auth when PI exposes it. */
  getApiKeyAndHeaders?: (model: Model<Api>) => Promise<AgentRunRequestAuth>;
  /** Return the currently available auxiliary models for a caller-owned invocation snapshot. */
  getAvailableAuxiliaryModels?: () => Promise<AgentRunAuxiliaryModelSnapshot>;
  /** Dispatch one classifier request through the containing provider authority. */
  classify?: (
    model: ClassifierModel<ClassifierApi>,
    context: ClassifierContext,
    options?: ModelsClassifierOptions,
  ) => Promise<ClassifierResult>;
  /** Dispatch one image-generation request through the containing provider authority. */
  generateImages?: (
    model: ImageModel<ImageApi>,
    context: ImagesContext,
    options?: ModelsImagesOptions,
  ) => Promise<AssistantImages>;
}

/** Model-specific request auth returned by PI's compatibility registry facade. */
export type AgentRunRequestAuth =
  | {
      ok: true;
      apiKey?: string;
      headers?: ProviderHeaders;
      baseUrl?: string;
      env?: Record<string, string>;
    }
  | { ok: false; error: string };

type AgentRunModelRegistry = Pick<
  ModelRegistry,
  "getProvider" | "getProviderAuth" | "getApiKeyAndHeaders"
> &
  Partial<Pick<ModelRegistry, "getAvailableOfType" | "classify" | "generateImages">>;

/** Adapt PI's public model registry to the narrow Agent Run authority interface. */
export function createAgentRunProviderAuthority(
  registry: AgentRunModelRegistry,
): AgentRunProviderAuthority {
  const classify = registry.classify?.bind(registry);
  const generateImages = registry.generateImages?.bind(registry);
  return {
    getProvider: (providerId) => registry.getProvider(providerId),
    getProviderAuth: (providerId) => registry.getProviderAuth(providerId),
    getApiKeyAndHeaders: (model) => registry.getApiKeyAndHeaders(model),
    getAvailableAuxiliaryModels: async () => {
      const [classifiers, images] = registry.getAvailableOfType
        ? await Promise.all([
            registry.getAvailableOfType("classifier"),
            registry.getAvailableOfType("image"),
          ])
        : [[], []];
      return freezeAuxiliaryModels({ classifiers, images });
    },
    ...(classify ? { classify } : {}),
    ...(generateImages ? { generateImages } : {}),
  };
}

/** Private model runtime plus its authorized model-selection predicate. */
export interface CreatedAgentRunModelRuntime {
  runtime: ModelRuntime;
  selectModel(model: Model<Api>): boolean;
}

/** Create a private model runtime that delegates only authorized models to borrowed authority. */
export async function createAgentRunModelRuntime(
  authority: AgentRunProviderAuthority,
  models: readonly Model<Api>[],
  auxiliaryModels: AgentRunAuxiliaryModelSnapshot = { classifiers: [], images: [] },
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
  const authorizedAuxiliaryModels = freezeAuxiliaryModels(auxiliaryModels);

  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  const requestedProviderIds = new Set([
    ...authorizedModels.map((model) => model.provider),
    ...authorizedAuxiliaryModels.classifiers.map((model) => model.provider),
    ...authorizedAuxiliaryModels.images.map((model) => model.provider),
  ]);
  const registeredProviderIds = new Set<string>();
  for (const providerId of requestedProviderIds) {
    const provider = authority.getProvider(providerId);
    if (!provider) continue;
    registeredProviderIds.add(providerId);
    runtime.registerNativeProvider(
      createBorrowedProvider({
        authority,
        providerId,
        provider,
        models: authorizedModels.filter((model) => model.provider === providerId),
        classifiers: authorizedAuxiliaryModels.classifiers.filter(
          (model) => model.provider === providerId,
        ),
        images: authorizedAuxiliaryModels.images.filter((model) => model.provider === providerId),
      }),
    );
  }
  for (const builtin of runtime.getProviders()) {
    if (!registeredProviderIds.has(builtin.id)) {
      runtime.registerNativeProvider(createUnavailableProvider(builtin));
    }
  }
  await runtime.refresh({ allowNetwork: false });
  return {
    runtime,
    selectModel(model) {
      return authorizedModels.some(
        (candidate) => candidate.provider === model.provider && candidate.id === model.id,
      );
    },
  };
}

interface BorrowedProviderOptions {
  authority: AgentRunProviderAuthority;
  providerId: string;
  provider: Provider;
  models: readonly Model<Api>[];
  classifiers: readonly ClassifierModel<ClassifierApi>[];
  images: readonly ImageModel<ImageApi>[];
}

function createBorrowedProvider({
  authority,
  providerId,
  provider,
  models,
  classifiers,
  images,
}: BorrowedProviderOptions): Provider {
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
          const providerAuth = await authority.getProviderAuth(providerId);
          if (providerAuth || !authority.getApiKeyAndHeaders) return providerAuth;
          // ModelRuntime gates chat requests at provider scope; real credentials stay in the exact-model wrapper.
          return { auth: {} };
        },
      },
    },
    getModels: () => [...models],
    getAllModels: () => [...models, ...classifiers, ...images],
    stream: (childModel, context, options) =>
      lazyStream(childModel, async () => {
        const currentProvider = requireProvider(authority, providerId);
        const authorizedModel = requireAuthorizedModel(models, childModel);
        const requestAuth = await resolveRequestAuth(authority, authorizedModel);
        const requestModel = resolveParentModel(
          currentProvider,
          applyRequestBaseUrl(childModel, requestAuth),
          authorizedModel,
        );
        return currentProvider.stream(
          requestModel,
          context,
          applyRequestAuth(options, requestAuth),
        );
      }),
    streamSimple: (childModel, context, options) =>
      lazyStream(childModel, async () => {
        const currentProvider = requireProvider(authority, providerId);
        const authorizedModel = requireAuthorizedModel(models, childModel);
        const requestAuth = await resolveRequestAuth(authority, authorizedModel);
        const requestModel = resolveParentModel(
          currentProvider,
          applyRequestBaseUrl(childModel, requestAuth),
          authorizedModel,
        );
        return currentProvider.streamSimple(
          requestModel,
          context,
          applyRequestAuth(options, requestAuth),
        );
      }),
    ...(authority.classify && classifiers.length > 0
      ? {
          classify: (model, context, options) => {
            // Child auth may contain the active chat model's credentials; only forward cancellation.
            return authority.classify?.(
              requireAuthorizedModel(classifiers, model),
              context,
              options?.signal ? { signal: options.signal } : undefined,
            ) as Promise<ClassifierResult>;
          },
        }
      : {}),
    ...(authority.generateImages && images.length > 0
      ? {
          generateImages: (model, context, options) => {
            // Resolve image credentials against the authorized image model in the parent registry.
            return authority.generateImages?.(
              requireAuthorizedModel(images, model),
              context,
              options?.signal ? { signal: options.signal } : undefined,
            ) as Promise<AssistantImages>;
          },
        }
      : {}),
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

function requireAuthorizedModel<TModel extends { provider: string; id: string }>(
  models: readonly TModel[],
  requested: { provider: string; id: string },
): TModel {
  const model = models.find(
    (candidate) => candidate.provider === requested.provider && candidate.id === requested.id,
  );
  if (!model) {
    throw new Error(
      `Model is not authorized for this Agent Run: ${requested.provider}/${requested.id}`,
    );
  }
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
  let parentModel = fallback;
  try {
    parentModel =
      provider.getModels().find((candidate) => candidate.id === childModel.id) ?? fallback;
  } catch {
    // Keep the authorized fallback when the parent catalog is unavailable.
  }
  // ModelRuntime may resolve a credential-specific endpoint onto childModel.
  return parentModel.baseUrl === childModel.baseUrl
    ? parentModel
    : { ...parentModel, baseUrl: childModel.baseUrl };
}

async function resolveRequestAuth(
  authority: AgentRunProviderAuthority,
  model: Model<Api>,
): Promise<Extract<AgentRunRequestAuth, { ok: true }> | undefined> {
  const requestAuth = await authority.getApiKeyAndHeaders?.(model);
  if (requestAuth && !requestAuth.ok) throw new Error(requestAuth.error);
  return requestAuth?.ok ? requestAuth : undefined;
}

function applyRequestBaseUrl<TModel extends { baseUrl: string }>(
  model: TModel,
  requestAuth: Extract<AgentRunRequestAuth, { ok: true }> | undefined,
): TModel {
  return requestAuth?.baseUrl ? { ...model, baseUrl: requestAuth.baseUrl } : model;
}

function applyRequestAuth<
  TOptions extends {
    apiKey?: string;
    headers?: ProviderHeaders;
    env?: Record<string, string>;
  },
>(
  options: TOptions | undefined,
  requestAuth: Extract<AgentRunRequestAuth, { ok: true }> | undefined,
): TOptions | undefined {
  if (!requestAuth) return options;
  return {
    ...options,
    ...(requestAuth.apiKey ? { apiKey: requestAuth.apiKey } : {}),
    ...(options?.headers || requestAuth.headers
      ? { headers: { ...(options?.headers ?? {}), ...(requestAuth.headers ?? {}) } }
      : {}),
    ...(options?.env || requestAuth.env
      ? { env: { ...(options?.env ?? {}), ...(requestAuth.env ?? {}) } }
      : {}),
  } as TOptions;
}
