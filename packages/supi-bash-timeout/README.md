# @mrclrchtr/supi-bash-timeout

Default timeout injection for the `bash` tool in the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-bash-timeout
```

## What it adds

This extension intercepts `bash` tool calls and injects a default timeout when the model omitted one.

That helps prevent long-running or hung shell commands from blocking a session indefinitely.

## Configuration

Configure via the shared SuPi config file, or through `/supi-settings` when another package in your install surface registers that command (for example `@mrclrchtr/supi`).

Config file locations:

- global: `~/.pi/agent/supi/config.json`
- project: `.pi/supi/config.json`

Use the `bash-timeout` section:

```json
{
  "bash-timeout": {
    "defaultTimeout": 300
  }
}
```

Default:

- `120` seconds

## Behavior

- only affects the `bash` tool
- only injects a timeout when one was not already provided
- leaves explicit timeouts unchanged

## Requirements

- `@earendil-works/pi-coding-agent`
- `@mrclrchtr/supi-core`

## Source

- Entrypoint: `src/bash-timeout.ts`
