import {
  DEBUG_IDENTITY_TRUNCATION_MARKER,
  MAX_DEBUG_IDENTITY_STRING,
  truncateDebugIdentity,
} from "@mrclrchtr/supi-core/debug";
import { describe, expect, it } from "vitest";

describe("truncateDebugIdentity", () => {
  it("keeps identity strings within the shared limit", () => {
    expect(truncateDebugIdentity("x".repeat(MAX_DEBUG_IDENTITY_STRING))).toHaveLength(
      MAX_DEBUG_IDENTITY_STRING,
    );
  });

  it("includes the marker inside the shared limit", () => {
    const result = truncateDebugIdentity("x".repeat(MAX_DEBUG_IDENTITY_STRING + 1));

    expect(result).toHaveLength(MAX_DEBUG_IDENTITY_STRING);
    expect(result.endsWith(DEBUG_IDENTITY_TRUNCATION_MARKER)).toBe(true);
  });
});
