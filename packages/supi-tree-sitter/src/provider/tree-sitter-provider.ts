// Structural provider adapter — wraps TreeSitterService into the shared
// StructuralProvider contract from @mrclrchtr/supi-code-runtime.

import type {
  CalleesData,
  CodeResult,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type {
  CalleesAtResult,
  ExportRecord,
  ImportRecord,
  NodeAtResult,
  OutlineItem,
  TreeSitterResult,
  TreeSitterService,
} from "../types.ts";

/**
 * Create a StructuralProvider backed by a TreeSitterService.
 * Maps tree-sitter's nested `range` shapes into the flat range
 * fields used by the shared code-runtime types.
 */
export function createTreeSitterProvider(service: TreeSitterService): StructuralProvider {
  return {
    async calleesAt(file, line, character) {
      const result = await service.calleesAt(file, line, character);
      return mapTreeSitterResult(result, mapCalleesAtResult);
    },

    async exports(file) {
      const result = await service.exports(file);
      return mapTreeSitterResult(result, mapExportRecords);
    },

    async outline(file) {
      const result = await service.outline(file);
      return mapTreeSitterResult(result, mapOutlineItems);
    },

    async imports(file) {
      const result = await service.imports(file);
      return mapTreeSitterResult(result, mapImportRecords);
    },

    async nodeAt(file, line, character) {
      const result = await service.nodeAt(file, line, character);
      return mapTreeSitterResult(result, mapNodeAtResult);
    },
  };
}

// ── Generic result mapper ─────────────────────────────────────────────

function mapTreeSitterResult<T, U>(
  result: TreeSitterResult<T>,
  mapData: (data: T) => U,
): CodeResult<U> {
  switch (result.kind) {
    case "success":
      return { kind: "success", data: mapData(result.data) };
    case "unsupported-language":
      return { kind: "unsupported-language", file: result.file, message: result.message };
    case "file-access-error":
      return { kind: "file-access-error", file: result.file, message: result.message };
    case "validation-error":
      return { kind: "validation-error", message: result.message };
    case "runtime-error":
      return { kind: "runtime-error", message: result.message };
  }
}

// ── Data mappers (nested range → flat fields) ─────────────────────────

type RangeLike = {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
};

function takeRange(r: RangeLike) {
  return {
    startLine: r.startLine,
    startCharacter: r.startCharacter,
    endLine: r.endLine,
    endCharacter: r.endCharacter,
  };
}

function mapOutlineItems(items: OutlineItem[]): OutlineData[] {
  return items.map((item) => ({
    name: item.name,
    kind: item.kind,
    ...takeRange(item.range),
    children: item.children ? mapOutlineItems(item.children) : undefined,
  }));
}

function mapExportRecords(records: ExportRecord[]): ExportData[] {
  return records.map((record) => ({
    name: record.name,
    kind: record.kind,
    ...takeRange(record.range),
    moduleSpecifier: record.moduleSpecifier,
  }));
}

function mapImportRecords(records: ImportRecord[]): ImportData[] {
  return records.map((record) => ({
    moduleSpecifier: record.moduleSpecifier,
    ...takeRange(record.range),
  }));
}

function mapNodeAtResult(result: NodeAtResult): NodeAtData {
  return {
    type: result.type,
    ...takeRange(result.range),
    text: result.text,
    ancestry: result.ancestry.map((a) => ({
      type: a.type,
      ...takeRange(a.range),
    })),
  };
}

function mapCalleesAtResult(result: CalleesAtResult): CalleesData {
  return {
    enclosingScope: {
      name: result.enclosingScope.name,
      startLine: result.enclosingScope.range.startLine,
      endLine: result.enclosingScope.range.endLine,
    },
    callees: result.callees.map((c) => ({
      name: c.name,
      startLine: c.range.startLine,
    })),
  };
}
