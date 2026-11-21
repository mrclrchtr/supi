# Changelog

## [14.1.0]

- Suggestions are shorter and read like a message you would type: no lead-ins such as "I'd say:", no copied long commands, and no steps the assistant did not mention. They follow the language of the assistant's message. Suggestions no longer announce what you are about to do, such as "I'll check…", and appear more often instead of being dropped.
- Suggestions no longer answer in the assistant's voice ("I'll read the file first…") when the assistant's message contains `@name` text such as `@variant` or `@mixin`. With `claude-code` models, such text was read as a file mention.

## [14.0.0]

- Navigating the session tree, with `/tree` or from an extension command, now clears a pending or shown suggestion; it answered the branch you left. No new suggestion is generated after navigation. Runs whose result the session abandons, such as `/supi-tooling-retro`, no longer request a suggestion, so no ghost text answering the retrospective report appears afterwards ([#623](https://github.com/mrclrchtr/supi/issues/623)).

## [11.4.0]

- Suggestions now predict your next message, preferring commands such as "push it" over questions, instead of continuing in the assistant's voice. When the assistant asked a question, the suggestion answers it as a command.

## [11.3.0]

- Added package-specific release notes for model-powered prompt suggestions.
