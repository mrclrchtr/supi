declare namespace Ns {
  export const x: number;
}

// biome-ignore lint/correctness/noUnresolvedImports: ambient module fixture for tree-sitter.
declare module "pkg" {
  export const y: number;
}
