# SuPi installer

The SuPi installer manages direct Extension Package declarations in project and global scopes. Project-wide Installation Matrix and Installation Preset terms are defined in the root [glossary](../../GLOSSARY.md).

## Language

**Removal-only Cell**:
An Installation Matrix cell for an obsolete direct SuPi package declaration that can be retained or removed, but cannot be added to a scope where it is absent.
_Avoid_: deprecated package toggle, library install choice

**Blocked Installation Scope**:
An Installation Matrix scope with a recognized SuPi source that the installer cannot safely manage as individual official npm Extension Packages.
_Avoid_: disabled project, untrusted scope
