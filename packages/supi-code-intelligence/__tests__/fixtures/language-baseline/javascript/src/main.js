import { renameMe, Surface } from "./model.js";

export class Widget extends Surface {
  render() {
    return /* 🧭 UTF-16 rename offset */ String(renameMe(2));
  }
}

export const knownError = missingFunction();
