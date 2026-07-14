import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { PlatformHealthWorkerModule } from "../modules/platform-health/platform-health.module.js";

@Module({ imports: [DatabaseModule, PlatformHealthWorkerModule] })
export class WorkerAppModule {}
