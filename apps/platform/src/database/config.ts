export type DatabaseSslMode = "disable" | "require" | "verify-full";

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

type Environment = Readonly<Record<string, string | undefined>>;

function required(environment: Environment, name: string) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function positiveInteger(
  environment: Environment,
  name: string,
  fallback: number,
) {
  const raw = environment[name];
  const value = raw === undefined ? fallback : Number(raw);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function sslMode(environment: Environment): DatabaseSslMode {
  const value = environment.DATABASE_SSL_MODE ?? "disable";

  if (value === "disable" || value === "require" || value === "verify-full") {
    return value;
  }

  throw new Error("DATABASE_SSL_MODE must be disable, require, or verify-full");
}

export function readDatabaseConfig(
  environment: Environment = process.env,
): DatabaseConfig {
  return {
    host: required(environment, "DATABASE_HOST"),
    port: positiveInteger(environment, "DATABASE_PORT", 5432),
    database: required(environment, "DATABASE_NAME"),
    user: required(environment, "DATABASE_USER"),
    password: required(environment, "DATABASE_PASSWORD"),
    sslMode: sslMode(environment),
    poolMax: positiveInteger(environment, "DATABASE_POOL_MAX", 10),
    connectTimeoutMs: positiveInteger(
      environment,
      "DATABASE_CONNECT_TIMEOUT_MS",
      5000,
    ),
    queryTimeoutMs: positiveInteger(
      environment,
      "DATABASE_QUERY_TIMEOUT_MS",
      10000,
    ),
  };
}
