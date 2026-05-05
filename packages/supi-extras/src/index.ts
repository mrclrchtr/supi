import aliases from "./aliases.ts";
import gitEditor from "./git-editor.ts";
import promptStash from "./prompt-stash.ts";
import skillShortcut from "./skill-shortcut.ts";
import tabSpinner from "./tab-spinner.ts";

export default function (pi: Parameters<typeof tabSpinner>[0]) {
  tabSpinner(pi);
  promptStash(pi);
  gitEditor(pi);
  aliases(pi);
  skillShortcut(pi);
}
