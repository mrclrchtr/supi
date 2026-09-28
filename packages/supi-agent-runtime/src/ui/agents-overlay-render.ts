import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Container,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { AgentsOverlayData, AgentsProfilePageEntry } from "./agents-overlay-data.ts";

const LIST_WINDOW_SIZE = 8;

/** Center a legend row using visible terminal columns, with clipping on narrow screens. */
export function centerLegend(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width - 2));
  const padding = Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2));
  return `${" ".repeat(padding)}${clipped}`;
}

/** Render effective Agent Profiles with human-only source provenance. */
export function renderProfilesSection(
  container: Container,
  data: AgentsOverlayData,
  selectedIndex: number,
  theme: Theme,
): void {
  const profiles = data.profilePages?.profiles ?? [];
  container.addChild(new Text(theme.fg("accent", theme.bold("Effective Agent Profiles")), 1, 0));
  if (profiles.length === 0) {
    container.addChild(new Text(theme.fg("dim", "No effective profiles."), 1, 0));
    return;
  }
  for (const [index, profile] of visibleWindow(profiles, selectedIndex).entries()) {
    const actualIndex = windowStart(profiles.length, selectedIndex) + index;
    const selected = actualIndex === selectedIndex;
    const label = `${selected ? "▶" : " "} ${profile.id} — ${profile.source ?? "unavailable"}`;
    container.addChild(
      new Text(selected ? theme.fg("accent", label) : theme.fg("dim", label), 1, 0),
    );
  }
  const profile = profiles[selectedIndex];
  if (profile) renderProfileDetails(container, profile, theme);
  const omitted = data.profilePages?.omittedProfileCount ?? 0;
  if (omitted > 0) {
    const noun = omitted === 1 ? "profile" : "profiles";
    container.addChild(
      new Text(
        theme.fg("warning", `${omitted} additional ${noun} omitted by the catalogue limit.`),
        1,
        0,
      ),
    );
  }
}

/** Render bounded Profile Diagnostics and their omission disclosure. */
export function renderDiagnosticsSection(
  container: Container,
  data: AgentsOverlayData,
  selectedIndex: number,
  theme: Theme,
): void {
  const diagnostics = data.profilePages?.diagnostics ?? [];
  container.addChild(new Text(theme.fg("accent", theme.bold("Profile Diagnostics")), 1, 0));
  if (diagnostics.length === 0) {
    container.addChild(new Text(theme.fg("success", "No Profile Diagnostics."), 1, 0));
    addDiagnosticOmission(container, data.profilePages?.omittedDiagnosticCount ?? 0, theme);
    return;
  }
  for (const [index, diagnostic] of visibleWindow(diagnostics, selectedIndex).entries()) {
    const actualIndex = windowStart(diagnostics.length, selectedIndex) + index;
    const selected = actualIndex === selectedIndex;
    const label = `${selected ? "▶" : " "} ${diagnostic.profileId} · ${diagnostic.code}`;
    container.addChild(
      new Text(selected ? theme.fg("accent", label) : theme.fg("dim", label), 1, 0),
    );
  }
  const diagnostic = diagnostics[selectedIndex];
  if (diagnostic) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(`${diagnostic.source} · ${diagnostic.code}`, 1, 0));
    container.addChild(new Text(diagnostic.message, 1, 0));
    if (diagnostic.directory)
      container.addChild(new Text(theme.fg("dim", diagnostic.directory), 1, 0));
  }
  addDiagnosticOmission(container, data.profilePages?.omittedDiagnosticCount ?? 0, theme);
}

function renderProfileDetails(
  container: Container,
  profile: AgentsProfilePageEntry,
  theme: Theme,
): void {
  container.addChild(new Spacer(1));
  container.addChild(
    new Text(
      `Description (${profile.fieldSources?.description ?? "unavailable"}): ${profile.description}`,
      1,
      0,
    ),
  );
  if (profile.unavailable) {
    container.addChild(new Text(theme.fg("error", `Unavailable: ${profile.unavailable}`), 1, 0));
    return;
  }
  container.addChild(new Text(`Strongest source: ${profile.source} — ${profile.directory}`, 1, 0));
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Model (${profile.fieldSources?.model ?? "session"}): ${profile.model} · Thinking (${profile.fieldSources?.thinking ?? "session"}): ${profile.thinking}`,
      ),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Timeout (${profile.fieldSources?.timeoutMinutes ?? "default"}): ${profile.timeoutMinutes ?? "none"}`,
      ),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Tools (${profile.fieldSources?.tools ?? "unavailable"}): ${profile.tools?.join(", ") || "none"}`,
      ),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Prompt (${profile.fieldSources?.systemPrompt ?? "unavailable"}): ${profile.systemPrompt} · Instructions (${profile.fieldSources?.instructionScopes ?? "unavailable"}): ${profile.instructionScopes?.join(", ") || "none"}`,
      ),
      1,
      0,
    ),
  );
}

function addDiagnosticOmission(container: Container, count: number, theme: Theme): void {
  if (count > 0)
    container.addChild(
      new Text(
        theme.fg("warning", `${count} additional diagnostics omitted by the overlay limit.`),
        1,
        0,
      ),
    );
}

function visibleWindow<T>(items: readonly T[], selected: number): readonly T[] {
  const start = windowStart(items.length, selected);
  return items.slice(start, start + LIST_WINDOW_SIZE);
}

function windowStart(length: number, selected: number, size = LIST_WINDOW_SIZE): number {
  return Math.min(Math.max(0, length - size), Math.max(0, selected - Math.floor(size / 2)));
}
