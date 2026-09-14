import { expectTypeOf, it } from "vitest";
import type { CompleteModelRequestOptions } from "../../src/llm.ts";

it("excludes caller credentials and identity for dynamic provider APIs", () => {
  type DynamicOptions = CompleteModelRequestOptions<"custom-provider-api">;
  expectTypeOf<DynamicOptions["apiKey"]>().toEqualTypeOf<undefined>();
  expectTypeOf<DynamicOptions["env"]>().toEqualTypeOf<undefined>();
  expectTypeOf<DynamicOptions["sessionId"]>().toEqualTypeOf<undefined>();
});

it("excludes caller credentials and identity for a runtime-selected model", () => {
  expectTypeOf<CompleteModelRequestOptions["apiKey"]>().toEqualTypeOf<undefined>();
  expectTypeOf<CompleteModelRequestOptions["env"]>().toEqualTypeOf<undefined>();
  expectTypeOf<CompleteModelRequestOptions["sessionId"]>().toEqualTypeOf<undefined>();
});
