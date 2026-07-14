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

import { DatabaseModule } from "../database/database.module.js";
import { ContractExceptionFilter } from "../http/contract-exception.filter.js";
import { RequestIdMiddleware, requestIdFrom } from "../http/request-id.js";

@Controller()
class RuntimeController {
  @Get()
  getRuntime(@Req() request: IncomingMessage): RuntimeHealthResponse {
    return {
      contractVersion: CONTRACT_VERSION,
      service: "platform-api",
      status: "READY",
      version: process.env.APP_VERSION ?? "dev",
      requestId: requestIdFrom(request),
    };
  }
}

@Module({
  imports: [DatabaseModule],
  controllers: [RuntimeController],
  providers: [{ provide: APP_FILTER, useClass: ContractExceptionFilter }],
})
export class ApiAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
