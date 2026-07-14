import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool, PoolClient } from "pg";

const migrationPattern = /^(\d{4})_([a-z0-9_]+)\.up\.sql$/;
const migrationLock = 804_004;

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly fileName: string;
  readonly checksum: string;
  readonly sql: string;
}

interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

export interface MigrationStatus {
  readonly currentVersion: number;
  readonly latestVersion: number;
  readonly pendingVersions: readonly number[];
  readonly compatible: boolean;
}

export interface MigrationResult {
  readonly appliedCount: number;
  readonly currentVersion: number;
}

export const defaultMigrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

async function loadMigrations(
  directory: string,
): Promise<readonly Migration[]> {
  const entries = (await readdir(directory))
    .filter((entry) => migrationPattern.test(entry))
    .sort();
  const migrations = await Promise.all(
    entries.map(async (fileName) => {
      const match = migrationPattern.exec(fileName);

      if (!match) {
        throw new Error(`Invalid migration file name: ${fileName}`);
      }

      const sql = await readFile(join(directory, fileName), "utf8");
      return {
        version: Number(match[1]),
        name: match[2] ?? "",
        fileName,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    }),
  );

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        "Migration versions must be unique and consecutive from 0001",
      );
    }
  });

  return migrations;
}

async function migrationTableExists(pool: Pool) {
  const result = await pool.query<{ relation: string | null }>(
    "select to_regclass('public.platform_schema_migrations')::text as relation",
  );
  return result.rows[0]?.relation !== null;
}

async function readApplied(
  pool: Pool | PoolClient,
): Promise<readonly AppliedMigration[]> {
  const result = await pool.query<AppliedMigration>(
    "select version, name, checksum from public.platform_schema_migrations order by version",
  );
  return result.rows;
}

function statusFrom(
  migrations: readonly Migration[],
  applied: readonly AppliedMigration[],
): MigrationStatus {
  const known = new Map(
    migrations.map((migration) => [migration.version, migration]),
  );
  const appliedVersions = new Set(
    applied.map((migration) => migration.version),
  );
  const compatible = applied.every((migration, index) => {
    const expected = known.get(migration.version);
    return (
      migration.version === index + 1 &&
      expected?.name === migration.name &&
      expected.checksum === migration.checksum
    );
  });

  return {
    currentVersion: applied.at(-1)?.version ?? 0,
    latestVersion: migrations.at(-1)?.version ?? 0,
    pendingVersions: migrations
      .filter((migration) => !appliedVersions.has(migration.version))
      .map((migration) => migration.version),
    compatible,
  };
}

export async function getMigrationStatus(
  pool: Pool,
  directory = defaultMigrationDirectory,
): Promise<MigrationStatus> {
  const migrations = await loadMigrations(directory);
  const applied = (await migrationTableExists(pool))
    ? await readApplied(pool)
    : [];
  return statusFrom(migrations, applied);
}

export async function verifyMigrations(
  pool: Pool,
  directory = defaultMigrationDirectory,
): Promise<MigrationStatus> {
  const status = await getMigrationStatus(pool, directory);

  if (!status.compatible || status.pendingVersions.length > 0) {
    throw new Error(
      `Database schema is incompatible: current=${status.currentVersion} latest=${status.latestVersion}`,
    );
  }

  return status;
}

export async function applyMigrations(
  pool: Pool,
  directory = defaultMigrationDirectory,
): Promise<MigrationResult> {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  let appliedCount = 0;

  try {
    await client.query("select pg_advisory_lock($1)", [migrationLock]);
    await client.query(`
      create table if not exists public.platform_schema_migrations (
        version integer primary key,
        name text not null,
        checksum text not null,
        applied_at timestamptz not null default clock_timestamp()
      )
    `);

    const applied = await readApplied(client);
    const status = statusFrom(migrations, applied);
    if (!status.compatible) {
      throw new Error(
        "Database migration history does not match the migration files",
      );
    }

    const appliedVersions = new Set(
      applied.map((migration) => migration.version),
    );
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query(
          "insert into public.platform_schema_migrations (version, name, checksum) values ($1, $2, $3)",
          [migration.version, migration.name, migration.checksum],
        );
        await client.query("commit");
        appliedCount += 1;
      } catch (error) {
        await client.query("rollback");
        const message =
          error instanceof Error ? error.message : "unknown database error";
        throw new Error(`Migration ${migration.fileName} failed: ${message}`, {
          cause: error,
        });
      }
    }

    return {
      appliedCount,
      currentVersion: migrations.at(-1)?.version ?? 0,
    };
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [migrationLock])
      .catch(() => undefined);
    client.release();
  }
}
