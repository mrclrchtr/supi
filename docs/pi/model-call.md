# Make model calls from an extension

`ExtensionAPI` (`pi`) does **not** expose a `callModel()` or `stream()` method. However, extensions can import the same
AI utilities pi uses internally:

```typescript
import {complete, stream, getModel} from "@earendil-works/pi-ai";
```

From the extension `ctx` you can get auth info for any registered model:

```typescript
const model = getModel("openai", "gpt-5.2"); // or ctx.modelRegistry.find("openai", "gpt-5.2")
const auth = model ? await ctx.modelRegistry.getApiKeyAndHeaders(model) : undefined;

const response = await complete(
    model,
    {messages: [{role: "user", content: [{type: "text", text: "Summarize this"}]}]},
    {
        apiKey: auth.apiKey,
        headers: auth.headers,
        reasoningEffort: "high",
    },
);
```

### What's available from `@earendil-works/pi-ai`

| Function                                  | Purpose                  |
|-------------------------------------------|--------------------------|
| `complete(model, context, options)`       | Non-streaming completion |
| `stream(model, context, options)`         | Streaming completion     |
| `completeSimple(model, context, options)` | Simplified non-streaming |
| `streamSimple(model, context, options)`   | Simplified streaming     |
| `getModel(provider, id)`                  | Look up a built-in model |
| `calculateCost(model, usage)`             | Cost calculation         |

### Practical example

The built-in `summarize.ts` extension does exactly this:
[
`examples/extensions/summarize.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/summarize.ts)