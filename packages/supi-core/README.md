# @mrclrchtr/supi-core

Shared infrastructure for SuPi packages.

## Install

Use it as a dependency in another extension package:

```bash
pnpm add @mrclrchtr/supi-core
```

## What it provides

`@mrclrchtr/supi-core` is a library package. It does **not** register a pi extension by itself.

Current exports cover:

- shared config loading and writing
- XML `<extension-context>` wrapping helpers
- context-message utilities for pruning and reordering injected messages

## Config system

Config resolution order:

```text
defaults <- global <- project
```

Config file locations:

- global: `~/.pi/agent/supi/config.json`
- project: `.pi/supi/config.json`

Main helpers:

- `loadSupiConfig()` — effective merged config (`defaults <- global <- project`)
- `loadSupiConfigForScope()` — raw single-scope config for settings UIs (`defaults <- selected scope`)
- `writeSupiConfig()`
- `removeSupiConfigKey()`

## Context helpers

- `wrapExtensionContext()`
- `findLastUserMessageIndex()`
- `getContextToken()`
- `pruneAndReorderContextMessages()`

## Example

```ts
import { loadSupiConfig, wrapExtensionContext } from "@mrclrchtr/supi-core";

const config = loadSupiConfig("my-extension", process.cwd(), {
  enabled: true,
});

const message = wrapExtensionContext("my-extension", "hello", {
  turn: 1,
  file: "CLAUDE.md",
});
```

## Requirements

- `@mariozechner/pi-coding-agent`

## Source

- Main exports: `index.ts`
