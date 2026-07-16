import {
  Controller,
  Get,
  Injectable,
  MiddlewareConsumer,
  Module,
  ServiceUnavailableException,
  type NestModule,
  type NestMiddleware,
  Req,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CONTRACT_VERSION, type RuntimeHealthResponse } from "@nop/contracts";
import type { IncomingMessage, ServerResponse } from "node:http";

import { readRuntimeIdentityConfig } from "../config/public.js";
import { InternalServiceAuthModule } from "../config/service-auth.js";
import { DatabaseModule } from "../database/database.module.js";
import { ContractExceptionFilter } from "../http/contract-exception.filter.js";
import { RequestIdMiddleware, requestIdFrom } from "../http/request-id.js";
import { RuntimeLifecycle } from "../lifecycle.js";
import { IdentityAccessModule } from "../modules/identity-access/identity-access.module.js";
import { PublicEndpoint } from "../modules/identity-access/public.js";
import { PlatformHealthApiModule } from "../modules/platform-health/platform-health.module.js";

@Injectable()
class RuntimeDrainMiddleware implements NestMiddleware {
  constructor(private readonly lifecycle: RuntimeLifecycle) {}

  use(
    request: IncomingMessage & { originalUrl?: string },
    response: ServerResponse,
    next: () => void,
  ) {
    const path = (request.originalUrl ?? request.url ?? "/")
      .split("?", 1)[0]
      ?.toLowerCase();
    if (
      path === "/health/live" ||
      path === "/health/ready" ||
      path === "/metrics"
    ) {
      next();
      return;
    }

    const release = this.lifecycle.acceptWork();
    if (!release) throw new ServiceUnavailableException("Service is draining");
    response.once("finish", release);
    response.once("close", release);
    next();
  }
}

@Controller()
class RuntimeController {
  @Get()
  @PublicEndpoint()
  getRuntime(@Req() request: IncomingMessage): RuntimeHealthResponse {
    const runtime = readRuntimeIdentityConfig();
    return {
      contractVersion: CONTRACT_VERSION,
      service: "platform-api",
      status: "READY",
      version: runtime.version,
      requestId: requestIdFrom(request),
    };
  }
}

@Module({
  imports: [
    DatabaseModule,
    InternalServiceAuthModule,
    IdentityAccessModule,
    PlatformHealthApiModule,
  ],
  controllers: [RuntimeController],
  providers: [
    RuntimeDrainMiddleware,
    { provide: APP_FILTER, useClass: ContractExceptionFilter },
  ],
})
export class ApiAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, RuntimeDrainMiddleware).forRoutes("*");
  }
}
