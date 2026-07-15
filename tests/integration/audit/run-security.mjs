import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const selections = process.argv.slice(2);

if (selections.length !== 1 || selections[0] !== "audit-redaction") {
  throw new Error(`Unknown security test selection: ${selections.join(" ")}`);
}

const result = spawnSync(
  process.execPath,
  [
    "--test-reporter=tap",
    "--test",
    "tests/integration/audit/audit-redaction.test.mjs",
  ],
  { cwd: root, encoding: "utf8" },
);

if (result.error) throw result.error;
const output = result.stdout?.trim() ?? "";
if (output) process.stdout.write(`${output}\n`);
if (result.status !== 0) {
  throw new Error(`Audit redaction tests exited with status ${result.status}`);
}
const count = /^# tests (\d+)$/m.exec(output);
if (!count || Number(count[1]) < 1) {
  throw new Error("Selected security test suite executed zero tests");
}
