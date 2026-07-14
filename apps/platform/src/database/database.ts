import { Pool, type PoolClient, type PoolConfig } from "pg";

import type { DatabaseConfig } from "./config.js";

function poolConfig(config: DatabaseConfig): PoolConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    ssl:
      config.sslMode === "disable"
        ? false
        : { rejectUnauthorized: config.sslMode === "verify-full" },
  };
}

export function createDatabasePool(config: DatabaseConfig) {
  return new Pool(poolConfig(config));
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    try {
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    client.release();
  }
}
