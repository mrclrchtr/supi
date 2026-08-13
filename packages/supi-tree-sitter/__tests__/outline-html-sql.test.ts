import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession, type OutlineItem } from "../src/api.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "supi-outline-html-sql-"));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

async function outline(file: string, source: string): Promise<OutlineItem[]> {
  writeFileSync(join(cwd, file), source);
  const session = createTreeSitterSession(cwd);
  try {
    const result = await session.outline(file);
    expect(result.kind).toBe("success");
    return result.kind === "success" ? result.data : [];
  } finally {
    await session.dispose();
  }
}

describe("HTML and SQL outline extraction", () => {
  it("extracts nested static HTML id declarations without treating other attributes as ids", async () => {
    const items = await outline(
      "sample.html",
      `<!doctype html>
<html id="root">
  <head><style id='theme'>body { color: red }</style></head>
  <body>
    <main id=app>
      <section class="plain"><h1 id="title">Hi</h1></section>
      <img id="logo" src="logo.png">
      <input ID="search" />
      <div id=""></div>
      <custom-card data-id="ignored"></custom-card>
    </main>
    <script id="boot">start()</script>
  </body>
</html>
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([["root", "element"]]);
    expect(items[0]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["theme", "element"],
      ["app", "element"],
      ["boot", "element"],
    ]);
    expect(items[0]?.children?.[1]?.children?.map(({ name, kind }) => [name, kind])).toEqual([
      ["title", "element"],
      ["logo", "element"],
      ["search", "element"],
    ]);
    expect(items[0]?.range.startLine).toBe(2);
  });

  it("extracts SQL schema objects and table/type members without query-local names", async () => {
    const items = await outline(
      "schema.sql",
      `CREATE SCHEMA accounting;
CREATE TYPE accounting.status AS ENUM ('open', 'can''t');
CREATE TYPE accounting.address AS (street text, zip text);
CREATE TABLE accounting.invoices (
  id bigint PRIMARY KEY,
  amount numeric NOT NULL,
  code text CONSTRAINT 'valid_code' CHECK (code <> ''),
  CONSTRAINT positive_amount CHECK (amount > 0)
);
CREATE TABLE accounting.events (id bigint) PARTITIONED BY (day text);
CREATE VIEW accounting.open_invoices AS SELECT id FROM accounting.invoices;
CREATE MATERIALIZED VIEW accounting.invoice_totals AS SELECT sum(amount) FROM accounting.invoices;
CREATE INDEX 'invoices_amount_idx' ON accounting.invoices (amount);
CREATE SEQUENCE accounting.invoice_seq;
CREATE FUNCTION accounting.total_for(customer_id bigint) RETURNS numeric LANGUAGE SQL AS $$ SELECT 1 $$;
CREATE TRIGGER invoice_update BEFORE UPDATE ON accounting.invoices FOR EACH ROW EXECUTE FUNCTION update_invoice();
CREATE DATABASE billing;
CREATE ROLE billing_reader;
CREATE EXTENSION pgcrypto;
WITH recent AS (SELECT * FROM accounting.invoices) SELECT * FROM recent;
`,
    );

    expect(items.map(({ name, kind }) => [name, kind])).toEqual([
      ["accounting", "schema"],
      ["status", "enum"],
      ["address", "type"],
      ["invoices", "table"],
      ["events", "table"],
      ["open_invoices", "view"],
      ["invoice_totals", "view"],
      ["invoices_amount_idx", "index"],
      ["invoice_seq", "sequence"],
      ["total_for", "function"],
      ["invoice_update", "trigger"],
      ["billing", "database"],
      ["billing_reader", "role"],
      ["pgcrypto", "extension"],
    ]);
    expect(items.find(({ name }) => name === "status")?.children).toEqual([
      expect.objectContaining({ name: "open", kind: "enum-member" }),
      expect.objectContaining({ name: "can't", kind: "enum-member" }),
    ]);
    expect(items.find(({ name }) => name === "address")?.children).toEqual([
      expect.objectContaining({ name: "street", kind: "field" }),
      expect.objectContaining({ name: "zip", kind: "field" }),
    ]);
    expect(items.find(({ name }) => name === "invoices")?.children).toEqual([
      expect.objectContaining({ name: "id", kind: "field" }),
      expect.objectContaining({ name: "amount", kind: "field" }),
      expect.objectContaining({ name: "code", kind: "field" }),
      expect.objectContaining({ name: "valid_code", kind: "constraint" }),
      expect.objectContaining({ name: "positive_amount", kind: "constraint" }),
    ]);
    expect(items.find(({ name }) => name === "events")?.children).toEqual([
      expect.objectContaining({ name: "id", kind: "field" }),
      expect.objectContaining({ name: "day", kind: "field" }),
    ]);
    expect(items.some(({ name }) => name === "recent" || name === "customer_id")).toBe(false);
  });
});
