import { parentPort, workerData } from "node:worker_threads";
import { createJiti } from "jiti";

if (!parentPort) throw new Error("Structural Worker requires a parent port");

const jiti = createJiti(import.meta.url, { interopDefault: true });
const worker = await jiti.import("./worker-main.ts");
await worker.runStructuralWorker(parentPort, workerData);
