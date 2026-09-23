import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  registerSessionCapabilitySkillProvider,
  sessionCapabilityState,
} from "@mrclrchtr/supi-core/session";
import { registerSettings, type SettingsModule } from "@mrclrchtr/supi-core/settings";
import { applyPromptOverrides, notifyInvocationConfigWarnings } from "./skill-model-invocation.ts";
import { SkillSettingsController, type SkillSettingsOptions } from "./skill-settings-controller.ts";

const SETTINGS_SECTION_ID = "skills";
type SkillControllerGetter = (
  cwd: string,
  projectTrusted: boolean,
) => Promise<SkillSettingsController>;

function createSkillControllerGetter(options: SkillSettingsOptions): SkillControllerGetter {
  let controllerKey: string | undefined;
  let controllerPromise: Promise<SkillSettingsController> | undefined;
  return (cwd, projectTrusted) => {
    const key = `${cwd}\0${projectTrusted}`;
    if (!controllerPromise || controllerKey !== key) {
      controllerKey = key;
      controllerPromise = SkillSettingsController.create(cwd, projectTrusted, options);
    }
    return controllerPromise;
  };
}

function createSkillSettingsModule(
  options: SkillSettingsOptions,
  getController: SkillControllerGetter,
): SettingsModule {
  return {
    id: SETTINGS_SECTION_ID,
    label: "Skills",
    read: async (context) => {
      if (context.ctx) notifyInvocationConfigWarnings(context.ctx, options.homeDir);
      const projectTrusted = context.ctx?.isProjectTrusted() ?? false;
      return {
        rows: (await getController(context.cwd, projectTrusted)).read(context.scope, context.ctx),
      };
    },
    apply: async (request) => {
      const projectTrusted = request.ctx?.isProjectTrusted() ?? false;
      return (await getController(request.cwd, projectTrusted)).apply(
        request.scope,
        request.fieldKey,
        request.action,
        request.ctx,
      );
    },
  };
}

/** Register scoped skill availability settings and prompt overrides. */
export default function skillSettings(pi: ExtensionAPI, options: SkillSettingsOptions = {}): void {
  const getController = createSkillControllerGetter(options);
  const providerDisposers = new Map<string, () => void>();
  registerSettings(pi, createSkillSettingsModule(options, getController));

  pi.on("session_start", (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    providerDisposers.get(sessionId)?.();
    const dispose = registerSessionCapabilitySkillProvider<ExtensionCommandContext>(sessionId, {
      listEligibleSkills: async (commandCtx) => {
        const controller = await getController(commandCtx.cwd, commandCtx.isProjectTrusted());
        return controller.eligibleModelSkills(commandCtx);
      },
    });
    providerDisposers.set(sessionId, dispose);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    providerDisposers.get(sessionId)?.();
    providerDisposers.delete(sessionId);
  });

  pi.on("before_agent_start", (event, ctx) => {
    notifyInvocationConfigWarnings(ctx, options.homeDir);
    const state = sessionCapabilityState.get(ctx.sessionManager.getSessionId());
    const systemPrompt = applyPromptOverrides({
      options: event.systemPromptOptions,
      systemPrompt: event.systemPrompt,
      cwd: ctx.cwd,
      projectTrusted: ctx.isProjectTrusted(),
      homeDir: options.homeDir,
      hiddenSkillNames: new Set(state?.hiddenSkillNames ?? []),
    });
    return systemPrompt === undefined ? undefined : { systemPrompt };
  });
}
