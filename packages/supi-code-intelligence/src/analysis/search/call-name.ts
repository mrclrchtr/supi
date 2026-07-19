interface CallableExpressionScanState {
  expectedClosers: string[];
  quote: "'" | '"' | "`" | null;
  escaped: boolean;
  normalized: string;
}

const CALLABLE_CLOSING_DELIMITERS = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
]);

/**
 * Remove nested payload text from a full callee expression before name matching.
 *
 * Tree-sitter may report outer callees such as
 * `items.filter(value => target(value)).sort` or `[target()].join()`. The
 * nested `target` call is a separate call site and must not make the outer
 * sort/join match a `target` query.
 */
export function callableExpressionForMatching(expression: string): string {
  const state: CallableExpressionScanState = {
    expectedClosers: [],
    quote: null,
    escaped: false,
    normalized: "",
  };

  for (const character of expression) {
    if (consumeQuotedCharacter(state, character)) continue;
    if (startQuotedPayload(state, character)) continue;
    if (startDelimitedPayload(state, character)) continue;
    if (state.expectedClosers.length > 0) {
      consumeNestedCloser(state, character);
      continue;
    }
    state.normalized += character;
  }
  return state.normalized;
}

function consumeQuotedCharacter(state: CallableExpressionScanState, character: string): boolean {
  if (!state.quote) return false;
  if (state.escaped) state.escaped = false;
  else if (character === "\\") state.escaped = true;
  else if (character === state.quote) state.quote = null;
  return true;
}

function startQuotedPayload(state: CallableExpressionScanState, character: string): boolean {
  if (character !== "'" && character !== '"' && character !== "`") return false;
  state.quote = character;
  if (state.expectedClosers.length === 0) state.normalized += `${character}${character}`;
  return true;
}

function startDelimitedPayload(state: CallableExpressionScanState, character: string): boolean {
  const closer = CALLABLE_CLOSING_DELIMITERS.get(character);
  if (!closer) return false;
  if (state.expectedClosers.length === 0) state.normalized += `${character}${closer}`;
  state.expectedClosers.push(closer);
  return true;
}

function consumeNestedCloser(state: CallableExpressionScanState, character: string): void {
  if (character === state.expectedClosers.at(-1)) state.expectedClosers.pop();
}
