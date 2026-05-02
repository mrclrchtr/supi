## ADDED Requirements

### Requirement: Context provider registration
The supi-core package SHALL export a `registerContextProvider()` function that extensions call during their factory function to register a named data provider. The registry SHALL use the same `globalThis` + `Symbol.for` pattern as the settings registry to work across jiti module resolution boundaries.

#### Scenario: Extension registers a provider
- **WHEN** an extension calls `registerContextProvider("rtk", getDataFn)` during load
- **THEN** the provider is stored in the global registry under the key "rtk"

#### Scenario: Duplicate registration replaces previous
- **WHEN** an extension registers a provider with an already-registered id
- **THEN** the previous provider is replaced

### Requirement: Context provider data retrieval
The supi-core package SHALL export a `getRegisteredContextProviders()` function that returns all registered providers. Each provider SHALL have an `id`, `label`, and a `getData()` function returning structured data.

#### Scenario: Retrieve all providers
- **WHEN** `getRegisteredContextProviders()` is called
- **THEN** all registered providers are returned in registration order

#### Scenario: No providers registered
- **WHEN** `getRegisteredContextProviders()` is called and no providers have been registered
- **THEN** an empty array is returned

### Requirement: Context provider data shape
Each context provider's `getData()` function SHALL return an object with string keys and values suitable for display: `{ [key: string]: string | number }`. Providers MAY return `null` to indicate no data is currently available.

#### Scenario: Provider returns data
- **WHEN** a provider's `getData()` is called and data is available
- **THEN** it returns an object like `{ rewrites: 42, fallbacks: 3 }`

#### Scenario: Provider returns null
- **WHEN** a provider's `getData()` is called and no data is available
- **THEN** it returns `null`

### Requirement: Registry cleanup
The supi-core package SHALL export a `clearRegisteredContextProviders()` function for test cleanup.

#### Scenario: Clear registry
- **WHEN** `clearRegisteredContextProviders()` is called
- **THEN** all registered providers are removed
