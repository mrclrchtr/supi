import { afterEach, describe, expect, it } from "vitest";
import {
  type ContextProvider,
  clearRegisteredContextProviders,
  getRegisteredContextProviders,
  registerContextProvider,
} from "../src/context-provider-registry.ts";

describe("context-provider-registry", () => {
  afterEach(() => {
    clearRegisteredContextProviders();
  });

  it("returns empty array when no providers registered", () => {
    expect(getRegisteredContextProviders()).toEqual([]);
  });

  it("registers and retrieves a provider", () => {
    const provider: ContextProvider = {
      id: "rtk",
      label: "RTK",
      getData: () => ({ rewrites: 5 }),
    };
    registerContextProvider(provider);

    const result = getRegisteredContextProviders();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "rtk", label: "RTK" });
    expect(result[0].getData()).toEqual({ rewrites: 5 });
  });

  it("registers multiple providers in order", () => {
    const p1: ContextProvider = {
      id: "rtk",
      label: "RTK",
      getData: () => ({ rewrites: 1 }),
    };
    const p2: ContextProvider = {
      id: "cache",
      label: "Cache Monitor",
      getData: () => ({ hits: 10 }),
    };
    registerContextProvider(p1);
    registerContextProvider(p2);

    const result = getRegisteredContextProviders();
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(["rtk", "cache"]);
  });

  it("replaces previous registration with duplicate id", () => {
    const original: ContextProvider = {
      id: "rtk",
      label: "RTK",
      getData: () => ({ rewrites: 1 }),
    };
    const replacement: ContextProvider = {
      id: "rtk",
      label: "RTK v2",
      getData: () => ({ rewrites: 2 }),
    };
    registerContextProvider(original);
    registerContextProvider(replacement);

    const result = getRegisteredContextProviders();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "rtk", label: "RTK v2" });
    expect(result[0].getData()).toEqual({ rewrites: 2 });
  });

  it("clearRegisteredContextProviders empties the registry", () => {
    registerContextProvider({
      id: "rtk",
      label: "RTK",
      getData: () => ({ rewrites: 1 }),
    });
    expect(getRegisteredContextProviders()).toHaveLength(1);

    clearRegisteredContextProviders();
    expect(getRegisteredContextProviders()).toHaveLength(0);
  });

  it("allows provider to return null", () => {
    const provider: ContextProvider = {
      id: "rtk",
      label: "RTK",
      getData: () => null,
    };
    registerContextProvider(provider);

    const result = getRegisteredContextProviders();
    expect(result[0].getData()).toBeNull();
  });
});
