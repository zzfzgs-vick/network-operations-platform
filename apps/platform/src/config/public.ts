import { readFileSync, statSync } from "node:fs";
import { inspect, TextDecoder } from "node:util";

export type Environment = Readonly<Record<string, string | undefined>>;
export type SecretFileReader = (path: string) => Buffer;
export type RuntimeEnvironment = "development" | "test" | "production";

function readProtectedSecretFile(path: string): Buffer {
  const metadata = statSync(path);
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error("Secret file permissions are too broad");
  }
  return readFileSync(path);
}

export class SecretValue {
  constructor(private readonly value: string) {}

  reveal(): string {
    return this.value;
  }

  toString(): string {
    return "[REDACTED]";
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  [inspect.custom](): string {
    return "[REDACTED]";
  }
}

export function runtimeEnvironment(
  environment: Environment,
): RuntimeEnvironment {
  const value = environment.NODE_ENV ?? "development";
  if (value === "development" || value === "test" || value === "production") {
    return value;
  }
  throw new Error("NODE_ENV must be development, test, or production");
}

function withoutOneLineEnding(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

export function readSecret(
  environment: Environment,
  name: string,
  fileReader: SecretFileReader = readProtectedSecretFile,
): SecretValue {
  const direct = environment[name];
  const fileName = `${name}_FILE`;
  const path = environment[fileName];

  if (direct !== undefined && path !== undefined) {
    throw new Error(`${name} and ${fileName} cannot both be set`);
  }
  if (direct === undefined && path === undefined) {
    throw new Error(`${name} is required`);
  }
  if (
    direct !== undefined &&
    runtimeEnvironment(environment) === "production"
  ) {
    throw new Error(`${name} must use ${fileName} in production`);
  }

  let value: string;
  if (path !== undefined) {
    let content: Buffer;
    try {
      content = fileReader(path);
    } catch {
      throw new Error(`${fileName} could not be read`);
    }
    if (content.byteLength > 4096) {
      throw new Error(`${fileName} exceeds 4096 bytes`);
    }
    try {
      value = withoutOneLineEnding(
        new TextDecoder("utf-8", { fatal: true }).decode(content),
      );
    } catch {
      throw new Error(`${fileName} must contain UTF-8`);
    }
  } else {
    value = direct ?? "";
  }

  if (Buffer.byteLength(value, "utf8") > 4096) {
    throw new Error(`${name} exceeds 4096 bytes`);
  }

  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`);
  }
  return new SecretValue(value);
}

export function readOptionalSecret(
  environment: Environment,
  name: string,
  fileReader?: SecretFileReader,
): SecretValue | undefined {
  if (
    environment[name] === undefined &&
    environment[`${name}_FILE`] === undefined
  ) {
    return undefined;
  }
  return readSecret(environment, name, fileReader);
}

export function requiredString(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function integer(
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

const stableValuePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function stableValue(
  environment: Environment,
  name: string,
  fallback: string,
  maximumLength: number,
): string {
  const value = environment[name]?.trim() || fallback;
  if (value.length > maximumLength || !stableValuePattern.test(value)) {
    throw new Error(`${name} must be a bounded stable value`);
  }
  return value;
}

export function httpUrl(
  environment: Environment,
  name: string,
  fallback: string,
): URL {
  let url: URL;
  try {
    url = new URL(environment[name] ?? fallback);
  } catch {
    throw new Error(`${name} must be an HTTP URL without credentials`);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an HTTP URL without credentials`);
  }
  return url;
}

export interface ApiListenConfig {
  readonly host: string;
  readonly port: number;
}

export function readApiListenConfig(
  environment: Environment = process.env,
): ApiListenConfig {
  const host = environment.HOST?.trim() || "127.0.0.1";
  if (
    host !== "127.0.0.1" &&
    host !== "localhost" &&
    host !== "::1" &&
    host !== "0.0.0.0"
  ) {
    throw new Error("HOST must use a controlled interface");
  }
  return {
    host,
    port: integer(environment, "PORT", 3000, 1, 65535),
  };
}

export interface WebOriginConfig {
  readonly origin: string;
}

