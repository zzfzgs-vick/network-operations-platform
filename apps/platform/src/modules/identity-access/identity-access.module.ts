import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import {
  DatabaseModule,
  DatabaseService,
} from "../../database/database.module.js";
import { AuditStore } from "../audit/public.js";
import { PostgresAuthorizationService } from "./adapters/postgres/postgres-authorization-service.js";
import { PermissionGuard } from "./adapters/http/permission.guard.js";
import {
  AuthorizationMetrics,
  USER_AUTHORIZER,
} from "./application/authorization.js";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    AuthorizationMetrics,
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
    PermissionGuard,
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
  exports: [AuthorizationMetrics, PostgresAuthorizationService],
})
export class IdentityAccessModule {}
