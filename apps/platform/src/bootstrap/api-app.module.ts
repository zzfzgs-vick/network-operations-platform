import { Controller, Get, Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";

@Controller()
class RuntimeController {
  @Get()
  getRuntime() {
    return {
      service: "platform-api",
      version: process.env.APP_VERSION ?? "dev",
    };
  }
}

@Module({ imports: [DatabaseModule], controllers: [RuntimeController] })
export class ApiAppModule {}
