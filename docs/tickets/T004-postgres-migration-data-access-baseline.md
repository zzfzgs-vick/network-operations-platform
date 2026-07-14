# T004：PostgreSQL 迁移与数据库访问基线

## 状态

DONE

## 完成记录

- Windows 11 本地质量、迁移、真实 PostgreSQL 18.4 集成及 runtime smoke 验收：通过。
- WSL Ubuntu 24.04 本地质量、构建和真实 PostgreSQL 18.4 集成验收：通过。
- 对应 Git Commits：实现 `fcac2ab747c243eff69b6732cef171e60c9a816a`；CI runtime smoke 兼容修正 `45fe67970d0ad149ba473d4a11243d3cd730c774`。
- CI 可识别信息：GitHub Actions workflow `quality`，run `29324289212`，Ubuntu job `87056748058`，Windows job `87056748068`；运行地址：<https://github.com/zzfzgs-vick/network-operations-platform/actions/runs/29324289212>。

## 目标

建立显式、串行、可测试的全局迁移入口和事务边界，不创建业务领域表。

## 背景

API 和 Worker 共享一个数据库与一条迁移历史，启动时只能检查版本，不能自动同步 Schema。

## 对应规格

- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-023
- MVP-ARC-004
- MVP-ARC-012
- MVP-ARC-018
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖

- [T003](T003-local-compose-infrastructure.md)

## 允许修改范围

- `apps/platform/package.json`
- `package-lock.json`
- `apps/platform/src/bootstrap/api-app.module.ts`
- `apps/platform/src/bootstrap/worker-app.module.ts`
- `apps/platform/src/database/`
- `apps/platform/src/migrate.ts`
- `apps/platform/migrations/`
- `tests/integration/database/`
- `scripts/db-*`
- `.env.example`
- `deploy/compose/dev.compose.yml`

T004 建立 PostgreSQL 数据访问和迁移基线，需要在 Platform 包中声明依赖和命令、更新唯一 npm 锁文件、装配 API/Worker 数据库边界，并向开发 Compose 与环境示例补充一致配置。

## 禁止修改范围

不得创建用户、资产、采集、Condition、Alert、Health 或 Incident 表；不得让 API/Worker 启动时自动迁移。

## 实施要求

- 选择最小迁移与 PostgreSQL 访问方案，记录版本和命令。
- 实现显式 migrate 入口、事务 helper、迁移状态检查和连接健康。
- 建立测试数据库生命周期与一条只验证迁移机制的基线迁移。
- 发布迁移不可修改；回滚采用明确 down 或前向修复策略。

## 数据库与迁移影响

新增迁移元数据和基线迁移；不含业务表。

## 安全影响

数据库 URL 通过配置注入，错误不得回显凭据。

## 可观测性要求

暴露连接、迁移版本和不兼容状态。

## 测试要求

- 真实 PostgreSQL 验证空库升级、重复执行和版本不兼容。
- 验证 API/Worker 仅检查版本。

## 验收命令

- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- database`
- `npm run typecheck`

## 完成定义

- 空库可显式迁移且重复执行幂等。
- API/Worker 不自动改 Schema。
- 升级/前向修复策略记录清楚。

## 明确非目标

不创建任何业务 Schema，不实现 T006 队列表。

## 风险与回滚

风险：迁移工具锁定错误会阻塞后续；以真实 PostgreSQL 并发测试验证。

回滚：回退基线迁移或重建空测试库；生产尚无业务数据。

## 后续 Ticket

- [T006](T006-postgres-reliable-work-tracer.md)
