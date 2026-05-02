## MODIFIED Requirements

### Requirement: Numeric interval editing
The Claude-MD settings section SHALL provide a text-input editor for `rereadInterval`. The setting SHALL control the interval for re-reading previously injected subdirectory context only. It SHALL NOT enable periodic root/native context refresh.

#### Scenario: Setting interval to a positive number
- **WHEN** the user edits `rereadInterval` to `5` and confirms
- **THEN** the value `5` is persisted as a number to the selected scope's config
- **AND** previously injected subdirectory context becomes eligible for re-injection after 5 completed assistant turns

#### Scenario: Setting interval to off
- **WHEN** the user edits `rereadInterval` to `0` and confirms
- **THEN** the value `0` is persisted to the selected scope's config
- **AND** periodic subdirectory re-read behavior is disabled
- **AND** root/native context refresh remains disabled regardless of this value

#### Scenario: Settings copy describes subdirectory re-read
- **WHEN** the user views the `rereadInterval` setting in `/supi-settings`
- **THEN** its label or description SHALL NOT describe root refresh
- **AND** it SHALL describe re-reading previously injected context or subdirectory context
