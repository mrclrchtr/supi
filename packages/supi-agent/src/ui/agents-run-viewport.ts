/** One ordered section of the rendered Agent Run details. */
export interface AgentRunBlock {
  /** Negative keys identify metadata; conversation keys include the retention offset. */
  readonly key: number;
  readonly lines: readonly string[];
}

type Navigation = "page-up" | "page-down" | "start" | "end" | "toggle";

interface Row {
  key: number;
  offset: number;
  text: string;
}

/** Follow new output, or keep a retained entry and wrapped-line offset in view. */
export class AgentRunViewport {
  #following = true;
  #anchor: Pick<Row, "key" | "offset"> | undefined;
  #rows: Row[] = [];
  #height = 1;
  #start = 0;

  /** Show whether new output moves the viewport, and how much output is below it. */
  get status(): string {
    if (this.#following) return "LIVE · auto-scroll on";
    const below = Math.max(0, this.#rows.length - this.#start - this.#height);
    return `PAUSED · ${below} lines below`;
  }

  /** Fit wrapped rows to the available height without moving a paused reading position. */
  render(blocks: readonly AgentRunBlock[], height: number): string[] {
    this.#height = Math.max(1, height);
    this.#rows = blocks.flatMap((block) =>
      block.lines.map((text, offset) => ({ key: block.key, offset, text })),
    );
    const maximum = this.#maximumStart();
    this.#start = this.#following ? maximum : Math.min(maximum, this.#anchorStart());
    this.#rememberAnchor();
    return this.#rows.slice(this.#start, this.#start + this.#height).map((row) => row.text);
  }

  /** Page through wrapped lines. Reaching the end with Page Down restores live following. */
  navigate(action: Navigation): void {
    const maximum = this.#maximumStart();
    switch (action) {
      case "page-up":
        this.#following = false;
        this.#start = Math.max(0, this.#start - this.#height);
        break;
      case "page-down":
        this.#start = Math.min(maximum, this.#start + this.#height);
        this.#following = this.#start === maximum;
        break;
      case "start":
        this.#following = false;
        this.#start = 0;
        break;
      case "end":
        this.#following = true;
        this.#start = maximum;
        break;
      case "toggle":
        this.#following = !this.#following;
        if (this.#following) this.#start = maximum;
        break;
    }
    this.#rememberAnchor();
  }

  /** Follow the latest output when a different Agent Run is selected. */
  reset(): void {
    this.#following = true;
    this.#anchor = undefined;
    this.#rows = [];
    this.#start = 0;
  }

  #maximumStart(): number {
    return Math.max(0, this.#rows.length - this.#height);
  }

  #rememberAnchor(): void {
    const row = this.#rows[this.#start];
    this.#anchor = row ? { key: row.key, offset: row.offset } : undefined;
  }

  #anchorStart(): number {
    const anchor = this.#anchor;
    if (!anchor) return 0;
    const start = this.#rows.findIndex((row) => row.key >= anchor.key);
    if (start < 0) return this.#maximumStart();
    // If retention removed the entry, show the oldest entry still available.
    if (this.#rows[start]?.key !== anchor.key) return start;
    let end = start;
    while (this.#rows[end + 1]?.key === anchor.key) end++;
    return Math.min(end, start + anchor.offset);
  }
}
