/**
 * HTML → Markdown conversion via JSDOM + Readability + Turndown.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import Turndown from "turndown";
import { guessLanguage } from "./fetch.ts";

/**
 * Convert HTML to clean Markdown.
 *
 * @param html - Raw HTML string.
 * @param baseUrl - Base URL for resolving relative links.
 * @param options.absLinks - Whether to absolutize links and image sources.
 * @returns Clean Markdown string.
 */
export async function htmlToMarkdown(
  html: string,
  baseUrl: string,
  options: { absLinks?: boolean } = {},
): Promise<string> {
  const absLinks = options.absLinks ?? true;

  if (!isHtml(html)) {
    // Not HTML — wrap as fenced code block
    return wrapAsCodeBlock(html, baseUrl);
  }

  const doc = createDocument(html, baseUrl);

  // Remove script/style/noscript
  for (const tag of ["script", "style", "noscript"]) {
    for (const el of doc.querySelectorAll(tag)) {
      el.remove();
    }
  }

  // Extract article content with Readability
  const readability = new Readability(doc);
  const article = readability.parse();

  const title = article?.title?.trim() || doc.title?.trim() || "";

  // Use Readability content, or fall back to body
  const contentHtml = article?.content || doc.body?.innerHTML || html;

  // Re-parse content so we can manipulate it cleanly
  const contentDoc = createDocument(`<html><body>${contentHtml}</body></html>`, baseUrl);
  const body = contentDoc.body;

  if (absLinks) {
    absolutizeLinks(body, baseUrl);
  }

  const turndown = await createTurndown();
  let markdown = turndown.turndown(body);
  markdown = cleanMarkdown(markdown);

  // Prepend title if not already present
  if (title && !markdown.trimStart().startsWith("# ")) {
    markdown = `# ${title}\n\n${markdown}`;
  }

  return normalizeWhitespace(markdown);
}

/**
 * Wrap plain text in a fenced code block.
 */
export function wrapAsCodeBlock(text: string, url: string): string {
  const lang = guessLanguage(url);
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // Find longest backtick sequence so we can choose a fence that won't conflict
  const backticks = normalized.match(/`+/g) || [];
  let maxTicks = 0;
  for (const bt of backticks) {
    maxTicks = Math.max(maxTicks, bt.length);
  }
  const fence = "`".repeat(Math.max(3, maxTicks + 1));
  const body = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  const prefix = lang ? `${fence}${lang}\n` : `${fence}\n`;
  return normalizeWhitespace(`${prefix}${body}${fence}\n`);
}

function createDocument(html: string, url: string): Document {
  const virtualConsole = new VirtualConsole();
  return new JSDOM(html, { url, virtualConsole }).window.document;
}

function absolutizeLinks(root: Element, baseUrl: string): void {
  for (const a of root.querySelectorAll("a[href]")) {
    const resolved = resolveUrl(a.getAttribute("href") || "", baseUrl);
    if (resolved) {
      a.setAttribute("href", resolved);
    } else {
      a.removeAttribute("href");
    }
  }
  for (const img of root.querySelectorAll("img[src]")) {
    const resolved = resolveUrl(img.getAttribute("src") || "", baseUrl);
    if (resolved) {
      img.setAttribute("src", resolved);
    } else {
      img.removeAttribute("src");
    }
  }
}

/** Dangerous URI schemes that must never be used in href/src attributes. */
const DANGEROUS_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];

function hasDangerousScheme(value: string): boolean {
  // Case-insensitive scheme check: split on first ':' and compare lowercased
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) return false;
  const scheme = value.slice(0, colonIndex + 1).toLowerCase();
  return DANGEROUS_SCHEMES.includes(scheme);
}

function resolveUrl(href: string, baseUrl: string): string {
  const trimmed = String(href || "").trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return trimmed;
  }
  if (hasDangerousScheme(trimmed)) {
    return "";
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    // Even after URL resolution, reject any non-http/https protocols
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return "";
    }
    return resolved.toString();
  } catch {
    return trimmed;
  }
}

async function createTurndown(): Promise<Turndown> {
  const td = new Turndown({
    codeBlockStyle: "fenced",
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    emDelimiter: "_",
  });

  // Try loading GFM plugins
  try {
    // @ts-expect-error — turndown-plugin-gfm has no @types package
    const gfmMod = await import("turndown-plugin-gfm");
    const gfm = (gfmMod as unknown as { default?: unknown }).default ?? gfmMod;
    const plugins: unknown[] = [];
    if (gfm && typeof gfm === "object") {
      const obj = gfm as Record<string, unknown>;
      if (typeof obj.gfm === "function") plugins.push(obj.gfm);
      if (typeof obj.tables === "function") plugins.push(obj.tables);
      if (typeof obj.strikethrough === "function") plugins.push(obj.strikethrough);
      if (typeof obj.taskListItems === "function") plugins.push(obj.taskListItems);
    }
    if (plugins.length > 0) {
      td.use(plugins as [(turndown: Turndown) => void]);
    }
  } catch {
    // GFM plugin optional
  }

  // Custom pre → fenced code rule
  td.addRule("preToFenced", {
    filter: ["pre"],
    replacement(_content: string, node: Turndown.Node) {
      const text = (node as unknown as HTMLElement).textContent ?? "";
      return `\n\n\`\`\`\n${String(text).replace(/\n+$/g, "")}\n\`\`\`\n\n`;
    },
  });

  return td;
}

function cleanMarkdown(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCodeBlock = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      out.push(raw);
      continue;
    }
    if (
      !inCodeBlock &&
      (/^(copy|copy page|copied!?|copy to clipboard)$/i.test(trimmed) ||
        /^loading\.{3}$/i.test(trimmed))
    ) {
      continue;
    }
    out.push(raw);
  }

  return out.join("\n");
}

function normalizeWhitespace(text: string): string {
  return `${String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function isHtml(text: string): boolean {
  const trimmed = (text || "").trimStart().slice(0, 2000).toLowerCase();
  return !!(
    trimmed.startsWith("<!doctype html") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<?xml") ||
    /<(head|body)\b/.test(trimmed) ||
    (trimmed.startsWith("<") && /<\/(html|head|body)>/.test(trimmed))
  );
}
