import {
  BorderedLoader,
  type ExtensionCommandContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { Container, Key, matchesKey, Spacer, Text } from "@earendil-works/pi-tui";

/** Options for `withCancellableLoader()`. */
export interface CancellableLoaderOptions {
  /**
   * Close the loader at once on Escape. Use it only when the operation needs no cleanup;
   * otherwise the loader stays open until the operation settles after its signal aborts.
   */
  readonly finishOnAbort?: boolean;
  /** Open the shared run viewer on Ctrl+O without stopping the operation. */
  readonly openAgents?: () => Promise<void>;
  /** Notification shown when the operation rejects without an `Error` message. */
  readonly failureMessage?: string;
}

/** Loader that forwards Escape to Pi's BorderedLoader and opens `/agents` on Ctrl+O. */
class AgentRunLoader extends Container {
  readonly #loader: BorderedLoader;
  readonly #openAgents: () => Promise<void>;
  readonly #onOpenError: (error: unknown) => void;
  #openingAgents = false;

  constructor(
    loader: BorderedLoader,
    theme: Theme,
    openAgents: () => Promise<void>,
    onOpenError: (error: unknown) => void,
  ) {
    super();
    this.#loader = loader;
    this.#openAgents = openAgents;
    this.#onOpenError = onOpenError;
    this.addChild(loader);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Ctrl+O opens /agents"), 1, 0));
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl("o"))) {
      if (this.#openingAgents) return;
      this.#openingAgents = true;
      void this.#openAgents()
        .catch(this.#onOpenError)
        .finally(() => {
          this.#openingAgents = false;
        });
      return;
    }
    this.#loader.handleInput(data);
  }

  dispose(): void {
    this.#loader.dispose();
  }
}

/**
 * Run command-owned work behind an Escape-cancellable Pi loader in the TUI.
 *
 * Escape aborts the signal passed to `operation`. The result is `undefined` when the
 * operation rejects (the user is notified) or when `finishOnAbort` closes the loader early.
 */
export function withCancellableLoader<T>(
  ctx: ExtensionCommandContext,
  message: string,
  operation: (signal: AbortSignal) => Promise<T>,
  options: CancellableLoaderOptions = {},
): Promise<T | undefined> {
  return ctx.ui.custom<T | undefined>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(tui, theme, message);
    const component = options.openAgents
      ? new AgentRunLoader(loader, theme, options.openAgents, (error) =>
          ctx.ui.notify(
            error instanceof Error ? error.message : "Could not open /agents.",
            "error",
          ),
        )
      : loader;
    let settled = false;
    const finish = (value: T | undefined) => {
      if (settled) return;
      settled = true;
      done(value);
    };
    loader.onAbort = () => {
      if (options.finishOnAbort) finish(undefined);
    };
    void operation(loader.signal).then(
      (value) => finish(value),
      (error) => {
        ctx.ui.notify(
          error instanceof Error ? error.message : (options.failureMessage ?? "Operation failed."),
          "error",
        );
        finish(undefined);
      },
    );
    return component;
  });
}
