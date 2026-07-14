import { pathToFileURL } from "node:url";

import { readDatabaseConfig } from "./database/config.js";
import { createDatabasePool } from "./database/database.js";
import {
  applyMigrations,
  getMigrationStatus,
  verifyMigrations,
} from "./database/migrations.js";

type MigrationCommand = "up" | "status" | "verify";

export async function runMigrationCommand(command: MigrationCommand) {
  const pool = createDatabasePool(readDatabaseConfig());

  try {
    if (command === "up") {
      const result = await applyMigrations(pool);
      console.info(
        `database migrations applied=${result.appliedCount} current=${result.currentVersion}`,
      );
      return;
    }

    const status =
      command === "verify"
        ? await verifyMigrations(pool)
        : await getMigrationStatus(pool);
    console.info(
      `database migrations compatible=${status.compatible} current=${status.currentVersion} latest=${status.latestVersion} pending=${status.pendingVersions.join(",") || "none"}`,
    );
  } finally {
    await pool.end();
  }
}

const entry = process.argv[1];

if (entry && import.meta.url === pathToFileURL(entry).href) {
  const command = process.argv[2];

  if (command !== "up" && command !== "status" && command !== "verify") {
    console.error("Usage: migrate <up|status|verify>");
    process.exitCode = 2;
  } else {
    void runMigrationCommand(command).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "unknown database error";
      console.error(`database migration failed: ${message}`);
      process.exitCode = 1;
    });
  }
}
