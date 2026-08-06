import type { Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import type {
  AgentRunProviderAuthority,
  AgentSessionInputs,
} from "@mrclrchtr/supi-agent-runtime/api";

/** Maximum effective Profile IDs exposed to a session's model-facing catalogue. */
export const MAX_PROFILE_COUNT = 32;
/** Maximum Profile ID length. */
export const MAX_PROFILE_ID_LENGTH = 64;
/** Maximum profile description length. */
export const MAX_PROFILE_DESCRIPTION_LENGTH = 200;
/** Maximum custom SYSTEM.md length. */
export const MAX_CUSTOM_SYSTEM_PROMPT_CHARS = 32_000;
/** Maximum canonical profile model reference length. */
export const MAX_PROFILE_MODEL_REFERENCE_CHARS = 256;
/** Maximum diagnostic message length. */
export const MAX_PROFILE_DIAGNOSTIC_CHARS = 240;

/** Profile source precedence, from weakest to strongest. */
export type ProfileSource = "package" | "global" | "project";

/** Explicit instruction-file scopes selectable by a profile. */
export type AgentInstructionScope = "global" | "project";

/** Package prompt selectors supported by the profile manifest. */
export type PackagePromptId = "supi:explore" | "supi:general";

/** Complete base-prompt selector from profile.json. */
export type AgentSystemPrompt = "native" | "custom" | PackagePromptId;

/** Fixed child capability names accepted by profile.json. */
export type AgentCapabilityId =
  | "read"
  | "bash"
  | "edit"
  | "write"
  | "code_resolve"
  | "code_inspect"
  | "code_orientation"
  | "code_graph"
  | "code_find"
  | "code_health";

/** Values accepted by PI's model thinking policy. */
export type AgentThinkingLevel = ModelThinkingLevel;

/** Closed profile.json manifest after validation. */
export interface AgentProfileManifest {
  /** Human-facing description, non-empty and capped at 200 characters. */
  readonly description: string;
  /** Fixed child capability IDs; an empty list is valid. */
  readonly tools: readonly AgentCapabilityId[];
  /** One complete native, package-owned, or custom system-prompt source. */
  readonly systemPrompt: AgentSystemPrompt;
  /** Explicit global/project AGENTS.md or CLAUDE.md scopes; no implicit scopes are added. */
  readonly instructionScopes: readonly AgentInstructionScope[];
  /** Optional canonical provider/model-id; omitted values inherit the containing model. */
  readonly model?: string;
  /** Optional PI thinking level; omitted values inherit the containing session level. */
  readonly thinking?: AgentThinkingLevel;
  /** Optional host timeout in minutes, from 1 through 240. */
  readonly timeoutMinutes?: number;
}

/** One valid effective Profile Directory. */
export interface AgentProfile {
  readonly id: string;
  readonly source: ProfileSource;
  /** Absolute source directory; human diagnostics may use it, model guidance must not. */
  readonly directory: string;
  readonly manifest: AgentProfileManifest;
  readonly customSystemPrompt?: string;
}

/** Bounded configuration diagnostic for one unavailable profile. */
export interface ProfileDiagnostic {
  readonly profileId: string;
  readonly source: ProfileSource;
  readonly code:
    | "invalid-profile-id"
    | "invalid-manifest"
    | "missing-profile-manifest"
    | "invalid-prompt"
    | "model-unavailable"
    | "model-unauthenticated"
    | "model-out-of-scope"
    | "catalogue-overflow";
  readonly message: string;
}

/** Immutable effective catalogue snapshot. */
export interface ProfileCatalogue {
  /** Valid profiles inside the bounded catalogue. */
  readonly profiles: readonly AgentProfile[];
  /** Bounded invalid/overflow diagnostics for the visible catalogue snapshot. */
  readonly diagnostics: readonly ProfileDiagnostic[];
  /** Sorted IDs considered for this snapshot, capped at MAX_PROFILE_COUNT. */
  readonly profileIds: readonly string[];
  /** Number of additional effective IDs omitted by the catalogue cap. */
  readonly omittedProfileCount: number;
}

/** Parent model context needed to resolve a profile's effective execution policy. */
export interface AgentModelContext {
  readonly providerAuthority: AgentRunProviderAuthority;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is PI's canonical type
  readonly currentModel: Model<any> | undefined;
  readonly currentThinkingLevel: AgentThinkingLevel | undefined;
  readonly scopedModels: readonly {
    // biome-ignore lint/suspicious/noExplicitAny: Model<any> is PI's canonical type
    readonly model: Model<any>;
    readonly thinkingLevel?: AgentThinkingLevel;
  }[];
  readonly modelRegistry: {
    // biome-ignore lint/suspicious/noExplicitAny: Model<any> is PI's canonical type
    find(provider: string, modelId: string): Model<any> | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: Model<any> is PI's canonical type
    hasConfiguredAuth(model: Model<any>): boolean;
  };
}

/** Effective model and runtime inputs for one selected Agent Profile. */
export interface ResolvedAgentProfile {
  readonly profile: AgentProfile;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is PI's canonical type
  readonly model: Model<any>;
  readonly thinkingLevel: AgentThinkingLevel;
  readonly timeoutMs?: number;
  readonly inputs: AgentSessionInputs;
}

/** Options for compiling a profile into in-memory Agent Session Inputs. */
export interface AgentSessionInputOptions {
  readonly cwd: string;
  readonly agentDir: string;
  readonly projectTrusted: boolean;
  readonly providerAuthority: AgentRunProviderAuthority;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is PI's canonical type
  readonly model: Model<any>;
  readonly thinkingLevel: AgentThinkingLevel;
  readonly profile: AgentProfile;
}
