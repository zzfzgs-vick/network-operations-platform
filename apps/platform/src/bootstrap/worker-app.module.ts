import { Module } from "@nestjs/common";

import { readRuntimeIdentityConfig } from "../config/public.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformHealthWorkerModule } from "../modules/platform-health/platform-health.module.js";

const runtimeIdentityProvider = {
  provide: "PLATFORM_RUNTIME_IDENTITY",
  useFactory: readRuntimeIdentityConfig,
};

@Module({
  imports: [DatabaseModule, PlatformHealthWorkerModule],
  providers: [runtimeIdentityProvider],
})
export class WorkerAppModule {}
