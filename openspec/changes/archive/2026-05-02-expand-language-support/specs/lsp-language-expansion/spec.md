## ADDED Requirements

### Requirement: LSP defaults SHALL include Ruby language server support
The system SHALL ship with a built-in default server definition for the `ruby` language using `ruby-lsp`, covering `.rb`, `.erb`, and `.gemspec` files.

#### Scenario: Ruby project detected
- **WHEN** the agent interacts with a `.rb` file and `ruby-lsp` is on PATH
- **THEN** the system uses the default Ruby server config keyed by language `ruby`: command `ruby-lsp`, args `[]`, fileTypes `["rb", "erb", "gemspec"]`, rootMarkers `["Gemfile", ".ruby-version"]`

#### Scenario: Ruby server binary missing
- **WHEN** the configured command `ruby-lsp` is not found on PATH
- **THEN** the system logs a debug message and skips this server; no error is raised

### Requirement: LSP defaults SHALL include Java language server support
The system SHALL ship with a built-in default server definition for the `java` language using `jdtls`, covering `.java` files.

#### Scenario: Java project detected
- **WHEN** the agent interacts with a `.java` file and `jdtls` is on PATH
- **THEN** the system uses the default Java server config keyed by language `java`: command `jdtls`, args `[]`, fileTypes `["java"]`, rootMarkers `["pom.xml", "build.gradle", ".git"]`

#### Scenario: Java server binary missing
- **WHEN** the configured command `jdtls` is not found on PATH
- **THEN** the system logs a debug message and skips this server; no error is raised

### Requirement: LSP defaults SHALL include Kotlin language server support
The system SHALL ship with a built-in default server definition for the `kotlin` language using `kotlin-lsp`, covering `.kt` and `.kts` files.

#### Scenario: Kotlin project detected
- **WHEN** the agent interacts with a `.kt` file and `kotlin-lsp` is on PATH
- **THEN** the system uses the default Kotlin server config keyed by language `kotlin`: command `kotlin-lsp`, args `[]`, fileTypes `["kt", "kts"]`, rootMarkers `["build.gradle.kts", "pom.xml", ".git"]`

#### Scenario: Kotlin server binary missing
- **WHEN** the configured command `kotlin-lsp` is not found on PATH
- **THEN** the system logs a debug message and skips this server; no error is raised
