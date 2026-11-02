import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Type } from "typebox";
import { Value } from "typebox/value";
import {
  FetchError,
  type FetchOptions,
  type FetchResult,
  fetchWithNegotiation,
} from "../../fetch.ts";
import { WEB_FETCH_MODES, type WebFetchMode } from "./input.ts";
import { FIRECRAWL_METADATA_MAX_CHARS, type FirecrawlRetrieval } from "./result-schema.ts";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const providerPageSchema = Type.Object({
  success: Type.Literal(true),
  data: Type.Object({
    markdown: Type.String(),
    warning: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    metadata: Type.Optional(
      Type.Object({
        title: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
        statusCode: Type.Optional(Type.Integer()),
        cacheState: Type.Optional(Type.String({ maxLength: FIRECRAWL_METADATA_MAX_CHARS })),
        cachedAt: Type.Optional(Type.String({ maxLength: FIRECRAWL_METADATA_MAX_CHARS })),
      }),
    ),
  }),
});

const nonPublicIPv4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  nonPublicIPv4.addSubnet(address, prefix, "ipv4");

// Conservatively permit global-unicast IPv6 only, excluding special-purpose ranges.
// This also rejects loopback, link-local, unique-local, and IPv4-mapped literals.
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");
const specialIPv6 = new BlockList();
specialIPv6.addSubnet("2001::", 23, "ipv6");
specialIPv6.addSubnet("2001:db8::", 32, "ipv6");
specialIPv6.addSubnet("2002::", 16, "ipv6");
specialIPv6.addSubnet("3fff::", 20, "ipv6");

/** A page body with provenance when an external provider supplied it. */
export interface PageFetchResult extends FetchResult {
  retrieval?: FirecrawlRetrieval;
}

/** Honor the explicit route; Firecrawl requires a user opt-in even for fallback. */
export async function fetchPage(
  url: string,
  options: FetchOptions & { fetchMode?: WebFetchMode; firecrawlEnabled: boolean },
): Promise<PageFetchResult> {
  const mode = options.fetchMode ?? "direct";
  if (!WEB_FETCH_MODES.includes(mode)) {
    throw new FetchError(
      'Unsupported fetch_mode; select "direct", "firecrawl_fallback", or "firecrawl"',
    );
  }
  if (mode !== "direct" && !options.firecrawlEnabled) {
    throw new FetchError("Firecrawl is disabled. Enable Web > Firecrawl in /supi-settings.");
  }
  if (mode === "firecrawl") return fetchWithFirecrawl(url, options);

  try {
    return await fetchWithNegotiation(url, options);
  } catch (error) {
    options.signal?.throwIfAborted();
    if (!(error instanceof FetchError) || error.status !== 403) throw error;
    if (mode === "direct") {
      const setupHint = options.firecrawlEnabled
        ? ""
        : "requires Firecrawl enabled in /supi-settings and FIRECRAWL_API_KEY; ";
      throw new FetchError(
        `${error.message}. For a public page, retry with fetch_mode: "firecrawl_fallback" (${setupHint}shares the URL and may consume credits).`,
        { status: 403, cause: error },
      );
    }
  }
  return fetchWithFirecrawl(url, options);
}

async function fetchWithFirecrawl(url: string, options: FetchOptions): Promise<PageFetchResult> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new FetchError("Firecrawl requires FIRECRAWL_API_KEY");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    return await abortable(requestFirecrawl(url, { key, timeoutMs, signal }), signal);
  } catch (error) {
    options.signal?.throwIfAborted();
    if (timeout.aborted) {
      // biome-ignore lint/style/useErrorCause: retain the timeout reason, not possibly credential-bearing provider errors
      throw new FetchError(`Firecrawl timed out after ${timeoutMs}ms`, {
        cause: timeout.reason,
      });
    }
    if (error instanceof FetchError) throw error;
    // biome-ignore lint/style/useErrorCause: transport/parse errors may reflect Authorization; never retain them as causes
    throw new FetchError("Firecrawl request failed");
  }
}

