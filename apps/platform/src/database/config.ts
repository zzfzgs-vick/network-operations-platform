import {
  readPlatformDatabaseConfig,
  type DatabaseSslMode,
  type Environment,
} from "../config/public.js";
import { inspect } from "node:util";

export type { DatabaseSslMode };

export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly sslMode: DatabaseSslMode;
  readonly poolMax: number;
  readonly connectTimeoutMs: number;
  readonly queryTimeoutMs: number;
}

export function readDatabaseConfig(
  environment: Environment = process.env,
): DatabaseConfig {
  const config = readPlatformDatabaseConfig(environment);
  const databaseConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password.reveal(),
    sslMode: config.sslMode,
    poolMax: config.poolMax,
    connectTimeoutMs: config.connectTimeoutMs,
    queryTimeoutMs: config.queryTimeoutMs,
  };
  const safeProjection = () => ({
    ...databaseConfig,
    password: "[REDACTED]",
  });
  Object.defineProperties(databaseConfig, {
    toJSON: { enumerable: false, value: safeProjection },
    [inspect.custom]: { enumerable: false, value: safeProjection },
  });
  return Object.freeze(databaseConfig);
}
