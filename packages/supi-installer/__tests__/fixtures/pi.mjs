import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  if (process.env.FIXTURE_VERSION_WAIT) {
    writeFileSync(join(process.env.PI_CODING_AGENT_DIR, "version-ready"), "ready");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  process.stdout.write("Pi fixture\n");
} else {
  appendFileSync(
    join(process.env.PI_CODING_AGENT_DIR, "calls.jsonl"),
    `${JSON.stringify({ args, cwd: process.cwd() })}\n`,
  );
  if (process.env.FIXTURE_WAIT) await new Promise((resolve) => setTimeout(resolve, 30_000));
  if (args[1].includes(process.env.FIXTURE_FAIL ?? "never-match")) {
    process.stderr.write("Package command failed\n");
    process.exitCode = 1;
  } else {
    const path = args.includes("--local")
      ? join(process.cwd(), ".pi/settings.json")
      : join(process.env.PI_CODING_AGENT_DIR, "settings.json");
    const data = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    data.packages ??= [];
    if (args[0] === "install") data.packages.push(args[1]);
    else
      data.packages = data.packages.filter(
        (entry) => (typeof entry === "string" ? entry : entry.source) !== args[1],
      );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
    process.stdout.write("Package command complete\n");
  }
}
