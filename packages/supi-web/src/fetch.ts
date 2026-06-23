/**
 * HTTP fetching with content negotiation and Markdown sniffing.
 */

// biome-ignore lint/style/noExcessiveLinesPerFile: expanded guessLanguage map pushes past the threshold; nursery rule, not stable
const USER_AGENT = "Mozilla/5.0 (compatible; supi-web/1.0; +https://github.com/mrclrchtr/supi)";
const ACCEPT_SIBLING = "text/markdown,text/plain;q=0.9,*/*;q=0.1";
const DEFAULT_TIMEOUT_MS = 30_000;
const SNIFF_BYTES = 8192;

/** Validated URL result. */
export interface FetchResult {
  /** Final URL after redirects. */
  url: string;
  /** Response body text. */
  text: string;
  /** Detected content type (lowercased). */
  contentType: string;
  /** Whether the body is raw Markdown (no HTML conversion needed). */
  isMarkdown: boolean;
  /** Whether the body is plain text that should be fenced as code. */
  isPlainText: boolean;
}

/** Fetch options. */
export interface FetchOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Validate that a string is a real http(s) URL. */
export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Fetch a URL with full content negotiation and sniffing. */
export async function fetchWithNegotiation(
  url: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { signal } = options;

  // 1. Try HEAD negotiation for Markdown
  const headResult = await tryHeadNegotiation(url, timeoutMs, signal);
  if (headResult) return headResult;

  // 2. Range GET to sniff content type
  const sniffResult = await trySniffNegotiation(url, timeoutMs, signal);
  if (sniffResult) return sniffResult;

  // 3. Try sibling .md URLs
  const siblingResult = await trySiblingNegotiation(url, timeoutMs, signal);
  if (siblingResult) return siblingResult;

  // 4. Full GET as HTML → convert to Markdown
  return fetchAsHtml(url, timeoutMs, signal);
}

