import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedRoot = resolve(repositoryRoot, "packages/contracts/generated");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "nop-contracts-"));

async function filesBelow(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(root, path)));
    else files.push(relative(root, path).replaceAll("\\", "/"));
  }
  return files.sort();
}

try {
  const generated = spawnSync(
    process.execPath,
    ["scripts/contracts-generate.mjs", "--output-root", temporaryRoot],
    { cwd: repositoryRoot, encoding: "utf8", env: process.env },
  );
  if (generated.status !== 0) {
    throw new Error(generated.stderr || "Contract generation failed");
  }

  const expectedFiles = await filesBelow(expectedRoot);
  const actualFiles = await filesBelow(temporaryRoot);
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
    throw new Error(
      "Generated contract file set has drifted; run npm run contracts:generate",
    );
  }

  for (const file of expectedFiles) {
    const [expected, actual] = await Promise.all([
      readFile(resolve(expectedRoot, file)),
      readFile(resolve(temporaryRoot, file)),
    ]);
    if (!expected.equals(actual)) {
      throw new Error(`Generated contract has drifted: ${file}`);
    }
  }

  if (process.env.CI) {
    const diff = spawnSync(
      "git",
      ["diff", "--exit-code", "--", "packages/contracts/generated"],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    if (diff.status !== 0) {
      throw new Error(
        diff.stdout || diff.stderr || "Generated contract Git diff detected",
      );
    }
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.info("Generated contracts match the authoritative schema");
