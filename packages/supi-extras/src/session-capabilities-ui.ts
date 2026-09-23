import {
  type ExtensionUIContext,
  getSelectListTheme,
  getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  SelectList,
  type SettingItem,
  SettingsList,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type { SessionCapabilitySkill, SessionCapabilityState } from "@mrclrchtr/supi-core/session";

const MAX_VISIBLE_ROWS = 14;
const HEADER_HEIGHT = 2;

type Section = "tools" | "skills";

export interface CapabilityToolItem {
  name: string;
  description: string;
  source: string;
}

interface SelectorComponent {
  render(width: number): string[];
  invalidate(): void;
  handleInput(data: string): void;
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
}

interface CapabilitySelectorOptions {
  done: (result: undefined) => void;
  onChange: (id: string, value: string) => void;
  skills: SessionCapabilitySkill[] | undefined;
  state: SessionCapabilityState;
  theme: ExtensionUIContext["theme"];
  tools: CapabilityToolItem[];
  tui: { requestRender(): void };
}

function toolRows(tools: CapabilityToolItem[], state: SessionCapabilityState): SettingItem[] {
  const denied = new Set(state.toolDenylist);
  const grouped = new Map<string, CapabilityToolItem[]>();
  for (const tool of tools) {
    const group = grouped.get(tool.source) ?? [];
    group.push(tool);
    grouped.set(tool.source, group);
  }

  const rows: SettingItem[] = [
    {
      id: "disable-all-tools",
      label: "Disable All Tools",
      currentValue: "Apply",
      values: ["Apply"],
      description: "Disable all current eligible extension tools for this session.",
    },
    {
      id: "reset-tools",
      label: "Reset Tools",
      currentValue: "Reset",
      values: ["Reset"],
      description: "Restore tools that this selector disabled.",
    },
    {
      id: "reset-all",
      label: "Reset All",
      currentValue: "Reset",
      values: ["Reset"],
      description: "Restore all session capability overrides.",
    },
  ];

  for (const [source, sourceTools] of Array.from(grouped.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const disabledCount = sourceTools.filter((tool) => denied.has(tool.name)).length;
    const groupValue =
      disabledCount === 0 ? "Enabled" : disabledCount === sourceTools.length ? "Disabled" : "Mixed";
    rows.push({
      id: `package:${source}`,
      label: source,
      currentValue: groupValue,
      description: "Toggle current eligible tools from this PI source.",
      submenu: (_currentValue, done) => {
        const list = new SelectList(
          [
            { value: "disable", label: "Disable package tools" },
            { value: "enable", label: "Enable package tools" },
          ],
          4,
          getSelectListTheme(),
        );
        list.onSelect = (item) => done(item.value);
        list.onCancel = () => done();
        return list;
      },
    });
    for (const tool of sourceTools.sort((left, right) => left.name.localeCompare(right.name))) {
      rows.push({
        id: `tool:${tool.name}`,
        label: tool.name,
        currentValue: denied.has(tool.name) ? "Disabled" : "Enabled",
        values: ["Enabled", "Disabled"],
        description: tool.description,
      });
    }
  }

  return rows;
}

function skillRows(
  skills: SessionCapabilitySkill[] | undefined,
  state: SessionCapabilityState,
): SettingItem[] {
  const hidden = new Set(state.hiddenSkillNames);
  const rows: SettingItem[] = [
    {
      id: "hide-all-skills",
      label: "Hide All Skills",
      currentValue: "Apply",
      values: ["Apply"],
      description: "Hide all current model-visible skills for this session.",
    },
    {
      id: "reset-skills",
      label: "Reset Skills",
      currentValue: "Reset",
      values: ["Reset"],
      description: "Show all eligible skills in the model catalog.",
    },
    {
      id: "reset-all",
      label: "Reset All",
      currentValue: "Reset",
      values: ["Reset"],
      description: "Restore all session capability overrides.",
    },
  ];

  if (!skills) {
    rows.push({
      id: "skills-unavailable",
      label: "Skills are not available",
      currentValue: "",
      description: "Load supi-skills to manage skills here.",
    });
  } else if (skills.length === 0) {
    rows.push({ id: "no-skills", label: "No eligible skills", currentValue: "" });
  } else {
    for (const skill of skills) {
      rows.push({
        id: `skill:${skill.name}`,
        label: skill.name,
        currentValue: hidden.has(skill.name) ? "Hidden" : "Visible",
        values: ["Visible", "Hidden"],
        description: skill.description,
      });
    }
  }

  return rows;
}

/** Build the searchable selector for the current session. */
export function createCapabilitySelector(options: CapabilitySelectorOptions): SelectorComponent {
  const { done, onChange, state, theme, tools, skills, tui } = options;
  let section: Section = "tools";
  let list: SettingsList;

  const buildRows = (): SettingItem[] =>
    section === "tools" ? toolRows(tools, state) : skillRows(skills, state);
  const refreshValues = (): void => {
    for (const item of buildRows()) list.updateValue(item.id, item.currentValue);
    list.invalidate();
    tui.requestRender();
  };
  const createList = (): void => {
    list = new SettingsList(
      buildRows(),
      MAX_VISIBLE_ROWS,
      getSettingsListTheme(),
      (id, value) => {
        onChange(id, value);
        refreshValues();
      },
      () => done(undefined),
      { enableSearch: true },
    );
  };
  createList();

  return {
    render(width) {
      const tabs =
        section === "tools"
          ? `${theme.fg("accent", theme.bold("Tools"))}  ${theme.fg("dim", "Skills")}`
          : `${theme.fg("dim", "Tools")}  ${theme.fg("accent", theme.bold("Skills"))}`;
      return [
        truncateToWidth(theme.fg("accent", theme.bold("Session Capabilities")), width),
        truncateToWidth(
          `${tabs}  ${theme.fg("dim", "Tab: switch · Type: search · Esc: close")}`,
          width,
        ),
        ...list.render(width),
      ];
    },
    invalidate() {
      list.invalidate();
    },
    handleInput(data) {
      if (matchesKey(data, "tab")) {
        section = section === "tools" ? "skills" : "tools";
        createList();
        tui.requestRender();
        return;
      }
      list.handleInput(data);
      tui.requestRender();
    },
    handleMouse(event) {
      if (event.y < HEADER_HEIGHT) return undefined;
      return list.handleMouse({
        ...event,
        y: event.y - HEADER_HEIGHT,
        height: Math.max(0, event.height - HEADER_HEIGHT),
      });
    },
  };
}