export function readWebOriginConfig(
  environment: Environment = process.env,
): WebOriginConfig {
  const fallback = `http://127.0.0.1:${environment.PORT ?? "3000"}`;
  const url = httpUrl(environment, "WEB_ORIGIN", fallback);
  if (url.origin === "null" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("WEB_ORIGIN must contain only one HTTP origin");
  }
  if (
    runtimeEnvironment(environment) === "production" &&
    url.protocol !== "https:"
  ) {
    throw new Error("WEB_ORIGIN must use HTTPS in production");
  }
  return { origin: url.origin };
}

export interface RuntimeIdentityConfig {
  readonly version: string;
  readonly logLevel: "debug" | "info" | "warn" | "error";
}

export function readRuntimeIdentityConfig(
  environment: Environment = process.env,
): RuntimeIdentityConfig {
  const logLevel = environment.LOG_LEVEL ?? "info";
  if (
    logLevel !== "debug" &&
    logLevel !== "info" &&
    logLevel !== "warn" &&
    logLevel !== "error"
  ) {
    throw new Error("LOG_LEVEL must be debug, info, warn, or error");
  }
  return {
    version: stableValue(environment, "APP_VERSION", "dev", 128),
    logLevel,
  };
}

export type DatabaseSslMode = "disable" | "require" | "verify-full";

export interface PlatformDatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: SecretValue;
  readonly sslMode: DatabaseSslMode;
  readonly poolMax: number;
  readonly connectTimeoutMs: number;
  readonly queryTimeoutMs: number;
}

export function readPlatformDatabaseConfig(
  environment: Environment = process.env,
): PlatformDatabaseConfig {
  const sslMode = environment.DATABASE_SSL_MODE ?? "disable";
  if (
    sslMode !== "disable" &&
    sslMode !== "require" &&
    sslMode !== "verify-full"
  ) {
    throw new Error(
      "DATABASE_SSL_MODE must be disable, require, or verify-full",
    );
  }
  return {
    host: requiredString(environment, "DATABASE_HOST"),
    port: integer(environment, "DATABASE_PORT", 5432, 1, 65535),
    database: requiredString(environment, "DATABASE_NAME"),
    user: requiredString(environment, "DATABASE_USER"),
    password: readSecret(environment, "DATABASE_PASSWORD"),
    sslMode,
    poolMax: integer(environment, "DATABASE_POOL_MAX", 10, 1, 100),
    connectTimeoutMs: integer(
      environment,
      "DATABASE_CONNECT_TIMEOUT_MS",
      5000,
      1,
      60000,
    ),
    queryTimeoutMs: integer(
      environment,
      "DATABASE_QUERY_TIMEOUT_MS",
      10000,
      1,
      300000,
    ),
  };
}

export interface RuntimeHealthConfig {
  readonly victoriaMetricsUrl: URL;
  readonly vmAlertUrl: URL;
  readonly timeoutMs: number;
  readonly heartbeatIntervalMs: number;
  readonly heartbeatStaleAfterMs: number;
  readonly workerInstanceId: string;
}

export function readRuntimeHealthConfig(
  environment: Environment = process.env,
): RuntimeHealthConfig {
  const heartbeatIntervalMs = integer(
    environment,
    "WORKER_HEARTBEAT_INTERVAL_MS",
    5000,
    1,
    300000,
  );
  const heartbeatStaleAfterMs = integer(
    environment,
    "WORKER_HEARTBEAT_STALE_AFTER_MS",
    15000,
    1,
    900000,
  );
  if (heartbeatStaleAfterMs <= heartbeatIntervalMs) {
    throw new Error(
      "WORKER_HEARTBEAT_STALE_AFTER_MS must exceed WORKER_HEARTBEAT_INTERVAL_MS",
    );
  }
  return {
    victoriaMetricsUrl: httpUrl(
      environment,
      "VICTORIAMETRICS_URL",
      "http://127.0.0.1:8428",
    ),
    vmAlertUrl: httpUrl(environment, "VMALERT_URL", "http://127.0.0.1:8880"),
    timeoutMs: integer(
      environment,
      "PLATFORM_HEALTH_TIMEOUT_MS",
      2000,
      1,
      60000,
    ),
    heartbeatIntervalMs,
    heartbeatStaleAfterMs,
    workerInstanceId: stableValue(
      environment,
      "WORKER_INSTANCE_ID",
      "platform-worker-local",
      128,
    ),
  };
}

