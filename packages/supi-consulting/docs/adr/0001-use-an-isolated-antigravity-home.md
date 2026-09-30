# Use an Isolated Antigravity Home

Consultations through Antigravity use a stable Isolated Antigravity Home under PI agent state instead of the user's normal Antigravity profile or a new home for each Consultation. This lets `supi-consulting` enforce the Antigravity Inspection Permission Set and exclude global customizations without changing user settings. Stable conversation state supports Conversation Handles; the trade-off is one separate sign-in and explicit manual cleanup.

On macOS, `agy` uses the system keychain for authentication. An isolated `HOME` has no default keychain until the package creates one. The package creates a package-owned `antigravity.keychain-db` with an empty password and exposes it as `Library/Keychains/login.keychain-db` through a symlink. It unlocks this private keychain before each `agy` process, without prompting for a password. It does not copy or use the normal profile's keychain.
