# Keep Installation Matrix choices separate from activation

The SuPi Installation Matrix manages direct package declarations in separate Project and Global columns, not effective capability availability. Clearing Project removes only that declaration; it does not disable an inherited global package, reset resource filters, or suppress behavior supplied by another package. This keeps package installation separate from Pi and SuPi activation controls, at the cost of requiring clear availability labels and removal notices; see the [installer design](../conventions/installer.md).
