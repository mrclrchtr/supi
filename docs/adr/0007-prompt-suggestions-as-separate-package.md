# Prompt suggestions as a separate package

Prompt suggestion behavior will live in a new `@mrclrchtr/supi-prompt-suggestions` package rather than in `supi-extras`. The feature has its own editor wrapping, async suggestion lifecycle, settings, and tests, so a dedicated package gives it a clear boundary while keeping `supi-extras` focused on small quality-of-life utilities.
