# ADR 0001: Isolate structural work in one owned Worker

## Status

Accepted.

## Context

`Parser.parse()` and `Query.matches()` are synchronous WASM calls. A measured C query blocked Pi's main thread for approximately 490 seconds. Cooperative progress checks can stop WASM after a caller cancellation or deadline, but they cannot let main-thread timers or input handlers run between callbacks.

The package is loaded as TypeScript in development and from npm tarballs in published installs. The Worker must not depend on Pi's private loader or inherited process arguments.

On Node 24.21.0 with V8 13.6, parsing one LaTeX file crossed 1 GiB of resident memory after it returned a correct result. The crash report showed V8's background `LoopUnrollingPhase` in `GenerateWasmCode`. Compiling the same WASM file alone used 54 MiB. Node rejects `--liftoff-only` in `Worker.execArgv`, so the V8 flag cannot be set on one Worker thread.

## Decision

Each shared workspace lifecycle and each explicitly owned `TreeSitterSession` owns exactly one long-lived Structural Worker thread in a dedicated Node child process. There is no pool.

The child process starts with `--liftoff-only`. This stops the optimizing WebAssembly compiler that caused the LaTeX memory spike. The setting applies to all grammars in that process, but it does not change V8 in Pi's process. The process host starts the Worker with `execArgv: []` and clears `NODE_OPTIONS`; the Worker still loads TypeScript through the package's direct `jiti` dependency.

The Worker owns source reads, canonical paths, parser and grammar initialization, all WASM values, parsed-file and query caches, extraction, filtering, result shaping, and UTF-16 coordinate conversion. The parent owns validation, one FIFO mailbox, request identity, cancellation timers, Worker generations, bounded result assembly, and Debug Registry publication.

The package-owned `src/worker/process-host.mjs` forwards protocol messages between Pi and the Worker. Startup failure makes structural capability unavailable. Production has no main-thread fallback.

One active request has one `SharedArrayBuffer` cancellation slot inside the child process. The process host creates it and forwards it to the Worker thread. The parent sends cancellation over IPC; the process host sets the shared flag and forwards the cancel message. Worker parse and query progress callbacks inspect the flag and the absolute deadline. If cooperative interruption does not settle within 250 ms, the parent terminates the child process. The interrupted active request is not retried. Valid queued work keeps FIFO order on one fresh Worker with cold caches.

The fixed internal bounds are:

- one active request and 32 queued requests;
- 512 KiB per encoded protocol message;
- 256 KiB target result chunks;
- one unacknowledged chunk;
- 16 MiB per complete result;
- 256 KiB per indivisible non-string value; and
- 250 ms hard-stop grace.

These bounds are not settings. The parent processes one chunk, yields with `setImmediate`, and only then acknowledges it.

The Worker sends plain sanitized timing observations. The parent validates their closed shape before it records them. Messages never contain raw errors, source buffers, queries, file paths, `AbortSignal` values, or Tree-sitter objects.

Owned session disposal is asynchronous and must be awaited so callers can prove that no Worker process remains live.

## Verification evidence

A post-cancellation probe used a cached parse of a generated 600,000-line TypeScript file. A 100 ms deadline stopped the query in 103.2-105.2 ms. A 5 ms heartbeat still had 57.6-73.6 ms gaps, which confirmed the need for Worker isolation.

A throwaway bootstrap probe parsed successfully from the source checkout, an extracted staged Tree-sitter package, and the bundled Tree-sitter package in extracted Code Intelligence.

A chunk probe transferred 32 MiB with one-chunk acknowledgement. A 256 KiB chunk completed in 19.1-21.3 ms with maximum 2 ms heartbeat gaps of 2.37-2.68 ms. It had much less message overhead than 64 KiB and a smaller parent work quantum than 1 MiB or 4 MiB.

The LaTeX compile-only probe stayed at 53.9 MiB for 30 seconds. A one-file outline with default V8 compilation crossed the 1 GiB watchdog in less than one second. The same outline with `--liftoff-only` used 104.7 MiB and stayed live for 30 seconds. The original bounded AST-scan probe returned `item:first`, waited 60 seconds, and stayed below its 1 GiB limit at 330.9 MiB. The regression test runs the production process host, requires the outline result, waits two seconds, and enforces a 512 MiB process-group limit.

Run the regression and grammar checks with:

```bash
pnpm exec vitest run packages/supi-tree-sitter/__tests__/integration/latex-runtime-survival.test.ts
pnpm --filter @mrclrchtr/supi-tree-sitter check:all-wasm
```

## Consequences

- Pi's main event loop stays responsive during parser-backed work.
- A Worker restart discards all parser, tree, query, language, and cache state.
- Raw runtime and extraction helpers are no longer public APIs.
- Worker startup adds one package-local TypeScript loader dependency.
- Results that exceed fixed protocol limits fail explicitly instead of truncating evidence.
