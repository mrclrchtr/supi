import type { TSchema } from "typebox";

type JsonContainerType = "object" | "array";

function containerProperties(parameters: TSchema): Map<string, JsonContainerType> {
  const properties = (parameters as { properties?: Record<string, { type?: unknown }> }).properties;
  const containers = new Map<string, JsonContainerType>();
  for (const [name, schema] of Object.entries(properties ?? {})) {
    if (schema.type === "object" || schema.type === "array") containers.set(name, schema.type);
  }
  return containers;
}

function parseContainer(value: string, type: JsonContainerType): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  return Array.isArray(parsed) === (type === "array") ? parsed : undefined;
}

/**
 * Build a `prepareArguments` hook that decodes top-level object and array arguments a model sent
 * as a JSON string, such as `target: "{\"symbol\":{…}}"`. Models do this for nested arguments; the
 * call then failed schema validation (`target: expected object, got string`) and had to be retried.
 *
 * Only a string that parses to the container type the schema declares is replaced. Everything
 * else is returned unchanged, so schema validation still reports it. Returns `undefined` when the
 * schema has no top-level object or array property.
 */
export function createJsonStringArgumentDecoder(
  parameters: TSchema,
): ((args: unknown) => unknown) | undefined {
  const containers = containerProperties(parameters);
  if (containers.size === 0) return undefined;

  return (args) => {
    if (args === null || typeof args !== "object" || Array.isArray(args)) return args;
    let decoded: Record<string, unknown> | undefined;
    for (const [name, type] of containers) {
      const value = (args as Record<string, unknown>)[name];
      if (typeof value !== "string") continue;
      const parsed = parseContainer(value, type);
      if (parsed === undefined) continue;
      decoded ??= { ...(args as Record<string, unknown>) };
      decoded[name] = parsed;
    }
    return decoded ?? args;
  };
}
