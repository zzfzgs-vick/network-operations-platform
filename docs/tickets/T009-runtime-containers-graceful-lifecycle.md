# T009：API、Worker 和 Go 容器运行与优雅生命周期

## 状态

READY

## 目标
完成单主机运行容器的独立命令、迁移前置、资源保护和关停恢复基线。

## 背景
容器重启不是 HA，但 API/Worker/Collector 必须在 Docker stop 与主机重启后保持事务和租约可恢复。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-003
- MVP-ARC-004
- MVP-ARC-008
- MVP-ARC-009
- MVP-GEN-008
- MVP-ARC-001
- MVP-ARC-002
- MVP-ARC-007
- MVP-OPS-001
- MVP-OPS-009
- MVP-GEN-102
- MVP-GEN-114
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T007](T007-platform-observability-health-baseline.md)
- [T008](T008-configuration-secrets-service-auth.md)

## 允许修改范围
- `deploy/docker/`
- `deploy/compose/`
- `deploy/proxy/`
- `apps/platform 启停接线`
- `services/collector 启停接线`
- `tests/recovery/runtime/`

## 禁止修改范围
不得增加 HA、Kubernetes、自动迁移、多个 Worker 副本或生产真实 Secret。

## 实施要求
- 同一 platform 镜像以 API/Worker 不同命令运行，迁移作为短命显式命令。
- 配置 SIGTERM/Windows 终止路径、停止接收/认领、事务回滚和租约恢复。
- 定义单主机 Compose 生产形态草案、反向代理同源路径和合理资源保护。
- 验证 PostgreSQL 不可用时认证和配置写入 fail closed。

## 数据库与迁移影响
无新业务表；依赖 T004/T006 迁移。

## 安全影响
同源 HTTPS/内部网络边界，Compose 不含真实 Secret。

## 可观测性要求
容器状态、重启、优雅关闭时长和未完成工作可见。

## 测试要求
- Docker stop 中断 Worker 后任务可重认领。
- API/Worker 启动不自动迁移，Worker 无公开端口。

## 验收命令
- `docker compose -f deploy/compose/dev.compose.yml config`
- `npm run test:recovery -- runtime-shutdown`
- `pwsh -File scripts/smoke-compose.ps1`
- `npm run verify`

## 完成定义
- 三运行容器职责独立。
- 停止/重启不丢已提交工作。
- 部署仍是单主机非 HA。

## 明确非目标
不实现备份恢复、容量资源最终值或零停机升级。

## 风险与回滚
风险：关停超时可能留下重复执行；幂等与有限租约共同覆盖。

回滚：回退容器命令和 Compose 变更；数据 Schema 不变。

## 后续 Ticket
- [T017](T017-authentication-security-acceptance.md)
- T055
