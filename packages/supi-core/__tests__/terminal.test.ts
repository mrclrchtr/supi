import { describe, expect, it, vi } from "vitest";
import type { TitleTarget } from "../src/terminal.ts";
import {
  DONE_SYMBOL,
  formatTitle,
  signalBell,
  signalDone,
  signalWaiting,
  WAITING_SYMBOL,
} from "../src/terminal.ts";

function makeCtx(): TitleTarget & { getTitles(): string[] } {
  const titles: string[] = [];
  return {
    ui: {
      setTitle: (title: string) => {
        titles.push(title);
      },
    },
    getTitles: () => titles,
  };
}

describe("terminal utilities", () => {
  describe("formatTitle", () => {
    it("formats with session name and cwd", () => {
      expect(formatTitle("my-session", "/home/projects/foo")).toBe("π - my-session - foo");
    });

    it("formats with cwd only", () => {
      expect(formatTitle(undefined, "/home/projects/bar")).toBe("π - bar");
    });

    it("formats with session name only", () => {
      expect(formatTitle("my-session")).toBe("π - my-session");
    });

    it("returns bare π when nothing is given", () => {
      expect(formatTitle()).toBe("π");
    });

    it("uses the directory basename, not the full path", () => {
      expect(formatTitle("sess", "/a/b/c/d")).toBe("π - sess - d");
    });

    it("handles trailing slash in cwd", () => {
      expect(formatTitle(undefined, "/foo/bar/")).toBe("π - bar");
    });
  });

  describe("signalBell", () => {
    it("writes BEL to stdout without throwing", () => {
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      signalBell();
      expect(spy).toHaveBeenCalledWith("\x07");
      spy.mockRestore();
    });
  });

  describe("signalWaiting", () => {
    it("sets titled with ● prefix and sounds bell", () => {
      const ctx = makeCtx();

      // Mock only the bell — we still want setTitle to work
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      signalWaiting(ctx, "pi — waiting for your input");

      expect(ctx.getTitles()).toEqual([`${WAITING_SYMBOL}  pi — waiting for your input`]);
      expect(spy).toHaveBeenCalledWith("\x07");
      spy.mockRestore();
    });

    it("is safe when setTitle is undefined", () => {
      const ctx: TitleTarget = { ui: {} };
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      expect(() => signalWaiting(ctx, "hello")).not.toThrow();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("signalDone", () => {
    it("sets title with ✓ prefix and sounds bell", () => {
      const ctx = makeCtx();

      // We interpose on title to check the formatted string, but bell must
      // also go through. Let signalDone do both.
      const bellSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      signalDone(ctx, "π - my-project - foo");

      expect(ctx.getTitles()).toEqual([`${DONE_SYMBOL} π - my-project - foo`]);
      expect(bellSpy).toHaveBeenCalledWith("\x07");
      bellSpy.mockRestore();
    });

    it("is safe when setTitle is undefined", () => {
      const ctx: TitleTarget = { ui: {} };
      const bellSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      expect(() => signalDone(ctx, "anything")).not.toThrow();
      expect(bellSpy).toHaveBeenCalled();
      bellSpy.mockRestore();
    });
  });
});
