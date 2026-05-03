## ADDED Requirements

### Requirement: Repo-local tooling retrospective prompt SHALL be available
This repository SHALL provide a project-local prompt template at `.pi/prompts/supi-tooling-retro.md`. Pi sessions started in this repository SHALL expose the template as the manual slash command `/supi-tooling-retro` without requiring any changes to the published `@mrclrchtr/supi` meta-package.

#### Scenario: Prompt is discoverable in this repository
- **WHEN** pi loads prompt templates for a session started in this repository
- **THEN** `/supi-tooling-retro` is available from the project-local `.pi/prompts` prompt directory

### Requirement: Prompt SHALL evaluate both used tools and missed opportunities
The prompt SHALL instruct the agent to reflect on the completed task rather than the entire SuPi suite in the abstract. It SHALL cover SuPi tools that were used, tools that would likely have helped but were not used, and whether any missed help was caused by discoverability or guidance gaps.

#### Scenario: Task used SuPi tooling directly
- **WHEN** the completed task involved one or more SuPi tools
- **THEN** the retrospective calls out which tools were used and evaluates how they helped or fell short

#### Scenario: Task did not use SuPi tooling directly
- **WHEN** the completed task did not use any SuPi-specific tools
- **THEN** the retrospective explicitly says so and focuses on which available tools would have helped

### Requirement: Prompt SHALL capture missing pieces and noisy context
The prompt SHALL ask the agent to identify missing utilities, missing features in existing tools, and information or guidance that was unhelpful, redundant, poorly timed, or otherwise wasteful of context.

#### Scenario: Feedback includes unnecessary context
- **WHEN** the completed task involved instructions, prompt text, or tool output that added little value
- **THEN** the retrospective includes that information under an explicit unhelpful or noisy context category

### Requirement: Prompt output SHALL be a structured markdown brief with prioritized recommendations
The prompt SHALL require a compact markdown response that includes a short task summary plus sections for tools used, missed opportunities, missing pieces, unhelpful or noisy context, prioritized recommendations, and confidence/evidence. The recommendations SHALL be prioritized so the most valuable improvements appear first.

#### Scenario: Retrospective produces actionable output
- **WHEN** the agent completes `/supi-tooling-retro`
- **THEN** the response is a structured markdown brief with prioritized recommendations rather than freeform prose

### Requirement: Prompt SHALL remain retrospective-only
The prompt SHALL instruct the agent to stop after producing the retrospective. It SHALL not direct the agent to edit files, create issues, modify OpenSpec artifacts, or otherwise take implementation action as part of the prompt itself.

#### Scenario: Retrospective ends without side effects
- **WHEN** the agent finishes the retrospective prompt
- **THEN** the result is limited to chat output and no follow-on edits or workflow mutations are performed automatically
