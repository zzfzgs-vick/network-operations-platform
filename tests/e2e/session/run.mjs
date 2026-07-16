import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
if (process.argv.slice(2).join(" ") !== "session-expiry") {
  throw new Error(
    `Unknown end-to-end test selection: ${process.argv.slice(2).join(" ")}`,
  );
}
const result = spawnSync(
  "npm",
  [
    "run",
    "test:integration",
    "--workspace",
    "apps/platform",
    "--",
    "session-lifecycle",
  ],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error(
    `Session expiry end-to-end test exited with status ${result.status}`,
  );
