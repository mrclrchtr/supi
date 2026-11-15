/**
 * Minimal CMake language tokenizer for static `project()` observation.
 *
 * It follows the CMake language grammar for comments, bracket arguments,
 * quoted arguments, unquoted arguments, and nested parentheses, and records
 * command invocations with their block nesting. It never evaluates variables,
 * conditions, functions, macros, or included files.
 */

/** One command argument exactly as written. */
export interface CMakeArgument {
  readonly form: "bracket" | "quoted" | "unquoted" | "paren";
  /** Raw argument text without bracket or quote delimiters. */
  readonly text: string;
}

/** One command invocation in source order. */
export interface CMakeCommand {
  /** Lower-case command name; CMake command names are case-insensitive. */
  readonly name: string;
  /** One-based line of the command name. */
  readonly line: number;
  readonly args: readonly CMakeArgument[];
  /** Number of enclosing control, function, macro, or block commands. */
  readonly depth: number;
}

/** One syntax problem that stopped parsing. */
export interface CMakeParseIssue {
  readonly line: number;
  readonly reason: string;
}

/** Parsed commands, or the first syntax issue. */
export interface CMakeParseResult {
  readonly commands: readonly CMakeCommand[];
  readonly issue: CMakeParseIssue | null;
}

const OPENERS = new Set(["if", "foreach", "while", "function", "macro", "block"]);
const CLOSERS = new Set(["endif", "endforeach", "endwhile", "endfunction", "endmacro", "endblock"]);

class ParseError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
  }
}

/** Parse CMake source into command invocations. */
export function parseCMakeFile(text: string): CMakeParseResult {
  const commands: CMakeCommand[] = [];
  try {
    new Scanner(text, commands).run();
    return { commands, issue: null };
  } catch (error) {
    if (error instanceof ParseError)
      return { commands: [], issue: { line: error.line, reason: error.message } };
    throw error;
  }
}

class Scanner {
  private index = 0;
  private line = 1;
  private depth = 0;

  constructor(
    private readonly text: string,
    private readonly commands: CMakeCommand[],
  ) {}

  run(): void {
    while (this.index < this.text.length) {
      const char = this.peek();
      if (char === "\n" || char === " " || char === "\t" || char === "\r") this.advance();
      else if (char === "#") this.skipComment();
      else if (/[A-Za-z_]/.test(char)) this.readCommand();
      else throw new ParseError(this.line, `Unexpected character ${JSON.stringify(char)}.`);
    }
    if (this.depth > 0)
      throw new ParseError(this.line, "Unterminated control or definition block.");
  }

  private readCommand(): void {
    const line = this.line;
    const start = this.index;
    while (/[A-Za-z0-9_]/.test(this.peek())) this.advance();
    const name = this.text.slice(start, this.index).toLowerCase();
    while (this.peek() === " " || this.peek() === "\t") this.advance();
    if (this.peek() !== "(") throw new ParseError(line, `Command ${name} is missing "(".`);
    this.advance();
    const args = this.readArguments(line);
    if (CLOSERS.has(name)) this.depth = Math.max(0, this.depth - 1);
    this.commands.push({ name, line, args, depth: this.depth });
    if (OPENERS.has(name)) this.depth += 1;
  }

  private readArguments(commandLine: number): CMakeArgument[] {
    const args: CMakeArgument[] = [];
    let nesting = 0;
    for (;;) {
      if (this.index >= this.text.length)
        throw new ParseError(commandLine, "Unterminated command arguments.");
      const char = this.peek();
      if (char === ")" && nesting === 0) {
        this.advance();
        return args;
      }
      if (char === "(" || char === ")") {
        this.advance();
        nesting += char === "(" ? 1 : -1;
        args.push({ form: "paren", text: char });
        continue;
      }
      const argument = this.readArgument(char);
      if (argument) args.push(argument);
    }
  }

  /** Read one argument, or skip whitespace and comments and return null. */
  private readArgument(char: string): CMakeArgument | null {
    if (/\s/.test(char)) {
      this.advance();
      return null;
    }
    if (char === "#") {
      this.skipComment();
      return null;
    }
    if (char === "[" && this.bracketLevel() !== null)
      return { form: "bracket", text: this.readBracket() };
    if (char === '"') return { form: "quoted", text: this.readQuoted() };
    return { form: "unquoted", text: this.readUnquoted() };
  }

  private skipComment(): void {
    this.advance();
    if (this.peek() === "[" && this.bracketLevel() !== null) {
      this.readBracket();
      return;
    }
    while (this.index < this.text.length && this.peek() !== "\n") this.advance();
  }

  /** Return the `=` count when a bracket opening starts at the cursor. */
  private bracketLevel(): number | null {
    const match = /^\[(=*)\[/.exec(this.text.slice(this.index, this.index + 256));
    return match ? (match[1]?.length ?? 0) : null;
  }

  private readBracket(): string {
    const line = this.line;
    const level = this.bracketLevel() ?? 0;
    this.advanceBy(level + 2);
    const close = `]${"=".repeat(level)}]`;
    const end = this.text.indexOf(close, this.index);
    if (end < 0) throw new ParseError(line, "Unterminated bracket argument or comment.");
    let content = this.text.slice(this.index, end);
    this.advanceBy(end + close.length - this.index);
    if (content.startsWith("\r\n")) content = content.slice(2);
    else if (content.startsWith("\n")) content = content.slice(1);
    return content;
  }

  private readQuoted(): string {
    const line = this.line;
    this.advance();
    const start = this.index;
    while (this.index < this.text.length) {
      const char = this.peek();
      if (char === "\\") this.advanceBy(2);
      else if (char === '"') {
        const content = this.text.slice(start, this.index);
        this.advance();
        return content;
      } else this.advance();
    }
    throw new ParseError(line, "Unterminated quoted argument.");
  }

  private readUnquoted(): string {
    const start = this.index;
    while (this.index < this.text.length) {
      const char = this.peek();
      if (char === "\\") this.advanceBy(2);
      else if (/[\s()#"]/.test(char)) break;
      else this.advance();
    }
    return this.text.slice(start, this.index);
  }

  private peek(): string {
    return this.text[this.index] ?? "";
  }

  private advance(): void {
    if (this.text[this.index] === "\n") this.line += 1;
    this.index += 1;
  }

  private advanceBy(count: number): void {
    for (let step = 0; step < count && this.index < this.text.length; step += 1) this.advance();
  }
}