async function requestFirecrawl(
  url: string,
  options: { key: string; timeoutMs: number; signal: AbortSignal },
): Promise<PageFetchResult> {
  options.signal.throwIfAborted();
  const target = await publicTarget(url);
  options.signal.throwIfAborted();
  const response = await fetch(FIRECRAWL_URL, {
    method: "POST",
    redirect: "error",
    signal: options.signal,
    headers: { Authorization: `Bearer ${options.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: target.href,
      formats: ["markdown"],
      onlyMainContent: true,
      // The provider requires >= 1s; the local signal still enforces a shorter budget.
      timeout: Math.max(1_000, Math.min(options.timeoutMs, 300_000)),
    }),
  });
  if (!response.ok) {
    throw new FetchError(`Firecrawl failed: HTTP ${response.status}`, {
      status: response.status,
    });
  }
  const body: unknown = await response.json();
  if (!Value.Check(providerPageSchema, body)) {
    throw new FetchError("Firecrawl returned an unsuccessful or invalid response");
  }
  const { markdown, metadata, warning } = body.data;
  if (
    [markdown, metadata?.cacheState, metadata?.cachedAt].some((value) =>
      value?.includes(options.key),
    )
  ) {
    throw new FetchError("Firecrawl returned credential-bearing content");
  }
  if (!markdown.trim() || warning?.trim()) {
    throw new FetchError(
      "Firecrawl returned empty content or a warning; content may be incomplete",
    );
  }
  const status = metadata?.statusCode;
  if (
    (status !== undefined && status !== 304 && (status < 200 || status >= 300)) ||
    isAccessBlock(metadata?.title, markdown)
  ) {
    throw new FetchError("Firecrawl returned an error or access-block page, not source content");
  }
  // Keep only allowlisted provenance, never the raw provider envelope or credentials.
  return {
    url,
    text: markdown,
    contentType: "text/markdown",
    isMarkdown: true,
    isPlainText: false,
    retrieval: {
      provider: "firecrawl",
      ...(metadata?.cacheState ? { cacheState: metadata.cacheState } : {}),
      ...(metadata?.cachedAt ? { cachedAt: metadata.cachedAt } : {}),
    },
  };
}

/** Validate before disclosing a URL. DNS checks are conservative, not a sandbox for the reader. */
async function publicTarget(url: string): Promise<URL> {
  const target = new URL(url);
  const hostname = target.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (target.username || target.password) {
    throw new FetchError("Firecrawl does not accept URLs containing credentials");
  }
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new FetchError("Firecrawl requires a public URL");
  } else {
    if (
      !hostname.includes(".") ||
      /(?:^|\.)(?:localhost|local|localdomain|internal|test|invalid|example|onion|lan|home|corp)$|\.home\.arpa$/i.test(
        hostname,
      )
    ) {
      throw new FetchError("Firecrawl requires a public hostname");
    }
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new FetchError("Firecrawl requires exclusively public DNS addresses");
    }
  }
  // Fragments are not part of HTTP requests and may contain client-only information.
  target.hash = "";
  return target;
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !nonPublicIPv4.check(address, "ipv4");
  return (
    isIP(address) === 6 && globalIPv6.check(address, "ipv6") && !specialIPv6.check(address, "ipv6")
  );
}

function isAccessBlock(title: string | string[] | undefined, markdown: string): boolean {
  const titles = Array.isArray(title) ? title : [title];
  return (
    titles.some((value) =>
      /^(?:attention required!?|just a moment[.!…]*|access denied|403 forbidden|verify (?:you are|you're) human|checking your browser)(?:\s*[-|].*)?$/i.test(
        value?.trim() ?? "",
      ),
    ) ||
    // Only a page-leading heading signals a block; documentation may discuss these errors.
    /^#{1,2}\s+(?:Sorry, you have been blocked|Access denied|403 Forbidden|Just a moment\.{0,3})\s*$/i.test(
      markdown.trimStart().split("\n", 1)[0] ?? "",
    )
  );
}

/** Bound DNS, HTTP, and response-body work; an outstanding lookup cannot trigger a later request. */
function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}
