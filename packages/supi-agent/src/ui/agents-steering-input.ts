import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Focusable, Input } from "@earendil-works/pi-tui";

/** Callbacks for the embedded Agent Run steering input. */
export interface AgentsSteeringInputCallbacks {
  readonly onSubmit: (message: string) => void;
  readonly onEmpty: () => void;
  readonly onCancel: () => void;
}

/** TUI input for one selected Agent Run steering request. */
export class AgentsSteeringInput implements Focusable {
  readonly taskId: string;
  readonly #input: Input;

  constructor(taskId: string, theme: Theme, callbacks: AgentsSteeringInputCallbacks) {
    this.taskId = taskId;
    this.#input = new Input({
      placeholder: "Steering message",
      placeholderStyle: (text) => theme.fg("dim", text),
    });
    this.#input.onSubmit = (value) => {
      const message = value.trim();
      if (message) callbacks.onSubmit(message);
      else callbacks.onEmpty();
    };
    this.#input.onEscape = callbacks.onCancel;
  }

  /** Whether PI should show the hardware cursor in this input. */
  get focused(): boolean {
    return this.#input.focused;
  }

  set focused(value: boolean) {
    this.#input.focused = value;
  }

  handleInput(data: string): void {
    this.#input.handleInput(data);
  }

  render(width: number): string[] {
    return [`Steer ${this.taskId}`, ...this.#input.render(Math.max(1, width))];
  }

  invalidate(): void {
    this.#input.invalidate();
  }
}
