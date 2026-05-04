// Shared rendering context for the rich overlay questionnaire UI.
// Bundles the common parameters so individual helpers stay within param limits.

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Editor } from "@mariozechner/pi-tui";
import type { QuestionnaireFlow } from "../flow.ts";
import type { OverlayRenderState } from "./ui-rich-render-types.ts";

export interface RenderEnv {
  width: number;
  theme: Theme;
  flow: QuestionnaireFlow;
  state: OverlayRenderState;
  editor: Editor;
}
