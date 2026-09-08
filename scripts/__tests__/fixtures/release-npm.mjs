#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Replace npm at the process boundary. Never call the real registry or publisher.
const args = process.argv.slice(2);
const event = { args };
if (args[0] === "pack") {
  event.manifest = JSON.parse(readFileSync("package.json", "utf8"));
}
if (args[0] === "publish") {
  event.manifest = JSON.parse(readFileSync(args[1], "utf8"));
}
appendFileSync(process.env.TEST_NPM_LOG, `${JSON.stringify(event)}\n`);

switch (args[0]) {
  case "view": {
    const existing = JSON.parse(process.env.TEST_NPM_EXISTING ?? "[]");
    if (!existing.includes(args[1])) process.exit(1);
    console.log(args[1].slice(args[1].lastIndexOf("@") + 1));
    break;
  }
  case "pack": {
    const filename = `${event.manifest.name.replace(/[@/]/g, "-")}-${event.manifest.version}.tgz`;
    const outDir = args[args.indexOf("--pack-destination") + 1];
    writeFileSync(join(outDir, filename), JSON.stringify(event.manifest));
    console.log(JSON.stringify([{ filename }]));
    break;
  }
  case "publish":
    if (process.env.TEST_NPM_PUBLISH_FAIL === "true") process.exit(1);
    break;
  default:
    throw new Error(`Unexpected npm command: ${JSON.stringify(args)}`);
}
