import { Global, Module } from "@nestjs/common";

import { IdentityAccessModule } from "../identity-access/identity-access.module.js";
import { SessionSseController, SessionSseMetrics } from "./session-sse.js";

@Global()
@Module({
  imports: [IdentityAccessModule],
  controllers: [SessionSseController],
  providers: [SessionSseMetrics],
  exports: [SessionSseMetrics],
})
export class SseModule {}
