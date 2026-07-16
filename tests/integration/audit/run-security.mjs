import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const selections = process.argv.slice(2);

if (
  selections.length !== 1 ||
  ![
    "audit-redaction",
    "authorization",
    "csrf",
    "password-policy",
    "session-cookie",
  ].includes(selections[0])
) {
  throw new Error(`Unknown security test selection: ${selections.join(" ")}`);
}

if (selections[0] === "csrf") {
  const result = spawnSync(
    process.execPath,
    ["tests/integration/config/run.mjs", "csrf"],
    { cwd: root, encoding: "utf8", stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`CSRF tests exited with status ${result.status}`);
  }
  process.exit(0);
}

const testFileBySelection = {
  "audit-redaction": "tests/integration/audit/audit-redaction.test.mjs",
  authorization: "tests/integration/authz/authorization.test.mjs",
  "password-policy": "tests/integration/auth/password-policy.test.mjs",
  "session-cookie": "tests/integration/session/session-cookie.test.mjs",
};
const testFile = testFileBySelection[selections[0]];

const result = spawnSync(
  process.execPath,
  ["--test-reporter=tap", "--test", testFile],
  { cwd: root, encoding: "utf8" },
);

if (result.error) throw result.error;
const output = result.stdout?.trim() ?? "";
if (output) process.stdout.write(`${output}\n`);
if (result.status !== 0) {
  throw new Error(`Security tests exited with status ${result.status}`);
}
const count = /^# tests (\d+)$/m.exec(output);
if (!count || Number(count[1]) < 1) {
  throw new Error("Selected security test suite executed zero tests");
}
