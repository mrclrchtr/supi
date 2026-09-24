import type { SelectItem } from "@earendil-works/pi-tui";
import type { SessionCapabilitySkill, SessionCapabilityState } from "@mrclrchtr/supi-core/session";

/** A section shown by the session capability selector. */
export type CapabilitySection = "tools" | "skills";

/** A tool row that the session selector can display. */
export interface CapabilityToolItem {
  name: string;
  description: string;
  source: string;
}

/** One action, group, toggle, or information row in the selector. */
export interface CapabilityRow {
  id: string;
  label: string;
  currentValue: string;
  description?: string;
  indent: number;
  searchText: string;
  parentId?: string;
  toggleValues?: readonly [string, string];
  actions?: SelectItem[];
}

function actionRow(options: {
  id: string;
  label: string;
  value: string;
  description: string;
  action: SelectItem;
}): CapabilityRow {
  return {
    id: options.id,
    label: options.label,
    currentValue: options.value,
    description: options.description,
    indent: 2,
    searchText: options.label,
    actions: [options.action],
  };
}

function toolRows(tools: CapabilityToolItem[], state: SessionCapabilityState): CapabilityRow[] {
  const denied = new Set(state.toolDenylist);
  const grouped = new Map<string, CapabilityToolItem[]>();
  for (const tool of tools) {
    const group = grouped.get(tool.source) ?? [];
    group.push(tool);
    grouped.set(tool.source, group);
  }

  const rows: CapabilityRow[] = [
    actionRow({
      id: "disable-all-tools",
      label: "Disable All Tools",
      value: "Apply",
      description: "Disable all current eligible extension tools for this session.",
      action: { value: "Apply", label: "Disable all tools" },
    }),
    actionRow({
      id: "reset-tools",
      label: "Reset Tools",
      value: "Reset",
      description: "Restore tools that this selector disabled.",
      action: { value: "Reset", label: "Restore tools" },
    }),
    actionRow({
      id: "reset-all",
      label: "Reset All",
      value: "Reset",
      description: "Restore all session capability overrides.",
      action: { value: "Reset", label: "Restore all session overrides" },
    }),
  ];

  for (const [source, sourceTools] of Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const sortedTools = [...sourceTools].sort((a, b) => a.name.localeCompare(b.name));
    const disabledCount = sortedTools.filter((tool) => denied.has(tool.name)).length;
    const groupValue =
      disabledCount === 0 ? "Enabled" : disabledCount === sortedTools.length ? "Disabled" : "Mixed";
    const groupId = `package:${source}`;
    rows.push({
      id: groupId,
      label: source,
      currentValue: groupValue,
      description: "Toggle current eligible tools from this PI source.",
      indent: 2,
      searchText: source,
      actions: [
        { value: "disable", label: "Disable package tools" },
        { value: "enable", label: "Enable package tools" },
      ],
    });
    for (const tool of sortedTools) {
      rows.push({
        id: `tool:${tool.name}`,
        label: tool.name,
        currentValue: denied.has(tool.name) ? "Disabled" : "Enabled",
        description: tool.description,
        indent: 4,
        searchText: `${tool.name} ${source}`,
        parentId: groupId,
        toggleValues: ["Enabled", "Disabled"],
        actions: [
          { value: "Enabled", label: "Enable tool" },
          { value: "Disabled", label: "Disable tool" },
        ],
      });
    }
  }
  return rows;
}

function skillRows(
  skills: SessionCapabilitySkill[] | undefined,
  state: SessionCapabilityState,
): CapabilityRow[] {
  const hidden = new Set(state.hiddenSkillNames);
  const rows: CapabilityRow[] = [
    actionRow({
      id: "hide-all-skills",
      label: "Hide All Skills",
      value: "Apply",
      description: "Hide all current model-visible skills for this session.",
      action: { value: "Apply", label: "Hide all skills" },
    }),
    actionRow({
      id: "reset-skills",
      label: "Reset Skills",
      value: "Reset",
      description: "Show all eligible skills in the model catalog.",
      action: { value: "Reset", label: "Show all skills" },
    }),
    actionRow({
      id: "reset-all",
      label: "Reset All",
      value: "Reset",
      description: "Restore all session capability overrides.",
      action: { value: "Reset", label: "Restore all session overrides" },
    }),
  ];

  if (!skills) {
    rows.push({
      id: "skills-unavailable",
      label: "Skills are not available",
      currentValue: "",
      description: "Load supi-skills to manage skills here.",
      indent: 2,
      searchText: "Skills are not available",
    });
  } else if (skills.length === 0) {
    rows.push({
      id: "no-skills",
      label: "No eligible skills",
      currentValue: "",
      indent: 2,
      searchText: "No eligible skills",
    });
  } else {
    for (const skill of skills) {
      rows.push({
        id: `skill:${skill.name}`,
        label: skill.name,
        currentValue: hidden.has(skill.name) ? "Hidden" : "Visible",
        description: skill.description,
        indent: 2,
        searchText: skill.name,
        toggleValues: ["Visible", "Hidden"],
        actions: [
          { value: "Visible", label: "Show skill" },
          { value: "Hidden", label: "Hide skill" },
        ],
      });
    }
  }
  return rows;
}

/** Build the rows for one session capability section. */
export function buildCapabilityRows(
  section: CapabilitySection,
  tools: CapabilityToolItem[],
  skills: SessionCapabilitySkill[] | undefined,
  state: SessionCapabilityState,
): CapabilityRow[] {
  return section === "tools" ? toolRows(tools, state) : skillRows(skills, state);
}
