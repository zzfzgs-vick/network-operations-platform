import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type PackageManifest = {
  private: boolean;
  engines: { node: string };
  workspaces: string[];
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const requiredFiles: string[] = [
  "package.json",
  "package-lock.json",
  "go.mod",
  "tsconfig.json",
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  "scripts/verify.ps1",
  "scripts/verify.sh",
  ".github/workflows/ci.yml",
  "README.md",
];

test("workspace exposes the required cross-platform quality contract", async () => {
  const packageJson: PackageManifest = JSON.parse(
    await readFile("package.json", "utf8"),
  );

  assert.equal(packageJson.private, true);
  assert.equal(packageJson.engines.node, ">=24 <25");
  assert.deepEqual(packageJson.workspaces, ["apps/*", "packages/*"]);

  for (const script of [
    "lint",
    "format:check",
    "typecheck",
    "test",
    "build",
    "verify",
  ]) {
    assert.equal(
      typeof packageJson.scripts[script],
      "string",
      `missing ${script}`,
    );
  }

  for (const name of ["nx", "turbo", "lerna"]) {
    assert.equal(packageJson.dependencies?.[name], undefined);
    assert.equal(packageJson.devDependencies?.[name], undefined);
  }

  for (const script of Object.values(packageJson.scripts)) {
    assert.doesNotMatch(script, /go (?:vet|test|build) \.\/\.\.\./);
  }

  const goModule = await readFile("go.mod", "utf8");
  assert.match(
    goModule,
    /^module github\.com\/zzfzgs-vick\/network-operations-platform$/m,
  );
  assert.match(goModule, /^go 1\.26\.5$/m);
  assert.match(goModule, /^toolchain go1\.26\.5$/m);

  for (const file of requiredFiles) {
    const content = await readFile(file, "utf8");
    assert.equal(
      content.includes("\r\n"),
      false,
      `${file} must use LF endings`,
    );
  }
});
