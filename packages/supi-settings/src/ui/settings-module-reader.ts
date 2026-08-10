import type {
  SettingsContext,
  SettingsModule,
  SettingsSnapshot,
} from "@mrclrchtr/supi-core/settings";

export interface LoadedSettingsModule {
  module: SettingsModule;
  snapshot: SettingsSnapshot;
}

export interface SettingsReadResult {
  loaded: LoadedSettingsModule[];
  errors: string[];
}

/** Read independent settings modules without hiding successful modules when one fails. */
export async function readSettingsModules(
  modules: SettingsModule[],
  context: SettingsContext,
): Promise<SettingsReadResult> {
  const results = await Promise.all(
    modules.map(async (module) => {
      try {
        return { loaded: { module, snapshot: await module.read(context) } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { error: `${module.label}: ${message}` };
      }
    }),
  );
  return {
    loaded: results.flatMap((result) => (result.loaded ? [result.loaded] : [])),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };
}
