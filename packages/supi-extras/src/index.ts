import aliases from "./aliases.ts";
import bashTimeout from "./bash-timeout.ts";
import cloneSession from "./clone-session.ts";
import codemodeCompact from "./codemode-compact.ts";
import copyPrompt from "./copy-prompt.ts";
import gitEditor from "./git-editor.ts";
import promptStash from "./prompt-stash.ts";
import sessionCapabilities from "./session-capabilities.ts";
import supiFooter from "./supi-footer.ts";
import tabSpinner from "./tab-spinner.ts";

export default function (pi: Parameters<typeof tabSpinner>[0]) {
  tabSpinner(pi);
  promptStash(pi);
  copyPrompt(pi);
  cloneSession(pi);
  gitEditor(pi);
  aliases(pi);
  sessionCapabilities(pi);
  supiFooter(pi);
  bashTimeout(pi);
  codemodeCompact(pi);
}
