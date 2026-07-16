import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import {
  DatabaseModule,
  DatabaseService,
} from "../../database/database.module.js";
import { AuditStore } from "../audit/public.js";
import { readWebSessionConfig } from "../../config/public.js";
import { SessionAuthenticationMiddleware } from "./adapters/http/session-authentication.middleware.js";
import { BrowserCsrfMiddleware } from "./adapters/http/browser-csrf.middleware.js";
import { SessionController } from "./adapters/http/session.controller.js";
import { PostgresAuthorizationService } from "./adapters/postgres/postgres-authorization-service.js";
import { PostgresSessionService } from "./adapters/postgres/postgres-session-service.js";
import { PermissionGuard } from "./adapters/http/permission.guard.js";
import {
  AuthorizationMetrics,
  USER_AUTHORIZER,
} from "./application/authorization.js";
import { CsrfMetrics, SessionMetrics } from "./application/session.js";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [SessionController],
  providers: [
    AuthorizationMetrics,
    SessionMetrics,
    CsrfMetrics,
    {
      provide: PostgresAuthorizationService,
      inject: [DatabaseService, AuthorizationMetrics],
      useFactory: (
        database: DatabaseService,
        metrics: AuthorizationMetrics,
      ) => {
        let audit: AuditStore | undefined;
        return new PostgresAuthorizationService(
          () => database.pool,
          {
            append: (client, input) => {
              audit ??= new AuditStore(database.pool);
              return audit.append(client, input);
            },
          },
          metrics,
        );
      },
    },
    { provide: USER_AUTHORIZER, useExisting: PostgresAuthorizationService },
    {
      provide: PostgresSessionService,
      inject: [DatabaseService, SessionMetrics],
      useFactory: (database: DatabaseService, metrics: SessionMetrics) => {
        let audit: AuditStore | undefined;
        return new PostgresSessionService(
          () => database.pool,
          {
            append: (client, input) => {
              audit ??= new AuditStore(database.pool);
              return audit.append(client, input);
            },
          },
          readWebSessionConfig(),
          metrics,
        );
      },
    },
    SessionAuthenticationMiddleware,
    BrowserCsrfMiddleware,
    PermissionGuard,
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
  exports: [
    AuthorizationMetrics,
    SessionMetrics,
    CsrfMetrics,
    PostgresAuthorizationService,
    PostgresSessionService,
    SessionAuthenticationMiddleware,
    BrowserCsrfMiddleware,
  ],
})
export class IdentityAccessModule {}
