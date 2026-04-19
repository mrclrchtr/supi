# @mrclrchtr/supi-bash-timeout

Default timeout injection for the `bash` tool in the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-bash-timeout
```

## What it adds

This extension intercepts `bash` tool calls and injects a default timeout when the model omitted one.

That helps prevent long-running or hung shell commands from blocking a session indefinitely.

## Configuration

Set the timeout in seconds with `PI_BASH_DEFAULT_TIMEOUT`:

```bash
export PI_BASH_DEFAULT_TIMEOUT=300
```

Default:

- `120` seconds

## Behavior

- only affects the `bash` tool
- only injects a timeout when one was not already provided
- leaves explicit timeouts unchanged

## Requirements

- `@mariozechner/pi-coding-agent`

## Source

- Entrypoint: `index.ts`
