export function hello(name: string): string {
  return `Hello, ${name}!`;
}

export class Greeter {
  private greeting: string;

  constructor(greeting: string) {
    this.greeting = greeting;
  }

  greet(name: string): string {
    return `${this.greeting}, ${name}!`;
  }
}

export interface Config {
  name: string;
  version: number;
}

// Import test targets — used by import extraction tests
import { readFile } from "node:fs/promises";
import { join } from "node:path";

void readFile;
void join;
