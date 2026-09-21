import { expectTypeOf, it } from "vitest";
import type {
  CompleteModelRequestOptions,
  CompleteSimpleModelRequestOptions,
} from "../../src/llm.ts";

it("excludes caller credentials and identity for dynamic provider APIs", () => {
  type DynamicOptions = CompleteModelRequestOptions<"custom-provider-api">;
  expectTypeOf<DynamicOptions["apiKey"]>().toEqualTypeOf<undefined>();
  expectTypeOf<DynamicOptions["env"]>().toEqualTypeOf<undefined>();
  expectTypeOf<DynamicOptions["sessionId"]>().toEqualTypeOf<undefined>();
});

it("excludes caller credentials and identity for a simple request", () => {
  expectTypeOf<CompleteSimpleModelRequestOptions["apiKey"]>().toEqualTypeOf<undefined>();
  expectTypeOf<CompleteSimpleModelRequestOptions["env"]>().toEqualTypeOf<undefined>();
  expectTypeOf<CompleteSimpleModelRequestOptions["sessionId"]>().toEqualTypeOf<undefined>();
  expectTypeOf<"reasoningEffort">().not.toExtend<keyof CompleteSimpleModelRequestOptions>();
});

it("excludes caller credentials and identity for a runtime-selected model", () => {
  expectTypeOf<CompleteModelRequestOptions["apiKey"]>().toEqualTypeOf<undefined>();
  expectTypeOf<CompleteModelRequestOptions["env"]>().toEqualTypeOf<undefined>();
  expectTypeOf<CompleteModelRequestOptions["sessionId"]>().toEqualTypeOf<undefined>();
});
