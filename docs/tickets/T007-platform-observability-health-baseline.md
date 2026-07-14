# T007：平台可观测性与健康检查基线

## 状态

DONE

## 完成记录

- Windows 11 本地质量、迁移、真实 PostgreSQL 18.4、运行健康及跨进程冒烟验收：通过。
- GitHub Actions Ubuntu 24.04 与 Windows 验收：通过。
- 对应 Git Commit：实现 `b89100583908e8a3fe2ad4b9a03ae3db78bd4a89`；CI 可移植性修正 `5c8414589b7f75c58156962552ea261a37a7f776`、`db6a3c145c6348c0cf2f35b46ee3ddb12726cec7`。
- CI 可识别信息：GitHub Actions workflow `quality`，最终通过 run `29347400192`，Ubuntu job `87134578951`，Windows job `87134578995`；运行地址：<https://github.com/zzfzgs-vick/network-operations-platform/actions/runs/29347400192>。

## 目标

统一 API、Worker、Go 和依赖服务的存活、就绪、版本及可靠工作指标。

## 背景

平台故障不能被误解为业务健康，且后续容量/降级验收需要一致的指标名称。

## 对应规格

- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-COL-007
- MVP-JOB-009
- MVP-OPS-010
- MVP-OPS-012
- MVP-OPS-013
- MVP-GEN-006
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖

- [T003](T003-local-compose-infrastructure.md)
- [T006](T006-postgres-reliable-work-tracer.md)

## 允许修改范围

- `apps/platform/src/modules/platform-health/`
- `services/collector/internal/observability/`
- `deploy/metrics/`
- `tests/integration/health/`
- `docs/architecture/ 的实现备注`
- `apps/platform/package.json`
- `apps/platform/src/bootstrap/api-app.module.ts`
- `apps/platform/src/bootstrap/worker-app.module.ts`
- `apps/platform/migrations/0003_platform_health_foundation.up.sql`
- `apps/platform/migrations/README.md`
- `apps/platform/src/modules/reliable-work/public.ts`
- `services/collector/cmd/collector/main.go`
- `services/collector/cmd/collector/main_test.go`
- `.env.example`
- `deploy/compose/dev.compose.yml`
- `scripts/smoke-runtimes.ps1`
- `scripts/smoke-runtimes.sh`

T007 的健康与可观测性基线必须接入 API、Worker、Collector 和 Compose 的真实运行入口，并通过统一跨平台冒烟脚本验收；Worker heartbeat 需要新增版本化迁移，Inbox duplicate 指标必须读取真实可靠工作状态。

## 禁止修改范围

不得实现业务 Health Status、业务 Alert Rule、外部监控系统或高基数标签。

## 实施要求

- 区分 liveness/readiness/dependency health，暴露版本、启动时间和最近成功时间。
- 纳入 PostgreSQL、VictoriaMetrics、vmalert、Worker heartbeat、Inbox/Outbox/Job 指标。
- 定义受控低基数标签和安全错误摘要。
- 依赖故障返回降级/不可用，不输出假绿色。

## 数据库与迁移影响

可新增 Worker heartbeat/运行状态所需最小迁移；不创建业务健康表。

## 安全影响

公开 health 不泄露拓扑、凭据、版本细节以外的敏感配置。

## 可观测性要求

本 Ticket 即建立平台观测基线。

## 测试要求

- 逐个断开依赖验证状态差异。
- 标签基数和敏感信息扫描。

## 验收命令

- `npm run test:integration --workspace apps/platform -- platform-health`
- `go test ./services/collector/... -run Health`
- `pwsh -File scripts/smoke-runtimes.ps1`

## 完成定义

- 四类进程和三项依赖可区分。
- 可靠工作积压可被观测。
- 故障不呈现为正常。

## 明确非目标

不建立用户可编辑业务告警或外部探针。

## 风险与回滚

风险：健康接口自依赖造成盲点；liveness 与 dependency readiness 分离。

回滚：移除指标接线和可选 heartbeat 迁移，不影响业务数据。

## 后续 Ticket

- [T008](T008-configuration-secrets-service-auth.md)
- [T009](T009-runtime-containers-graceful-lifecycle.md)
- T057
