import { describe, expect, it } from "vitest";
import { SemanticInputRequestRetryGuard } from "../../src/client/client-request-enrollment.ts";
import { SemanticInputSynchronizationError } from "../../src/client/client-semantic-input-errors.ts";

function contentModifiedError(): Error & { code: number } {
  return Object.assign(new Error("content modified"), { code: -32801 });
}

describe("semantic input request retry guard", () => {
  it("allows one opted-in ContentModified retry and shares its budget", () => {
    const guard = new SemanticInputRequestRetryGuard(() => undefined, {
      retryContentModified: true,
    });
    const firstError = contentModifiedError();
    const first = guard.decide(firstError, 4);

    expect(first).toEqual({ kind: "retry", reason: "content-modified" });
    expect(guard.retryCount).toBe(1);
    expect(guard.retryReason).toBe("content-modified");

    const enrollmentError = new SemanticInputSynchronizationError("enrollment");
    const second = guard.decide(enrollmentError, 4);
    expect(second).toEqual({ kind: "stop", error: enrollmentError, reason: "enrollment" });
    expect(guard.retryCount).toBe(1);
  });

  it("does not retry ContentModified without the explicit policy", () => {
    const guard = new SemanticInputRequestRetryGuard(() => undefined);
    const error = contentModifiedError();

    expect(guard.decide(error, 4)).toEqual({ kind: "stop", error });
    expect(guard.retryCount).toBe(0);
  });

  it("does not spend the retry when a non-enrollment change blocks it", () => {
    const change = new SemanticInputSynchronizationError("content");
    const guard = new SemanticInputRequestRetryGuard(() => change, {
      retryContentModified: true,
    });

    expect(guard.decide(contentModifiedError(), 4)).toEqual({ kind: "stop", error: change });
    expect(guard.retryCount).toBe(0);
  });

  it("keeps enrollment retries available when ContentModified retries are disabled", () => {
    const guard = new SemanticInputRequestRetryGuard(() => undefined);
    const error = new SemanticInputSynchronizationError("enrollment");

    expect(guard.decide(error, 4)).toEqual({ kind: "retry", reason: "enrollment" });
    expect(guard.retryCount).toBe(1);
  });
});
