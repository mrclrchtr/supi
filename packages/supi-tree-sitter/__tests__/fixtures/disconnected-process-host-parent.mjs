await new Promise((resolve) => {
  process.once("disconnect", resolve);
  process.disconnect();
});
await import("../../src/worker/process-host.mjs");
