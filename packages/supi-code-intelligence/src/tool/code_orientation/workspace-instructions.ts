import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import { createBoundedEvidenceList } from "../../analysis/evidence.ts";
import type {
  OrientationItem,
  OrientationResultData,
  OrientationSectionData,
} from "../../session/orientation-types.ts";
import { renderOrientationData } from "./markdown.ts";
import { code } from "./workspace-format.ts";

/**
 * Keep instruction text outside the navigation token budget but inside Pi's tool output limit.
 *
 * The output limit is shared by all instruction files of the result. The deepest file, which is
 * the most specific for the focus, gets the budget first; shallower files get what remains. The
 * output keeps the shallowest-first order. A file that does not fit is cut after the largest
 * number of whole lines that fits, with a note naming the line to continue reading from.
 * `omitted` reports files left out entirely, which only the captured result lists.
 * `reservedBytes` keeps room for text the caller adds after fitting.
 */
export function fitWorkspaceInstructions(
  data: OrientationResultData,
  reservedBytes = 0,
): {
  data: OrientationResultData;
  omitted: boolean;
} {
  const instruction = data.sections.find((section) => section.key === "instructions");
  const metadata = data.instructions;
  if (!instruction || !metadata) return { data, omitted: false };
  const snippets = instruction.items.filter((item) => item.kind === "code");
  // orientation-workflow.ts emits exactly one code item per collected file, in file order.
  const files = metadata.files.map((file, index) => ({ file, lines: snippets[index]?.lines }));
  // Shown line count per file; undefined means the file is omitted entirely.
  const counts: Array<number | undefined> = files.map(() => undefined);
  const render = () =>
    replaceInstructions(
      data,
      instruction,
      files.flatMap(({ file, lines }, index) => {
        const count = counts[index];
        return count === undefined || !lines
          ? []
          : fileItems(file.path, lines, count, file.totalLines);
      }),
    );
  for (let index = files.length - 1; index >= 0; index--) {
    const lines = files[index].lines;
    if (!lines) continue;
    counts[index] = largestFittingCount(lines.length, (count) => {
      counts[index] = count;
      return fits(render(), reservedBytes);
    });
  }
  const result = render();
  // A file cut even without other instruction files can never be shown in full, so it is
  // recorded as surfaced after one delivery instead of being supplied again on every call.
  const fitsAlone = (index: number) => {
    const lines = files[index].lines ?? [];
    const items = fileItems(files[index].file.path, lines, lines.length, lines.length);
    return fits(replaceInstructions(data, instruction, items), reservedBytes);
  };
  const fitted = files.flatMap(({ file }, index) => {
    const count = counts[index];
    if (count === undefined || count === 0) return [];
    const truncated = count < file.totalLines;
    return [
      {
        ...file,
        shownLines: count,
        truncated,
        ...(truncated && !fitsAlone(index) ? { exceedsOutputLimit: true } : {}),
      },
    ];
  });
  const omitted = counts.some((count) => count === undefined);
  return {
    data: {
      ...result,
      instructions: { files: fitted },
      notes: omitted
        ? [
            ...result.notes,
            "Some instruction files did not fit. The captured result lists their paths.",
          ]
        : result.notes,
    },
    omitted,
  };
}

/** Largest line count in `0..total` that fits, or undefined when not even the heading fits. */
function largestFittingCount(
  total: number,
  fitsWith: (count: number) => boolean,
): number | undefined {
  if (fitsWith(total)) return total;
  if (!fitsWith(0)) return undefined;
  let low = 0;
  let high = total - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fitsWith(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
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
      text: `Instruction file truncated to ${count} of ${total} lines. Read ${code(file)} with offset ${count + 1} for the unread remainder.`,
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

function fits(data: OrientationResultData, reservedBytes: number): boolean {
  const text = renderOrientationData(data);
  return (
    Buffer.byteLength(text) <= DEFAULT_MAX_BYTES - 2048 - reservedBytes &&
    text.split("\n").length <= DEFAULT_MAX_LINES - 30
  );
}
