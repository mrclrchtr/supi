# supi-skill-patches

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers)

Private maintenance workspace for the SuPi-compatible skills in the root [`skills/`](../../skills) catalog.

Users install the committed skills through [skills.sh](https://skills.sh):

```bash
npx skills add mrclrchtr/supi --skill code-review research
```

This checkout links selected catalog skills into `.pi/skills/`, so local agents use the generated files directly. `pnpm skills:sync` also generates `.claude-plugin/marketplace.json`, which groups the public catalog into Matt Pocock and SuPi skills in the skills.sh installer. It does not need a skills.sh install.

This package is not a PI extension and is not published to npm. Skills installed through skills.sh are static PI resources, so `@mrclrchtr/supi-skills` can enable them, hide them from model invocation, or disable them fully.

## Maintenance

`upstream.json` records every upstream skill group and uses `includedGroups` to mark the stable groups mirrored to the root catalog. Each skill keeps its upstream `skills/<group>/<name>/` path. Sync replaces each selected group directory as one generated unit, so these directories cannot contain unmanaged files. The `mattpocock-skills` development dependency pins the upstream release.

One patch fragment exists for each changed upstream file under `patches/mattpocock-skills/files/`. pnpm consumes the generated `patches/mattpocock-skills/combined.patch`. The `grilling` patch uses `ask_user` from `@mrclrchtr/supi-ask-user` for each question round.

Compatibility patches keep repository domain paths as `CONTEXT.md` and `CONTEXT-MAP.md`. The upstream `GLOSSARY-FORMAT.md` reference filename stays unchanged. The separate `teach` skill keeps its teaching glossary. Skill calls use `SKILL.md` reads because Pi does not provide a `Skill` tool.

```bash
pnpm skills:patches:compose # rebuild the pnpm patch from fragments
pnpm install                # apply the patch to the pinned dependency
pnpm skills:sync            # refresh root skills, upstream.json, and the skills.sh grouping manifest
pnpm skills:check           # check patch and generated-skill drift
```

A dependency update fails when a patch no longer applies. The maintenance test also reports upstream skill additions and removals.

Add and review one patch fragment for one upstream file. Do not add speculative patches.

## Automatic updates

[The skill sync workflow](../../.github/workflows/skills-sync.yml) runs for same-repository PRs opened by `renovate[bot]` on `renovate/mattpocock-skills-*` branches. It runs only when the PR changes files under `packages/supi-skill-patches/`. Upstream version updates change the dependency pin in this package's `package.json`, so they trigger the workflow. Changes only to `pnpm-lock.yaml` or `pnpm-workspace.yaml` do not trigger it.

1. A read-only job installs dependencies with the frozen lockfile, then runs `skills:sync` and `skills:check`.
2. A separate job checks the generated patch. It commits only changes to regular files in `skills/`, to `packages/supi-skill-patches/upstream.json`, and to `.claude-plugin/marketplace.json`. It does not install dependencies or run repository scripts.
3. The job pushes only if the PR is still open and its head is unchanged. It does not force-push. Unchanged output creates no commit.

The write job uses the existing `MRCLRCHTR_BOT_CLIENT_ID` variable and `MRCLRCHTR_BOT_PRIVATE_KEY` secret. The app needs repository contents write permission and pull request read permission. Its token lets the generated commit start normal PR checks. Renovate ignores the generated commit's author, so it can still update and rebase the PR.

Patch conflicts stop the workflow before generation. Fix the affected fragments and rebuild the combined patch; the workflow does not resolve conflicts or discard patches. Skill updates still require manual review. Check added and removed skills, and update affected `.pi/skills/` links by hand.

## Credit

The generated upstream skills are adapted from [mattpocock/skills](https://github.com/mattpocock/skills), licensed under MIT, and retain that license. SuPi-owned catalog skills include their own license.
