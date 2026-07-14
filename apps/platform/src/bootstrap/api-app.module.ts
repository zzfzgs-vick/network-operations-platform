import { Controller, Get, Module } from "@nestjs/common";

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

@Module({ controllers: [RuntimeController] })
export class ApiAppModule {}