async function tryHeadNegotiation(
  url: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<FetchResult | null> {
  try {
    const headRes = await timedFetch(
      url,
      { method: "HEAD", redirect: "follow", headers: { "User-Agent": USER_AGENT } },
      timeoutMs,
      signal,
    );
    if (!headRes.ok) return null;
    const ct = headRes.headers.get("content-type") || "";
    if (!isMarkdownContentType(ct)) return null;

    const getRes = await timedFetch(
      url,
      { method: "GET", redirect: "follow", headers: { "User-Agent": USER_AGENT } },
      timeoutMs,
      signal,
    );
    if (!getRes.ok)
      throw new FetchError(`Fetch failed: ${getRes.status} ${getRes.statusText}`, {
        status: getRes.status,
      });
    return {
      url: getRes.url || url,
      text: await getRes.text(),
      contentType: ct,
      isMarkdown: true,
      isPlainText: false,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

async function trySniffNegotiation(
  url: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<FetchResult | null> {
  try {
    const sniffRes = await timedFetch(
      url,
      {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Range: `bytes=0-${SNIFF_BYTES - 1}` },
      },
      timeoutMs,
      signal,
    );
    const sniffText = await readPartialText(sniffRes, SNIFF_BYTES);
    const ct = sniffRes.headers.get("content-type") || "";
    const finalUrl = sniffRes.url || url;

    if (!sniffRes.ok || isHtml(sniffText)) return null;
    if (isMarkdownCandidate(ct, finalUrl, sniffText)) {
      return fetchFullTextResult({
        url,
        timeoutMs,
        signal,
        contentType: ct,
        kind: MARKDOWN_RESPONSE_KIND,
        headers: { "User-Agent": USER_AGENT },
      });
    }
    if (isPlainTextCandidate(ct, finalUrl, sniffText)) {
      return fetchFullTextResult({
        url,
        timeoutMs,
        signal,
        contentType: ct,
        kind: PLAIN_TEXT_RESPONSE_KIND,
        headers: { "User-Agent": USER_AGENT },
      });
    }
    return null;
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

async function trySiblingNegotiation(
  url: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<FetchResult | null> {
  for (const sibling of generateSiblingUrls(url)) {
    try {
      const result = await fetchMarkdownSibling(sibling, timeoutMs, signal);
      if (result) return result;
    } catch (err) {
      if (signal?.aborted) throw err;
      // Try next sibling
    }
  }
  return null;
}

async function fetchMarkdownSibling(
  sibling: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<FetchResult | null> {
  const headers = { "User-Agent": USER_AGENT, Accept: ACCEPT_SIBLING };
  const sibRes = await timedFetch(
    sibling,
    { method: "GET", redirect: "follow", headers },
    timeoutMs,
    signal,
  );
  const sibText = await readPartialText(sibRes, SNIFF_BYTES);
  const sibCt = sibRes.headers.get("content-type") || "";

  if (!sibRes.ok || isHtml(sibText) || isHtmlContentType(sibCt)) return null;
  if (!looksLikeMarkdown(sibText) && !isMarkdownContentType(sibCt)) return null;

  const fullRes = await timedFetch(
    sibling,
    { method: "GET", redirect: "follow", headers },
    timeoutMs,
    signal,
  );
  if (!fullRes.ok) return null;
  return buildFetchResult(fullRes, sibling, sibCt, MARKDOWN_RESPONSE_KIND);
}

interface ResponseKind {
  isMarkdown: boolean;
  isPlainText: boolean;
}

interface FetchFullTextOptions {
  url: string;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  contentType: string;
  kind: ResponseKind;
  headers: Record<string, string>;
}

const MARKDOWN_RESPONSE_KIND = { isMarkdown: true, isPlainText: false } as const;
const PLAIN_TEXT_RESPONSE_KIND = { isMarkdown: false, isPlainText: true } as const;

async function fetchFullTextResult(options: FetchFullTextOptions): Promise<FetchResult> {
  const fullRes = await timedFetch(
    options.url,
    { method: "GET", redirect: "follow", headers: options.headers },
    options.timeoutMs,
    options.signal,
  );
  if (!fullRes.ok)
    throw new FetchError(`Fetch failed: ${fullRes.status} ${fullRes.statusText}`, {
      status: fullRes.status,
    });
  return buildFetchResult(fullRes, options.url, options.contentType, options.kind);
}

async function buildFetchResult(
  response: Response,
  fallbackUrl: string,
  contentType: string,
  kind: ResponseKind,
): Promise<FetchResult> {
  return {
    url: response.url || fallbackUrl,
    text: await response.text(),
    contentType,
    isMarkdown: kind.isMarkdown,
    isPlainText: kind.isPlainText,
  };
}

function isMarkdownCandidate(contentType: string, finalUrl: string, sniffText: string): boolean {
  return (
    isMarkdownContentType(contentType) ||
    looksLikeMarkdownUrl(finalUrl) ||
    looksLikeMarkdown(sniffText)
  );
}

function isPlainTextCandidate(contentType: string, finalUrl: string, sniffText: string): boolean {
  return (
    isPlainTextContentType(contentType) &&
    !looksLikeMarkdownUrl(finalUrl) &&
    !looksLikeMarkdown(sniffText)
  );
}

async function fetchAsHtml(
  url: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<FetchResult> {
  const res = await timedFetch(
    url,
    {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.1" },
    },
    timeoutMs,
    signal,
  );
  if (!res.ok)
    throw new FetchError(`Fetch failed: ${res.status} ${res.statusText}`, { status: res.status });
  return {
    url: res.url || url,
    text: await res.text(),
    contentType: res.headers.get("content-type") || "",
    isMarkdown: false,
    isPlainText: false,
  };
}

/** Error thrown on fetch failures. */
export interface FetchErrorOptions extends ErrorOptions {
  status?: number;
}

export class FetchError extends Error {
  readonly status?: number;

  constructor(message: string, options: FetchErrorOptions = {}) {
    super(message, options);
    this.name = "FetchError";
    this.status = options.status;
  }
}

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (signal?.aborted) abortFromParent();
  else signal?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new FetchError(`Fetch timed out after ${timeoutMs}ms`, { cause: err });
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stream reading with early-exit logic
async function readPartialText(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (body && typeof (body as unknown as { getReader: () => unknown }).getReader === "function") {
    const reader = (body as unknown as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder("utf-8");
    let text = "";
    let bytes = 0;
    try {
      while (bytes < maxBytes) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          bytes += value.byteLength;
          text += decoder.decode(value, { stream: true });
        }
        if (bytes >= maxBytes) break;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
    return (text + decoder.decode()).slice(0, Math.max(0, maxBytes));
  }
  return (await res.text()).slice(0, Math.max(0, maxBytes));
}

function isMarkdownContentType(ct: string): boolean {
  const lower = ct.toLowerCase();
  return (
    lower.includes("text/markdown") ||
    lower.includes("text/x-markdown") ||
    lower.includes("application/markdown") ||
    lower.includes("application/x-markdown")
  );
}

function isHtmlContentType(ct: string): boolean {
  const lower = ct.toLowerCase();
  return lower.includes("text/html") || lower.includes("application/xhtml+xml");
}

export function isPlainTextContentType(ct: string): boolean {
  const lower = ct.toLowerCase();
  if (isHtmlContentType(ct)) return false;
  return lower.startsWith("text/") || lower.includes("application/xml");
}

export function isHtml(text: string): boolean {
  const trimmed = (text || "").trimStart().slice(0, 2000).toLowerCase();
  return !!(
    trimmed.startsWith("<!doctype html") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<?xml") ||
    /<(head|body)\b/.test(trimmed) ||
    (trimmed.startsWith("<") && /<\/(html|head|body)>/.test(trimmed))
  );
}

export function looksLikeMarkdown(text: string): boolean {
  const sample = (text || "").slice(0, 4000);
  return !!(
    /^\s*#\s+\S+/m.test(sample) ||
    /^\s*---\s*$/m.test(sample) ||
    /```/.test(sample) ||
    /^\s*[-*+]\s+\S+/m.test(sample) ||
    /^\s*\d+\.\s+\S+/m.test(sample) ||
    /\[[^\]]+\]\([^)]+\)/.test(sample)
  );
}

function looksLikeMarkdownUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith(".md") || path.endsWith(".markdown");
  } catch {
    return false;
  }
}

function generateSiblingUrls(url: string): string[] {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  const path = parsed.pathname;
  const siblings: string[] = [];

  if (path.endsWith("/")) {
    siblings.push(new URL("index.md", parsed).toString());
    siblings.push(new URL("README.md", parsed).toString());
  } else if (!path.toLowerCase().endsWith(".md")) {
    const withMd = new URL(parsed.toString());
    withMd.pathname = `${path}.md`;
    siblings.push(withMd.toString());
  }

  const withMarkdown = new URL(parsed.toString());
  if (!path.toLowerCase().endsWith(".markdown")) {
    withMarkdown.pathname = path.endsWith("/") ? `${path}index.markdown` : `${path}.markdown`;
    siblings.push(withMarkdown.toString());
  }

  return siblings;
}

/** Guess a language identifier from a URL pathname extension. */
export function guessLanguage(url: string): string {
  try {
    const ext = new URL(url).pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
    const map: Record<string, string> = {
      bash: "bash",
      c: "c",
      cc: "cpp",
      conf: "conf",
      cpp: "cpp",
      css: "css",
      cxx: "cpp",
      dart: "dart",
      dockerfile: "dockerfile",
      elixir: "elixir",
      ex: "elixir",
      exs: "elixir",
      go: "go",
      graphql: "graphql",
      gql: "graphql",
      h: "c",
      hpp: "cpp",
      html: "html",
      htm: "html",
      ini: "ini",
      java: "java",
      js: "javascript",
      json: "json",
      jsx: "jsx",
      kt: "kotlin",
      kts: "kotlin",
      less: "less",
      lua: "lua",
      mjs: "javascript",
      cjs: "javascript",
      md: "markdown",
      php: "php",
      pl: "perl",
      ps: "powershell",
      ps1: "powershell",
      py: "python",
      r: "r",
      rb: "ruby",
      rs: "rust",
      scss: "scss",
      sh: "sh",
      sql: "sql",
      svelte: "svelte",
      swift: "swift",
      toml: "toml",
      ts: "ts",
      tsx: "tsx",
      vue: "vue",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
      zsh: "zsh",
    };
    return map[ext] || "";
  } catch {
    return "";
  }
}
