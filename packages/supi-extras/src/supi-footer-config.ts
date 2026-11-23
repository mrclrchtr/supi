import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { ICON_MODES, type IconMode, isIconMode } from "./footer-icons.ts";

/** Config section `footer` in SuPi config files. */
export interface FooterConfig extends Record<string, unknown> {
  /** Icon set: `auto` detects from the terminal environment. */
  icons: IconMode;
  /** Show ahead/behind, file counts, and branch stashes next to the branch. */
  gitStatus: boolean;
  /** Show and link the Session Issues named in the first user message. */
  issueLink: boolean;
}

export const FOOTER_DEFAULTS: FooterConfig = {
  icons: "auto",
  gitStatus: true,
  issueLink: true,
};

export function loadFooterConfig(cwd: string, homeDir?: string): FooterConfig {
  const raw = loadSupiConfig("footer", cwd, FOOTER_DEFAULTS, { homeDir });
  return {
    icons: isIconMode(raw.icons) ? raw.icons : FOOTER_DEFAULTS.icons,
    gitStatus: typeof raw.gitStatus === "boolean" ? raw.gitStatus : FOOTER_DEFAULTS.gitStatus,
    issueLink: typeof raw.issueLink === "boolean" ? raw.issueLink : FOOTER_DEFAULTS.issueLink,
  };
}

export function registerFooterSettings(pi: ExtensionAPI, afterPersist: () => void): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: "footer",
      label: "Footer",
      section: "footer",
      defaults: FOOTER_DEFAULTS,
      fields: [
        {
          kind: "enum",
          key: "icons",
          label: "Icons",
          values: [...ICON_MODES],
          description:
            "auto: Nerd Font on local UTF-8 terminals, Unicode over SSH, ASCII otherwise",
        },
        {
          kind: "boolean",
          key: "gitStatus",
          label: "Git status",
          description: "Show ahead/behind, staged/modified/untracked counts, and branch stashes",
        },
        {
          kind: "boolean",
          key: "issueLink",
          label: "Issue link",
          description: "Show and link GitHub issues named in the first user message",
        },
      ],
      afterPersist,
    }),
  );
}
