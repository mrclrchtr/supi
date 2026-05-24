// Tree-sitter structural substrate adapter — wraps TreeSitterService into StructuralSubstrate.

import {
  createTreeSitterSession,
  getSessionTreeSitterService,
} from "@mrclrchtr/supi-tree-sitter/api";
import type {
  CalleesData,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  StructuralResult,
  StructuralSubstrate,
} from "./types.ts";

/**
 * Create a StructuralSubstrate backed by the tree-sitter service.
 *
 * Reuses the shared session-scoped service when available, falling back to
 * a short-lived owned session (disposed after the operation).
 */
export function createStructuralSubstrate(cwd: string): StructuralSubstrate {
  return {
    calleesAt: (file, line, character) =>
      withSession(cwd, (s) => s.calleesAt(file, line, character)).then(mapResult(mapCallees)),

    exports: (file) => withSession(cwd, (s) => s.exports(file)).then(mapResult(mapExports)),

    outline: (file) => withSession(cwd, (s) => s.outline(file)).then(mapResult(mapOutline)),

    imports: (file) => withSession(cwd, (s) => s.imports(file)).then(mapResult(mapImports)),

    nodeAt: (file, line, character) =>
      withSession(cwd, (s) => s.nodeAt(file, line, character)).then(mapResult(mapNodeAt)),
  };
}

// ── Session acquisition ─────────────────────────────────────────────

async function withSession<T>(
  cwd: string,
  fn: (session: {
    calleesAt: (f: string, l: number, c: number) => Promise<unknown>;
    exports: (f: string) => Promise<unknown>;
    outline: (f: string) => Promise<unknown>;
    imports: (f: string) => Promise<unknown>;
    nodeAt: (f: string, l: number, c: number) => Promise<unknown>;
  }) => Promise<T>,
): Promise<T> {
  const current = getSessionTreeSitterService(cwd);
  if (current.kind === "ready") {
    return fn(current.service);
  }
  const session = createTreeSitterSession(cwd);
  try {
    return await fn(session);
  } finally {
    session.dispose();
  }
}

// ── Generic result mapper ───────────────────────────────────────────

function mapResult<T>(mapData: (data: unknown) => T): (raw: unknown) => StructuralResult<T> {
  return (raw) => {
    const r = raw as { kind: string; data?: unknown };
    if (r.kind === "success") {
      return { kind: "success", data: mapData(r.data) };
    }
    return raw as StructuralResult<T>;
  };
}

// ── Mapping helpers (unpack nested `range` into flat fields) ────────

type RangeLike = {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
};

function takeRange(r: RangeLike): {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
} {
  return {
    startLine: r.startLine,
    startCharacter: r.startCharacter,
    endLine: r.endLine,
    endCharacter: r.endCharacter,
  };
}

function mapExports(data: unknown): ExportData[] {
  const items = data as Array<{
    name: string;
    kind: string;
    range: RangeLike;
    moduleSpecifier?: string;
  }>;
  return items.map((item) => ({
    name: item.name,
    kind: item.kind,
    ...takeRange(item.range),
    moduleSpecifier: item.moduleSpecifier,
  }));
}

function mapOutline(data: unknown): OutlineData[] {
  const items = data as Array<{
    name: string;
    kind: string;
    range: RangeLike;
    children?: unknown[];
  }>;
  return items.map((item) => ({
    name: item.name,
    kind: item.kind,
    ...takeRange(item.range),
    children: item.children ? mapOutline(item.children) : undefined,
  }));
}

function mapImports(data: unknown): ImportData[] {
  const items = data as Array<{
    moduleSpecifier: string;
    range: RangeLike;
  }>;
  return items.map((item) => ({
    moduleSpecifier: item.moduleSpecifier,
    ...takeRange(item.range),
  }));
}

function mapNodeAt(data: unknown): NodeAtData {
  const d = data as {
    type: string;
    range: RangeLike;
    text: string;
    ancestry: Array<{ type: string; range: RangeLike }>;
  };
  return {
    type: d.type,
    ...takeRange(d.range),
    text: d.text,
    ancestry: d.ancestry.map((a) => ({
      type: a.type,
      ...takeRange(a.range),
    })),
  };
}

function mapCallees(data: unknown): CalleesData {
  const d = data as {
    enclosingScope: { name: string; range: RangeLike };
    callees: Array<{ name: string; range: RangeLike }>;
  };
  return {
    enclosingScope: {
      name: d.enclosingScope.name,
      startLine: d.enclosingScope.range.startLine,
      endLine: d.enclosingScope.range.endLine,
    },
    callees: d.callees.map((c) => ({
      name: c.name,
      startLine: c.range.startLine,
    })),
  };
}
