import { appendFileSync, readFileSync } from "node:fs";

const pins = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const output = [
  `SUPI_BASELINE_JAVA_VERSION=${pins.toolchains.java.version}`,
  `SUPI_BASELINE_JAVA_DISTRIBUTION=${pins.toolchains.java.distribution}`,
  `SUPI_BASELINE_GO_VERSION=${pins.toolchains.go}`,
];

if (!process.env.GITHUB_ENV) {
  process.stdout.write(`${output.join("\n")}\n`);
} else {
  appendFileSync(process.env.GITHUB_ENV, `${output.join("\n")}\n`);
}
