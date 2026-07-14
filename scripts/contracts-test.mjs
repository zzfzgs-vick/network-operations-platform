import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["--test", "tests/contract/contracts.test.mjs"]);
run("go", ["test", "./tests/contract"]);
