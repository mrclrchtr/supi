import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { discoverProfileCatalogue } from "./profile-catalogue.ts";
import { resolveAgentDirectory } from "./resources.ts";
import type { ProfileCatalogue } from "./types.ts";

/** Session-local immutable Profile Catalogue owner. */
export class AgentProfileCatalogueStore {
  #catalogue: ProfileCatalogue | undefined;

  /** Resolve and replace the snapshot for a PI session start or reload. */
  async reload(options: {
    readonly cwd: string;
    readonly projectTrusted: boolean;
    readonly agentDir?: string;
  }): Promise<ProfileCatalogue> {
    const catalogue = await discoverProfileCatalogue({
      cwd: options.cwd,
      agentDir: options.agentDir ?? resolveAgentDirectory(),
      projectTrusted: options.projectTrusted,
    });
    this.#catalogue = catalogue;
    for (const diagnostic of catalogue.diagnostics) {
      recordDebugEvent({
        source: "supi-agent",
        level: "warning",
        category: "profile",
        message: `Profile configuration is unavailable: ${diagnostic.message}`,
        cwd: options.cwd,
        data: {
          profileId: diagnostic.profileId,
          source: diagnostic.source,
          code: diagnostic.code,
        },
      });
    }
    return catalogue;
  }

  /** Return the current immutable catalogue, if session_start has run. */
  get(): ProfileCatalogue | undefined {
    return this.#catalogue;
  }

  /** Clear session state on PI shutdown or extension replacement. */
  clear(): void {
    this.#catalogue = undefined;
  }
}

/** Shared catalogue store used by the extension's later delegation adapters. */
export const agentProfileCatalogueStore = new AgentProfileCatalogueStore();
