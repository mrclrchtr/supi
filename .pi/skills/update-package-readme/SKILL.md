---
name: update-package-readme
description: Update one SuPi package README and its direct user-facing Markdown references from installed Pi docs and verified package evidence.
disable-model-invocation: true
metadata:
  internal: true
---

# Update one package README

Use this skill with one workspace-relative package directory:

```text
/skill:update-package-readme packages/supi-cache
```

## Subject boundary

Take exactly one package directory from the skill arguments. Accept one optional leading `@`, then require a path that matches `packages/supi-*`. Require `package.json` and `README.md` in that directory. Ask for a valid path when the argument is missing or ambiguous.

The selected package is the only package whose documentation is in scope. The allowed edits are:

- the selected package's `README.md`
- current user-facing Markdown files that make a direct claim about that package

A direct claim is a sentence, list item, table row, install example, or link that names the package and describes its purpose, status, installation, or public behavior. Search repository-owned Markdown files for the directory name, npm package name, and package README link.

## Audience and relevance

Extension READMEs serve end users. Public library READMEs serve API consumers. For internal packages and test utilities, identify the intended maintainer or developer audience.

Keep a detail only if it helps that audience install, use, configure, or troubleshoot the package, or understand its limits and risks. For libraries, this includes public API contracts and examples. Keep maintainer setup and source file lists in contributor documentation rather than extension user READMEs.

## Phase 1 — Read the installed Pi docs

Use the installed `@earendil-works/pi-coding-agent` path supplied by the harness. Otherwise, check `node_modules/@earendil-works/pi-coding-agent`. Ask for the docs location when the package is not installed.

Read these files in order:

1. `README.md`
2. `docs/index.md`
3. `docs/packages.md`

Next, inspect only the selected package's manifest, exports, and extension entrypoint. Use this short scan to identify its Pi resources and public library surface. Then read the matching docs:

- `docs/extensions.md` for an extension
- `docs/skills.md` for skills
- `docs/prompt-templates.md` for prompts
- `docs/themes.md` for themes
- `docs/tui.md` and `docs/keybindings.md` for interactive terminal user interfaces or shortcuts
- `docs/sdk.md` for a library that uses Pi programmatically

Follow direct Markdown links from the selected docs when the linked material defines an API or convention used by the package. Stop when each applicable install, resource, and usage rule has one Pi documentation source. Use the installed docs as the authority for Pi behavior.

**Phase 1 is complete when:** the working notes record the installed docs root, each detected package surface, and the Pi documentation source for each surface.

## Phase 2 — Build an evidence map

Orient on the selected package, then inspect:

- `package.json`
- the current `README.md`
- `CLAUDE.md` or `AGENTS.md`, when present
- exported entrypoints and package resources
- extension, command, tool, shortcut, and user interface registrations
- tool specifications and model guidance
- settings definitions, defaults, validation, migration, and scope
- tests that verify public behavior, limits, and failure modes
- required binaries, services, API keys, permissions, and supported file types
- root manifests, install scripts, and current catalogs when they define package status or stack membership
- current user-facing Markdown files that make direct claims about the package

Keep a short evidence map in the current working notes. Do not create a repository file for it. Give each entry three fields: verified fact, source path, and README action. Inspection does not require inclusion: use implementation details to verify behavior, then apply the audience and relevance test. Mark facts that users do not need as evidence only. Include:

- package role: Pi extension, resource-only extension, public library, internal package, test utility, or mixed package
- supported installation methods
- release, beta, DevTools, internal, or bundled-only status
- resources added to Pi
- exact tools, commands, shortcuts, settings, and public exports
- defaults, limits, mode restrictions, persistence, and supported file types
- privacy, security, filesystem, Git, process, and sandbox boundaries
- stale, misleading, or unsupported claims in current docs

Use these evidence rules:

- Installed Pi docs define Pi behavior and package commands.
- Manifests, exports, and install scripts define package and install surfaces.
- Source and tests define package behavior.
- Existing README text is a claim to verify, not evidence.
- Package instruction files define maintenance constraints, not runtime behavior.

Resolve conflicts from these sources before editing. Ask the user when an unresolved conflict changes installation, package status, scope, or a public contract. Omit an unsupported optional detail and report it as an ambiguity.

**Phase 2 is complete when:** each evidence-map entry has a source and an action, each registered public surface has an entry, and each direct Markdown reference is classified as current, stale, or historical.

## Phase 3 — Update the documentation

Update the selected package README first. Make it accurate, concise, specific, and useful to a package user.

Apply these rules:

- Write only verified claims.
- Use ASD-STE100 Simplified Technical English and the repository's established voice.
- Describe the practical outcome. Include implementation details only when they pass the audience and relevance test.
- Explain what users can do in a UI. Include comparisons with other commands or Pi rendering details only when they help users complete a task.
- Use `pi install npm:<package>` for an installable Pi package.
- Use the applicable package-manager command for a public library.
- Identify an internal or private package clearly instead of giving an end-user install command.
- Name only resources, commands, tools, shortcuts, settings, and exports that exist.
- Document runtime discovery as its user-visible result.
- State important defaults, requirements, limits, privacy rules, and security boundaries directly.
- Preserve accurate banners, screenshots, links, and examples that serve the intended audience. Keep local development instructions in contributor documentation.
- Remove stale lists, generic boilerplate, duplicate explanations, and unsupported marketing claims.

Use only the sections that fit the package:

- title and one-sentence summary
- install
- features or what it adds
- usage
- configuration or settings
- requirements, limits, privacy, or security
- public API and examples for a library
- developer usage for internal packages and test utilities

After the package README is accurate, update each current user-facing Markdown file whose direct claim conflicts with the evidence map. Change only the claim about the selected package. Keep unrelated prose unchanged.

**Phase 3 is complete when:** the package README contains only verified current claims that pass the audience and relevance test, and all current direct Markdown references agree with it.

## Validate

1. Re-read every changed document against the evidence map.
2. Check every paragraph and list item in the selected README for audience relevance. Remove details that pass the factual check but fail the relevance test. Apply the same test to changed claims in other documents.
3. Check headings, code fences, relative links, image links, and named source paths.
4. When Git is available, run `git diff --check`.
5. Inspect the complete diff and final status. Confirm that all new edits are documentation edits about the selected package and that pre-existing changes remain intact.

For documentation-only changes, skip the full code verification suite unless project instructions require it.

**The task is complete when:** every changed claim is verified, all direct current references were checked, validation passes, and each unresolved documentation gap appears in the final report.

## Report

After validation, give the user a final response with:

1. the selected package and its verified role
2. a brief research summary with the key source paths
3. each document changed and the main change
4. validation performed
5. open questions, ambiguities, or stale historical references left unchanged
