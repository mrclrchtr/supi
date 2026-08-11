import { describe, expect, it } from "vitest";
import { assertFullDiffBytes, joinDiffParts, MAX_FULL_DIFF_BYTES } from "../../src/target/diff.ts";

describe("target diff assembly", () => {
  it("joins non-empty patch parts as exact bytes with canonical trailing newlines", () => {
    const invalidUtf8 = Buffer.from([0x66, 0x69, 0x72, 0x73, 0x74, 0xff]);

    expect(joinDiffParts([invalidUtf8, Buffer.alloc(0), Buffer.from("second\n")])).toEqual(
      Buffer.concat([invalidUtf8, Buffer.from("\nsecond\n")]),
    );
  });

  it("rejects oversized aggregate full-diff materialization", () => {
    expect(() => assertFullDiffBytes(MAX_FULL_DIFF_BYTES + 1)).toThrow(
      /inspect changed paths individually/,
    );
  });
});
