# @mrclrchtr/supi-bash-timeout

Injects a default timeout on `bash` tool calls when the LLM omits one, preventing hung commands from blocking the [pi coding agent](https://github.com/earendil-works/pi) indefinitely.

## Install

```bash
pi install npm:@mrclrchtr/supi-bash-timeout
```

Also included in the [SuPi meta-package](https://www.npmjs.com/package/@mrclrchtr/supi).

For local development:

```bash
pi install ./packages/supi-bash-timeout
```

Edit the source and `/reload` to pick up changes.

## What it adds

Intercepts every `bash` tool call and injects a configurable default timeout when the model didn't specify one.

- Only affects the `bash` tool — other tools are untouched
- Leaves explicit timeouts unchanged
- Default timeout: **120 seconds**

## Configuration

Config files (project overrides global):

| Scope | Path |
|-------|------|
| Global | `~/.pi/agent/supi/config.json` |
| Project | `.pi/supi/config.json` |

```json
{
  "bash-timeout": {
    "defaultTimeout": 300
  }
}
```

`defaultTimeout` must be a positive integer. Non-numeric, zero, and negative values fall back to the 120-second default.

If `/supi-settings` is available (registered by the `@mrclrchtr/supi` meta-package), the **Bash Timeout** section also appears there with an editable field.

## Requirements

- `@earendil-works/pi-coding-agent` (peer)
- `@mrclrchtr/supi-core`

## Source

Extension entrypoint: `src/bash-timeout.ts`
