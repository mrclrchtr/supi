# supi-skill-patches

Private maintenance workspace for the SuPi-compatible skills in the root [`skills/`](../../skills) catalog.

Users install the committed skills through [skills.sh](https://skills.sh):

```bash
npx skills add mrclrchtr/supi --skill code-review research
```

This checkout links selected catalog skills into `.agents/skills/`, so local agents use the generated files directly. It does not need a skills.sh install.

This package is not a PI extension and is not published to npm. Skills installed through skills.sh are static PI resources, so `@mrclrchtr/supi-skills` can enable them, hide them from model invocation, or disable them fully.

## Maintenance

`upstream.json` records every upstream skill group and uses `includedGroups` to mark the stable groups mirrored to the root catalog. Each skill keeps its upstream `skills/<group>/<name>/` path. Sync replaces each selected group directory as one generated unit, so these directories cannot contain unmanaged files. The `mattpocock-skills` development dependency pins the upstream release.

One patch fragment exists for each changed upstream file under `patches/mattpocock-skills/files/`. pnpm consumes the generated `patches/mattpocock-skills/combined.patch`. The `grilling` patch uses `ask_user` from `@mrclrchtr/supi-ask-user` for each question round.

```bash
pnpm skills:patches:compose # rebuild the pnpm patch from fragments
pnpm install                # apply the patch to the pinned dependency
pnpm skills:sync            # refresh root skills and upstream.json
pnpm skills:check           # check patch and generated-skill drift
```

A dependency update fails when a patch no longer applies. The maintenance test also reports upstream skill additions and removals.

Add and review one patch fragment for one upstream file. Do not add speculative patches.

## Credit

The generated skills are adapted from [mattpocock/skills](https://github.com/mattpocock/skills), licensed under MIT. Each generated skill includes the upstream license.
