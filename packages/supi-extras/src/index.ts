import aliases from "./aliases.ts";
import copyPrompt from "./copy-prompt.ts";
import gitEditor from "./git-editor.ts";
import promptStash from "./prompt-stash.ts";
import skillShortcut from "./skill-shortcut.ts";
import supiFooter from "./supi-footer.ts";
import tabSpinner from "./tab-spinner.ts";

const PATH_RESOLUTION_GUIDANCE =
  "Treat `@<path>` in a user message as the path `<path>`:" +
  " resolve relative paths from the current working directory;" +
  " absolute paths stay absolute.";

export default function (pi: Parameters<typeof tabSpinner>[0]) {
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${PATH_RESOLUTION_GUIDANCE}`,
  }));

  tabSpinner(pi);
  promptStash(pi);
  copyPrompt(pi);
  gitEditor(pi);
  aliases(pi);
  skillShortcut(pi);
  supiFooter(pi);
}
