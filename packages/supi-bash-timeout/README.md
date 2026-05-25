<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-bash-timeout">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-bash-timeout/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-bash-timeout

Adds one small safety feature to the [pi coding agent](https://github.com/earendil-works/pi): if the model calls `bash` without a timeout, this package fills one in.

## Install

```bash
pi install npm:@mrclrchtr/supi-bash-timeout
```

For local development:

```bash
pi install ./packages/supi-bash-timeout
```

## What you get

After install, every `bash` tool call is checked before execution:

- if the model already set `timeout`, that value is kept
- if `timeout` is missing, this package injects a default value
- other tools are untouched

Default timeout: **120 seconds**

This is useful when you want a guardrail against hung commands in long or unattended sessions.

## Settings

This package registers a **Bash Timeout** section in `/supi-settings`.

Available setting:

- `defaultTimeout` — default timeout for `bash` tool calls, in seconds

Config is stored in the standard SuPi config files:

- global: `~/.pi/agent/supi/config.json`
- project: `.pi/supi/config.json`

Example:

```json
{
  "bash-timeout": {
    "defaultTimeout": 300
  }
}
```

Invalid values are ignored and fall back to the built-in default of `120`.

## Source

- `src/bash-timeout.ts` — intercepts `bash` tool calls and injects missing timeouts
- `src/config.ts` — config loading and default values
- `src/settings-registration.ts` — `/supi-settings` registration
