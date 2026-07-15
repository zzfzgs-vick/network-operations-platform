import { spawnSync } from "node:child_process";

const selections = process.argv.slice(2);
const common = [
  "dist/runtime.test.js",
  "dist/http/contract-exception.filter.test.js",
];
const config = ["dist/config/config.test.js"];

let files;
if (selections.length === 0) {
  files = [...common, ...config];
} else if (selections.length === 1 && selections[0] === "config") {
  files = config;
} else {
  throw new Error(`Unknown unit test selection: ${selections.join(" ")}`);
}

if (files.length === 0) throw new Error("No unit tests selected");

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./dist/database/unit-test-setup.js",
    "--test-reporter=tap",
    "--test",
    ...files,
  ],
  { encoding: "utf8" },
);

if (result.error) throw result.error;
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  const count = /^# tests (\d+)$/m.exec(result.stdout ?? "");
  if (!count || Number(count[1]) < 1) {
    throw new Error("Selected unit test suite executed zero tests");
  }
}
