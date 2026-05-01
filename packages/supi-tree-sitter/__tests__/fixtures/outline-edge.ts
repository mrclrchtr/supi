// @ts-nocheck — tree-sitter parsing fixture, not type-checked by tsserver.
export default () => {};

export function outer() {
  const local = 1;
  function nested() {}
  void local;
  void nested;
}

export const x = new Foo();
export const C = class {};
export const gen = function* () {};

export class Fields {
  handler = () => {};
  value = 1;
  static make = () => {};
}

export interface Shape {
  area(): number;
  name: string;
}

export enum Status {
  Ready,
  Done = 1,
}

declare const Foo: new () => unknown;
