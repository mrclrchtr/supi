import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import { createBoundedEvidenceList } from "../../analysis/evidence.ts";
import type {
  OrientationItem,
  OrientationResultData,
  OrientationSectionData,
} from "../../session/orientation-types.ts";
import { renderOrientationData } from "./markdown.ts";
import { code } from "./workspace-format.ts";

/** Keep instruction snippets outside the token budget but inside the final tool safety limit. */
export function fitWorkspaceInstructions(data: OrientationResultData): {
  data: OrientationResultData;
  omitted: boolean;
} {
  const instruction = data.sections.find((section) => section.key === "instructions");
  const metadata = data.instructions;
  if (!instruction || !metadata) return { data, omitted: false };
  const snippets = instruction.items.filter((item) => item.kind === "code");
  const items: OrientationItem[] = [];
  const files: typeof metadata.files = [];
  let omitted = false;
  for (const [index, file] of metadata.files.entries()) {
    const snippet = snippets[index];
    if (!snippet) {
      omitted = true;
      continue;
    }
    let count = snippet.lines.length;
    let candidate = fileItems(file.path, snippet.lines, count, file.totalLines);
    while (count > 0 && !fits(replaceInstructions(data, instruction, [...items, ...candidate]))) {
      count = Math.floor(count / 2);
      candidate = fileItems(file.path, snippet.lines, count, file.totalLines);
    }
    if (!fits(replaceInstructions(data, instruction, [...items, ...candidate]))) {
      omitted = true;
      continue;
    }
    items.push(...candidate);
    if (count > 0) files.push({ ...file, shownLines: count, truncated: count < file.totalLines });
    omitted ||= count < snippet.lines.length;
  }
  const result = replaceInstructions(data, instruction, items);
  return {
    data: {
      ...result,
      instructions: { files },
      notes: omitted
        ? [
            ...result.notes,
            "Some instruction text was not supplied. Read the complete captured result for the unread file paths and snippets.",
          ]
        : result.notes,
    },
    omitted,
  };
}

function fileItems(
  file: string,
  lines: readonly string[],
  count: number,
  total: number,
): OrientationItem[] {
  const items: OrientationItem[] = [{ kind: "subheading", text: file }];
  if (count > 0) items.push({ kind: "code", language: null, lines: lines.slice(0, count) });
  if (count < total)
    items.push({
      kind: "paragraph",
      text: `Instruction file truncated to ${count} of ${total} lines. Read ${code(file)} for the unread remainder.`,
    });
  return [...items, { kind: "blank" }];
}

function replaceInstructions(
  data: OrientationResultData,
  original: OrientationSectionData,
  items: OrientationItem[],
): OrientationResultData {
  const count = items.filter((item) => item.kind === "subheading").length;
  const section: OrientationSectionData = {
    ...original,
    items,
    evidenceLists: [
      createBoundedEvidenceList({
        key: "instructions.files",
        items: items.filter((item) => item.kind === "subheading"),
        totalCount: data.instructions?.files.length ?? count,
      }).metadata,
    ],
  };
  return {
    ...data,
    sections: data.sections.map((entry) => (entry.key === "instructions" ? section : entry)),
  };
}

function fits(data: OrientationResultData): boolean {
  const text = renderOrientationData(data);
  return (
    Buffer.byteLength(text) <= DEFAULT_MAX_BYTES - 2048 &&
    text.split("\n").length <= DEFAULT_MAX_LINES - 30
  );
}
