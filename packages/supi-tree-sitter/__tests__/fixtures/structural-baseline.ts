import { join } from "node:path";

export interface BaselineRecord {
  readonly id: string;
  readonly state: BaselineState;
  render(root: string): string;
}

export type BaselineState = "pending" | "ready";

export enum BaselinePriority {
  Low = 1,
  High = 2,
}

export class BaselineModel implements BaselineRecord {
  readonly state: BaselineState = "ready";

  constructor(readonly id: string) {}

  render(root: string): string {
    return join(root, this.id, this.state);
  }
}

export function createBaselineRecords(count: number): BaselineRecord[] {
  return Array.from({ length: count }, (_, index) => new BaselineModel(`record-${index}`));
}

export function renderBaselineRecords(records: readonly BaselineRecord[], root: string): string[] {
  return records.map((record) => record.render(root));
}

export function selectReadyRecords(records: readonly BaselineRecord[]): BaselineRecord[] {
  return records.filter((record) => record.state === "ready");
}

export function buildBaselineReport(count: number, root: string): string {
  const records = createBaselineRecords(count);
  const ready = selectReadyRecords(records);
  return renderBaselineRecords(ready, root).join("\n");
}

export const representativeBaseline = buildBaselineReport(50, "baseline");
