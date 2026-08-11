# supi-skill-patches

Private maintenance workspace for the SuPi-compatible skills in the root [`skills/`](../../skills) catalog.

Users install the committed skills through [skills.sh](https://skills.sh):

```bash
npx skills add mrclrchtr/supi --skill code-review research
```

This package is not a PI extension and is not published to npm. Skills installed through skills.sh are static PI resources, so `@mrclrchtr/supi-skills` can enable them, hide them from model invocation, or disable them fully.

## Maintenance

`upstream.json` records every upstream skill group and uses `includedGroups` to mark the stable groups mirrored to the root catalog. The `mattpocock-skills` development dependency pins the upstream release.

One patch fragment exists for each changed upstream file under `patches/mattpocock-skills/files/`. pnpm consumes the generated `patches/mattpocock-skills/combined.patch`.

```bash
pnpm skills:patches:compose # rebuild the pnpm patch from fragments
pnpm install                # apply the patch to the pinned dependency
pnpm skills:sync            # refresh root skills and upstream.json
pnpm skills:check           # check patch and generated-skill drift
```

A dependency update fails when a patch no longer applies. The maintenance test also reports upstream skill additions and removals.

## Credit

The generated skills are adapted from [mattpocock/skills](https://github.com/mattpocock/skills), licensed under MIT. Each generated skill includes the upstream license.
