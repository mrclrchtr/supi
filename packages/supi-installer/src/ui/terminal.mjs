import { emitKeypressEvents } from "node:readline";
import { getPlan } from "../matrix.mjs";
import { handleKey, restoreTerminal, screenMode } from "./controls.mjs";
import { renderView } from "./view.mjs";

/** Own raw mode and screen state only while editing. Confirmation returns a plan; it never executes commands. @param {import('../matrix.mjs').Matrix} matrix @param {{input: NodeJS.ReadStream, output: NodeJS.WriteStream, signal?: AbortSignal}} options @returns {Promise<import('../types.ts').Operation[] | null>} */
export function runTerminal(matrix, { input, output, signal }) {
  return new Promise((resolve, reject) => {
    /** @type {import('./view.mjs').View} */
    const view = {
      matrix,
      index: 0,
      scope: "project",
      review: false,
      offset: 0,
      // hasColors() honors NO_COLOR, FORCE_COLOR, and TERM.
      color: typeof output.hasColors === "function" && output.hasColors(),
    };
    const wasRaw = Boolean(input.isRaw);
    const wasFlowing = input.readableFlowing;
    let settled = false;
    const keyState = { pasting: false, width: 80, height: 24 };
    const size = () => ({ width: output.columns ?? 80, height: output.rows ?? 24 });
    const draw = () => {
      output.write(`\u001b[H\u001b[2J${renderView(view, size())}`);
    };
    /** @param {import('../types.ts').Operation[] | null} value @param {Error} [error] */
    function finish(value, error) {
      if (settled) return;
      settled = true;
      input.removeListener("keypress", onKey);
      input.removeListener("end", cancel);
      input.removeListener("close", cancel);
      input.removeListener("error", fail);
      output.removeListener("resize", draw);
      output.removeListener("error", fail);
      signal?.removeEventListener("abort", cancel);
      try {
        restoreTerminal({ input, output, wasRaw, wasFlowing });
      } catch (cleanupError) {
        reject(cleanupError);
        return;
      }
      if (error) reject(error);
      else resolve(value);
    }
    function cancel() {
      finish(null);
    }
    /** @param {Error} error */
    function fail(error) {
      finish(null, error);
    }
    /** @param {string} _text @param {import('node:readline').Key} key */
    function onKey(_text, key) {
      try {
        Object.assign(keyState, size());
        switch (handleKey(view, key, keyState)) {
          case "cancel":
            cancel();
            break;
          case "apply":
            finish(getPlan(matrix));
            break;
          case "draw":
            draw();
            break;
          case "ignore":
            break;
          default:
            break;
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    }
    try {
      emitKeypressEvents(input);
      input.on("keypress", onKey);
      input.once("end", cancel);
      input.once("close", cancel);
      input.once("error", fail);
      output.on("resize", draw);
      output.once("error", fail);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      input.setRawMode(true);
      input.resume();
      screenMode(output, true);
      draw();
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
