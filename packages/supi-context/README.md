# @mrclrchtr/supi-context

Context diagnostics for PI — see exactly what's eating your context window, down to the file.

Run `/supi-context` in any session. You get a visual dashboard, not just a number: a color-coded grid of your context budget, per-category breakdowns, per-file token counts for every injected context file, skill token usage, and compaction info.

## What you get

### Visual budget

A 20-column grid shows your context window at a glance — which categories fill it, how much free space remains, and where the autocompact buffer sits. Color-coded: system prompt, conversation, tools, free space.

### Per-category breakdown

System prompt, user messages, assistant messages, tool calls, tool results — each with token counts and percentage of the total.

### System prompt deep dive

What's inside the system prompt: context files (per-file tokens), skills (per-skill tokens), guidelines, tool definitions, and custom append text. Find the exact file or skill that's bloating your context.

### Injected context tracking

Every file injected by supi-claude-md, with turn number and token cost. See what subdirectory context is costing you.

### Compaction awareness

How many older turns were summarized. Know when your conversation history was compacted.

### Extension data

Registered context providers (like supi-cache) contribute their own sections — see cache hit rates, forensics data, or whatever other extensions want to surface.

## Install

```bash
pi install npm:@mrclrchtr/supi-context
```

## Usage

```bash
/supi-context
```