export interface RuntimeShutdownConfig {
  readonly apiDrainTimeoutMs: number;
  readonly apiShutdownTimeoutMs: number;
  readonly workerShutdownTimeoutMs: number;
}

export interface WebSessionConfig {
  readonly preAuthenticationTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly absoluteTimeoutMs: number;
  readonly revalidationIntervalMs: number;
}

export function readWebSessionConfig(
  environment: Environment = process.env,
): WebSessionConfig {
  const preAuthenticationTimeoutMs = integer(
    environment,
    "SESSION_PRE_AUTH_TIMEOUT_MS",
    5 * 60 * 1000,
    60_000,
    5 * 60 * 1000,
  );
  const idleTimeoutMs = integer(
    environment,
    "SESSION_IDLE_TIMEOUT_MS",
    30 * 60 * 1000,
    60_000,
    60 * 60 * 1000,
  );
  const absoluteTimeoutMs = integer(
    environment,
    "SESSION_ABSOLUTE_TIMEOUT_MS",
    12 * 60 * 60 * 1000,
    idleTimeoutMs,
    24 * 60 * 60 * 1000,
  );
  const revalidationIntervalMs = integer(
    environment,
    "SESSION_REVALIDATION_INTERVAL_MS",
    5_000,
    100,
    60_000,
  );
  return {
    preAuthenticationTimeoutMs,
    idleTimeoutMs,
    absoluteTimeoutMs,
    revalidationIntervalMs,
  };
}

export function readRuntimeShutdownConfig(
  environment: Environment = process.env,
): RuntimeShutdownConfig {
  const apiDrainTimeoutMs = integer(
    environment,
    "API_DRAIN_TIMEOUT_MS",
    5000,
    1,
    60000,
  );
  const apiShutdownTimeoutMs = integer(
    environment,
    "API_SHUTDOWN_TIMEOUT_MS",
    15000,
    1,
    120000,
  );
  if (apiShutdownTimeoutMs < apiDrainTimeoutMs) {
    throw new Error(
      "API_SHUTDOWN_TIMEOUT_MS must not be shorter than API_DRAIN_TIMEOUT_MS",
    );
  }
  return {
    apiDrainTimeoutMs,
    apiShutdownTimeoutMs,
    workerShutdownTimeoutMs: integer(
      environment,
      "WORKER_SHUTDOWN_TIMEOUT_MS",
      15000,
      1,
      120000,
    ),
  };
}

export function safeConfigurationSummary(
  environment: Environment = process.env,
) {
  const listen = readApiListenConfig(environment);
  const database = readPlatformDatabaseConfig(environment);
  const health = readRuntimeHealthConfig(environment);
  const runtime = readRuntimeIdentityConfig(environment);
  const shutdown = readRuntimeShutdownConfig(environment);
  const session = readWebSessionConfig(environment);
  return {
    environment: runtimeEnvironment(environment),
    version: runtime.version,
    logLevel: runtime.logLevel,
    listen,
    database: {
      host: database.host,
      port: database.port,
      database: database.database,
      user: database.user,
      sslMode: database.sslMode,
      poolMax: database.poolMax,
      connectTimeoutMs: database.connectTimeoutMs,
      queryTimeoutMs: database.queryTimeoutMs,
    },
    health: {
      victoriaMetricsOrigin: health.victoriaMetricsUrl.origin,
      vmAlertOrigin: health.vmAlertUrl.origin,
      timeoutMs: health.timeoutMs,
      heartbeatIntervalMs: health.heartbeatIntervalMs,
      heartbeatStaleAfterMs: health.heartbeatStaleAfterMs,
      workerInstanceId: health.workerInstanceId,
    },
    shutdown,
    session,
  };
}

export const loadedConfigurationCategories = [
  "database",
  "internal_service_authentication",
  "runtime",
  "runtime_health",
  "web_session",
] as const;
