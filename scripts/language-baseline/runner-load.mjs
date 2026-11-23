import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Records and summarizes the CPU load of a CI job, to judge whether its test worker counts fit
 * the runner. `os.cpus()` reports the same cumulative counters on Linux and macOS, so one script
 * serves both language-baseline legs.
 *
 * Usage: runner-load.mjs sample <file> [seconds]   (run in the background)
 *        runner-load.mjs summarize <file>
 */

/** Read the cumulative CPU time counters, summed over all cores, in milliseconds. */
function readCounters() {
  let busy = 0;
  let idle = 0;
  const cores = cpus();
  for (const { times } of cores) {
    busy += times.user + times.nice + times.sys + times.irq;
    idle += times.idle;
  }
  return { time: Date.now(), cores: cores.length, busy, idle, load1: loadavg()[0] };
}

/**
 * Turn consecutive counter samples into intervals. `busyCores` is the average number of fully
 * used cores during the interval; a value near `cores` means the runner is saturated.
 */
export function loadIntervals(samples) {
  const intervals = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const current = samples[index];
    const busy = current.busy - previous.busy;
    const total = busy + current.idle - previous.idle;
    if (total <= 0) continue;
    intervals.push({
      time: current.time,
      cores: current.cores,
      busyCores: (busy / total) * current.cores,
      load1: current.load1,
    });
  }
  return intervals;
}

/** Format intervals as one line each, followed by the average and the saturated share. */
export function formatLoad(intervals) {
  if (intervals.length === 0) return "No runner load samples; nothing to summarize.";
  const cores = intervals[0].cores;
  const lines = [`UTC       busy cores (of ${cores})  load average (1 min)`];
  for (const interval of intervals) {
    const clock = new Date(interval.time).toISOString().slice(11, 19);
    lines.push(
      `${clock}  ${interval.busyCores.toFixed(1).padStart(4)}                ${interval.load1.toFixed(1)}`,
    );
  }
  const average = intervals.reduce((sum, { busyCores }) => sum + busyCores, 0) / intervals.length;
  const saturated = intervals.filter(({ busyCores }) => busyCores >= 0.9 * cores).length;
  lines.push(
    `Average ${average.toFixed(1)} of ${cores} cores busy (${Math.round((average / cores) * 100)}%); ` +
      `${Math.round((saturated / intervals.length) * 100)}% of the samples were at or above 90%.`,
  );
  return lines.join("\n");
}

function main([command, file, seconds = "5"]) {
  if (command === "sample" && file) {
    const record = () => appendFileSync(file, `${JSON.stringify(readCounters())}\n`);
    record();
    setInterval(record, Number(seconds) * 1000);
    return;
  }
  if (command === "summarize" && file) {
    const samples = existsSync(file)
      ? readFileSync(file, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
    console.log(formatLoad(loadIntervals(samples)));
    return;
  }
  throw new Error("Usage: runner-load.mjs sample <file> [seconds] | summarize <file>");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
