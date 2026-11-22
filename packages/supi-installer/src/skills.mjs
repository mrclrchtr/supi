/**
 * SuPi-owned skills from the skills.sh catalog. The root `.claude-plugin/marketplace.json`
 * is the source of truth; a unit test keeps this shipped copy in sync because the
 * installer does not fetch a live catalog.
 */
export const supiSkills = ["claude-md-improver", "claude-md-revision", "commit"];

/** Build a skills.sh install command for Pi. @param {string[]} skills @param {{global?: boolean}} [options] */
export function skillsCommand(skills, options = {}) {
  return `npx skills add mrclrchtr/supi -a pi${options.global ? " -g" : ""} --skill ${skills.join(" ")}`;
}

/** Point users to skills that this installer does not manage. */
export function skillsHint() {
  return [
    "SuPi also publishes agent skills. This installer does not manage them.",
    `  Project: ${skillsCommand(supiSkills)}`,
    `  Global:  ${skillsCommand(supiSkills, { global: true })}`,
    "Use supi-skills to control installed skills.",
  ];
}
