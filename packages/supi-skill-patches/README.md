# supi-skill-patches

Private maintenance workspace for the SuPi-compatible skills in the root [`skills/`](../../skills) catalog.

Users install the committed skills through [skills.sh](https://skills.sh):

```bash
npx skills add mrclrchtr/supi --skill code-review research
```

This package is not a PI extension and is not published to npm. Skills installed through skills.sh are static PI resources, so `@mrclrchtr/supi-skills` can enable them, hide them from model invocation, or disable them fully.

## Maintenance

`upstream.json` records every upstream skill group and uses `includedGroups` to mark the stable groups mirrored to the root catalog. The `mattpocock-skills` development dependency pins the upstream release.

No patches are active. The root catalog is an exact mirror of the selected upstream skill groups.

```bash
pnpm install      # install the pinned dependency
pnpm skills:sync  # refresh root skills and upstream.json
pnpm skills:check # check generated-skill drift
```

The maintenance test reports upstream skill additions and removals.

When a SuPi change becomes necessary, add and review one patch fragment for one upstream file. Compose the combined patch, register it in `pnpm-workspace.yaml`, run `pnpm install`, and sync the root catalog. Do not add speculative patches.

## Credit

The generated skills are adapted from [mattpocock/skills](https://github.com/mattpocock/skills), licensed under MIT. Each generated skill includes the upstream license.
