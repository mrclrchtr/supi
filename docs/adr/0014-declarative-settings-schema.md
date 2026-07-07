# Declarative Settings Schema for SuPi Settings

The existing `registerConfigSettings` contribution shape (`buildItems` + `persistChange` callbacks) is imperative, per-package, and has no vocabulary for scoped-inheritance, source state, or explicit-vs-inherited value semantics. It cannot cleanly support Project Override / Inherited Value display, Inherit/Reset actions, source badges, or validation that treats explicit values as distinct from key deletion.

We are replacing the imperative contribution shape with a Declarative Settings Schema in `supi-core`. The shared settings module will own scope-inheritance resolution, source-badge rendering, validation, persistence, and Inherit/Reset actions behind one deep settings interface. Custom settings controls remain available as an escape hatch for nested or unusual config, but must report the same source-state metadata so the UI stays consistent.
