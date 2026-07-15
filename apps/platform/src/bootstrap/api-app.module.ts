import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  type NestModule,
  Req,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CONTRACT_VERSION, type RuntimeHealthResponse } from "@nop/contracts";
import type { IncomingMessage } from "node:http";

import { readRuntimeIdentityConfig } from "../config/public.js";
import { InternalServiceAuthModule } from "../config/service-auth.js";
import { DatabaseModule } from "../database/database.module.js";
import { ContractExceptionFilter } from "../http/contract-exception.filter.js";
import { RequestIdMiddleware, requestIdFrom } from "../http/request-id.js";
import { PlatformHealthApiModule } from "../modules/platform-health/platform-health.module.js";

@Controller()
class RuntimeController {
  @Get()
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
  imports: [DatabaseModule, InternalServiceAuthModule, PlatformHealthApiModule],
  controllers: [RuntimeController],
  providers: [{ provide: APP_FILTER, useClass: ContractExceptionFilter }],
})
export class ApiAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
