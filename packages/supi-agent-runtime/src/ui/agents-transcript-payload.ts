import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  Text,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";

/** Format a transcript value without failing the viewer on cyclic data. */
export function formatTranscriptValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "(empty)";
  } catch {
    return "(message could not be rendered)";
  }
}

/** Hide raw tool input and output until the user opens the disclosure. */
export class RawToolPayload implements Component {
  #expanded = false;
  #lines: string;

  constructor(
    payload: { input?: unknown; result?: unknown },
    private readonly theme: Theme,
  ) {
    this.#lines = formatTranscriptValue(payload);
  }

  invalidate(): void {}

  update(payload: { input?: unknown; result?: unknown }): void {
    this.#lines = formatTranscriptValue(payload);
  }

  setExpanded(expanded: boolean): void {
    this.#expanded = expanded;
  }

  toggle(): void {
    this.#expanded = !this.#expanded;
  }

  render(width: number): string[] {
    if (!this.#expanded) {
      return [this.theme.fg("dim", "  Raw tool input/result hidden · click or press e to expand")];
    }
    const container = new Container();
    container.addChild(new Text(this.theme.fg("muted", "  Raw tool input/result"), 0, 0));
    container.addChild(new Text(this.#lines, 1, 0));
    return container.render(width);
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click" || event.button !== "left") return undefined;
    this.toggle();
    return { handled: true };
  }
}
