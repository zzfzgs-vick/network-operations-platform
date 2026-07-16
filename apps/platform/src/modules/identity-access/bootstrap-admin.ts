import { AuditStore } from "../audit/public.js";
import { readDatabaseConfig } from "../../database/config.js";
import { createDatabasePool } from "../../database/database.js";
import { verifyMigrations } from "../../database/migrations.js";
import { readSecret, requiredString } from "../../config/public.js";
import { PostgresLocalIdentityService } from "./adapters/postgres/postgres-local-identity-service.js";
import { BootstrapClosedError } from "./public.js";

const pool = createDatabasePool(readDatabaseConfig(process.env));

try {
  await verifyMigrations(pool);
  const username = requiredString(process.env, "ADMIN_USERNAME");
  const password = readSecret(process.env, "ADMIN_PASSWORD");
  const service = new PostgresLocalIdentityService(pool, new AuditStore(pool));
  const user = await service.bootstrapAdministrator({
    username,
    password: password.reveal(),
  });
  process.stdout.write(
    `${JSON.stringify({ status: "initialized", userId: user.userId, username: user.username, createdAt: user.createdAt })}\n`,
  );
} catch (error) {
  const message =
    error instanceof BootstrapClosedError
      ? error.message
      : "Administrator bootstrap failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
