## ADDED Requirements

### Requirement: Shared context-message prune-and-reorder utility
The system SHALL provide a `pruneAndReorderContextMessages` function in `supi-core/context-messages.ts` that filters stale messages by `customType` and `contextToken`, then reorders the active message before the last user message. The function SHALL accept a generic message array, a `customType` string, and an `activeToken` (nullable string), and return the filtered and reordered array.

#### Scenario: No active token removes all messages of that customType
- **WHEN** `activeToken` is `null` and the message array contains 2 messages with `customType: "lsp-context"` and 3 other messages
- **THEN** the function returns an array of 3 messages with no `lsp-context` entries

#### Scenario: Active token keeps only the matching message
- **WHEN** `activeToken` is `"token-1"` and the array contains messages with `customType: "supi-claude-md-refresh"` and tokens `"old-1"`, `"token-1"`, `"old-2"`
- **THEN** the returned array contains exactly one `"supi-claude-md-refresh"` message with token `"token-1"`

#### Scenario: Active message reordered before last user message
- **WHEN** the active context message appears after the last user message in the array
- **THEN** the function moves the active context message to immediately before the last user message

#### Scenario: Active message already before last user message
- **WHEN** the active context message already appears before the last user message
- **THEN** the function returns the array unchanged (same order)

#### Scenario: No messages of the target customType exist
- **WHEN** `activeToken` is `"token-1"` but no messages have the specified `customType`
- **THEN** the function returns the array unchanged

### Requirement: Shared context-message helper types and utilities
The system SHALL export a `ContextMessageLike` type and `getContextToken` and `findLastUserMessageIndex` helper functions from `supi-core/context-messages.ts`. The type SHALL require `role`, `customType`, and `details` as optional fields. `getContextToken` SHALL extract the `contextToken` string from a `details` object. `findLastUserMessageIndex` SHALL return the index of the last message with `role: "user"`.

#### Scenario: getContextToken with valid details
- **WHEN** `details` is `{ contextToken: "abc-123" }`
- **THEN** `getContextToken` returns `"abc-123"`

#### Scenario: getContextToken with missing token
- **WHEN** `details` is `{ otherField: 42 }`
- **THEN** `getContextToken` returns `null`

#### Scenario: findLastUserMessageIndex with user messages
- **WHEN** the array has messages with roles `["user", "assistant", "user", "assistant"]`
- **THEN** `findLastUserMessageIndex` returns `2`

#### Scenario: findLastUserMessageIndex with no user messages
- **WHEN** the array has only assistant messages
- **THEN** `findLastUserMessageIndex` returns `-1`
