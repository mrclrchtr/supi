/**
 * Retrospective producers: `--source` value (the Debug event `source`) mapped to the Debug
 * event category it records. Add a producer here; validation, summaries, and snapshot reads
 * derive from this table.
 */
export const PRODUCERS = Object.freeze({
  "supi-agent": "agent-run-retrospective",
  "supi-review": "agent-run-retrospective",
  "supi-debug": "tooling-retrospective",
});

export const PRODUCER_NAMES = Object.freeze(Object.keys(PRODUCERS));

const CATEGORIES = new Set(Object.values(PRODUCERS));

/** Return whether a Debug event category holds retrospective reports. */
export function isRetrospectiveCategory(category) {
  return CATEGORIES.has(category);
}

/** Return whether `source` is a producer that records `category`. */
export function isProducerEvent(source, category) {
  return Object.hasOwn(PRODUCERS, source) && PRODUCERS[source] === category;
}

/** Return whether `source` names a known producer. */
export function isProducer(source) {
  return Object.hasOwn(PRODUCERS, source);
}
