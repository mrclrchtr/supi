import type { Surface } from "./model";
import { renameMe } from "./model";

export class Widget implements Surface {
  render(): string {
    function nestedCall(): number {
      return /* 🧭 UTF-16 rename offset */ renameMe(3);
    }
    return String(renameMe(2) + nestedCall() + renameMe(4));
  }
}

export const knownError: number = "wrong";
