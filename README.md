# pi-extensions

Personal [pi coding agent](https://github.com/mariozechner/pi-coding-agent) extensions.

## Extensions

| Extension | Description |
|-----------|-------------|
| **aliases** | Registers `/exit` to quit pi, `/e` as a shorthand alias, and `/clear` to start a new session (alias for `/new`) |
| **update-notifier** | Checks npm on session start and auto-installs newer versions of pi. Set `PI_SKIP_AUTO_UPDATE=1` to disable. Adds `/update` command for manual checks. |
| **bash-timeout** | Injects a default timeout on every bash tool call when the LLM omits one. Configurable via `PI_BASH_DEFAULT_TIMEOUT` (seconds, default 120). |
| **skill-shortcut** | Type `$skill-name` as a shorthand for `/skill:skill-name`. Autocomplete triggers on `$`. |

## Install

```bash
pi install /path/to/pi-extensions
# or from git
pi install git:github.com/mrclrchtr/pi-extensions
```
