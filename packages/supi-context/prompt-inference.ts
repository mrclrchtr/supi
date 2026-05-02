import { existsSync, readFileSync } from "node:fs";
import type {
  BuildSystemPromptOptions,
  ExtensionCommandContext,
  Skill,
} from "@mariozechner/pi-coding-agent";

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function isLikelyContextFileHeading(value: string): boolean {
  return (
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith("~") ||
    /(?:^|\b)(?:AGENTS|CLAUDE|SYSTEM|APPEND_SYSTEM)\.md$/i.test(value)
  );
}

function deriveSkills(systemPrompt: string): Skill[] {
  const skills: Skill[] = [];
  const skillRegex =
    /<skill>\s*<name>([\s\S]*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<location>([\s\S]*?)<\/location>\s*<\/skill>/g;

  for (const match of systemPrompt.matchAll(skillRegex)) {
    skills.push({
      name: unescapeXml(match[1].trim()),
      description: unescapeXml(match[2].trim()),
      filePath: unescapeXml(match[3].trim()),
    } as Skill);
  }

  return skills;
}

function sliceProjectContextSection(systemPrompt: string): string | null {
  const sectionMarker = "\n\n# Project Context\n\n";
  const projectContextStart = systemPrompt.indexOf(sectionMarker);
  if (projectContextStart < 0) {
    return null;
  }

  let projectContext = systemPrompt.slice(projectContextStart + sectionMarker.length);
  const intro = "Project-specific instructions and guidelines:\n\n";
  if (projectContext.startsWith(intro)) {
    projectContext = projectContext.slice(intro.length);
  }

  const skillsMarker =
    "\n\nThe following skills provide specialized instructions for specific tasks.";
  const skillsIndex = projectContext.indexOf(skillsMarker);
  if (skillsIndex >= 0) {
    projectContext = projectContext.slice(0, skillsIndex);
  }

  const dateIndex = projectContext.indexOf("\nCurrent date: ");
  if (dateIndex >= 0) {
    projectContext = projectContext.slice(0, dateIndex);
  }

  return projectContext;
}

function deriveContextFiles(systemPrompt: string): Array<{ path: string; content: string }> {
  const projectContext = sliceProjectContextSection(systemPrompt);
  if (!projectContext) {
    return [];
  }

  const contextFiles: Array<{ path: string; content: string }> = [];
  const headingRegex = /^##\s+(.+)$/gm;
  for (const match of projectContext.matchAll(headingRegex)) {
    const filePath = match[1].trim();
    if (!isLikelyContextFileHeading(filePath) || !existsSync(filePath)) {
      continue;
    }
    contextFiles.push({ path: filePath, content: readFileSync(filePath, "utf-8") });
  }

  return contextFiles;
}

export function deriveOptionsFromSystemPrompt(
  ctx: ExtensionCommandContext,
  cachedOptions: BuildSystemPromptOptions | undefined,
): BuildSystemPromptOptions | undefined {
  if (cachedOptions) {
    return cachedOptions;
  }

  const systemPrompt = ctx.getSystemPrompt();
  const contextFiles = deriveContextFiles(systemPrompt);
  const skills = deriveSkills(systemPrompt);

  if (contextFiles.length === 0 && skills.length === 0) {
    return undefined;
  }

  return {
    cwd: ctx.cwd,
    contextFiles,
    skills,
  };
}
