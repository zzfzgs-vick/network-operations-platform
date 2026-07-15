import {
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { readDatabaseConfig } from "./config.js";
import { createDatabasePool, withTransaction } from "./database.js";
import { verifyMigrations } from "./migrations.js";

export interface DatabaseStatus {
  readonly connected: boolean;
  readonly compatible: boolean;
  readonly currentVersion: number | null;
  readonly latestVersion: number | null;
}

function databaseStartupCheckIsDisabledForUnitTests() {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.DATABASE_STARTUP_CHECK === "disabled"
  );
}

@Injectable()
export class DatabaseService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DatabaseService.name);
  private poolValue: Pool | undefined;
  private statusValue: DatabaseStatus = {
    connected: false,
    compatible: false,
    currentVersion: null,
    latestVersion: null,
  };

  get pool() {
    if (!this.poolValue) {
      throw new Error("Database is not configured");
    }
    return this.poolValue;
  }

  get status() {
    return this.statusValue;
  }

  async onApplicationBootstrap() {
    if (databaseStartupCheckIsDisabledForUnitTests()) {
      return;
    }

    const pool = createDatabasePool(readDatabaseConfig());
    this.poolValue = pool;
    pool.on("error", () => {
      this.statusValue = { ...this.statusValue, connected: false };
      this.logger.error("PostgreSQL connection became unavailable");
    });

    try {
      await this.checkReadiness();
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  async checkReadiness() {
    try {
      await this.pool.query("select 1");
      if (!this.statusValue.compatible) {
        const migration = await verifyMigrations(this.pool);
        this.statusValue = {
          connected: true,
          compatible: migration.compatible,
          currentVersion: migration.currentVersion,
          latestVersion: migration.latestVersion,
        };
      } else {
        this.statusValue = { ...this.statusValue, connected: true };
      }
      return this.statusValue.compatible;
    } catch (error) {
      this.statusValue = { ...this.statusValue, connected: false };
      throw error;
    }
  }

  transaction<T>(work: (client: PoolClient) => Promise<T>) {
    return withTransaction(this.pool, work);
  }

  async onApplicationShutdown() {
    if (this.poolValue && !this.poolValue.ended) {
      await this.poolValue.end();
    }
    this.statusValue = { ...this.statusValue, connected: false };
  }
}

@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
