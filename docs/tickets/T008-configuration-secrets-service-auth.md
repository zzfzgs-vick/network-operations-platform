# T008：配置加载、Secret 边界与内部服务认证

## 状态

DONE

## 完成记录

- WSL Ubuntu 24.04 本地原生 Node.js、Go、配置、服务认证、真实 PostgreSQL 18.4、运行健康及跨进程冒烟验收：通过。
- GitHub Actions Ubuntu 24.04 与 Windows 验收：通过。
- 对应 Git Commit：实现 `b191c67d21dbe9776c135c971d3263fca84280c3`；Windows PowerShell 冒烟可移植性修正 `056b0893aa83f82742e9432a8c3e047b1656e69a`。
- CI 可识别信息：GitHub Actions workflow `quality`，最终通过 run `29385856506`，Ubuntu job `87258860554`，Windows job `87258860542`；运行地址：<https://github.com/zzfzgs-vick/network-operations-platform/actions/runs/29385856506>。

## 目标

为 API、Worker、Go、PostgreSQL、VictoriaMetrics 和 vmalert 建立可验证且不泄密的配置边界。

## 背景

后续认证和采集需要 Secret，但真实值不能进入 Git、合同、日志或普通错误。

## 对应规格

- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-SEC-002
- MVP-SEC-003
- MVP-SEC-004
- MVP-ARC-016
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)

## 前置依赖

- [T007](T007-platform-observability-health-baseline.md)

## 允许修改范围

- `apps/platform/src/config/`
- `services/collector/internal/config/`
- `deploy/secrets/README.md`
- `.env.example`
- `tests/integration/config/`
- `docs/tickets/T008-configuration-secrets-service-auth.md`
- `apps/platform/package.json`
- `apps/platform/src/bootstrap/api-app.module.ts`
- `apps/platform/src/bootstrap/worker-app.module.ts`
- `apps/platform/src/main.ts`
- `apps/platform/src/database/config.ts`
- `apps/platform/src/database/unit-test-setup.ts`
- `apps/platform/src/modules/platform-health/platform-health.module.ts`
- `services/collector/cmd/collector/main.go`
- `services/collector/cmd/collector/main_test.go`
- `tests/integration/health/run.mjs`
- `deploy/compose/dev.compose.yml`
- `.gitignore`
- `scripts/smoke-runtimes.ps1`
- `scripts/smoke-runtimes.sh`

T008 的配置和内部服务认证能力必须接入 API、Worker、Collector、健康指标、Compose 及真实测试入口。现有测试脚本会忽略 config 选择器，integration 入口也不识别 service-auth，因此需要最小范围修正才能形成可执行验收。

T008 启用默认拒绝的服务认证后，现有跨平台运行时冒烟脚本必须为不同服务进程注入隔离的测试专用凭据，否则干净 CI 环境中的 Collector 会按设计快速失败。

## 禁止修改范围

不得提交真实 Secret、实现 Vault/Keycloak、创建 SNMP 凭据业务模型或公网暴露内部 Ingest。

## 实施要求

- 集中校验必需配置、类型、编码和环境差异，支持环境变量/挂载 Secret 文件。
- 实现日志/错误 redaction 和配置缺失 fail-fast。
- 为 Collector 与 vmalert 内部接口建立可轮换服务身份认证。
- 文档化开发占位 Secret 与生产注入边界。

## 数据库与迁移影响

无业务迁移；服务凭据不得明文入库。

## 安全影响

高影响；覆盖 Secret 生命周期、轮换边界和内部网络认证。

## 可观测性要求

记录配置加载成功类别和认证失败计数，不记录值。

## 测试要求

- 缺失/错误配置、CRLF Secret、轮换和日志泄露测试。
- 未认证内部请求被拒绝。

## 验收命令

- `npm run test --workspace apps/platform -- config`
- `npm run test:integration --workspace apps/platform -- service-auth`
- `go test ./services/collector/... -run Config`
- `npm run verify`

## 完成定义

- 所有进程使用同一约定加载配置。
- 内部接口默认拒绝未认证请求。
- 日志扫描无 Secret。

## 明确非目标

不实现用户认证、SNMP Credential 或生产密钥管理系统。

## 风险与回滚

风险：错误 redaction 可能漏值；以固定 canary Secret 做日志扫描。

回滚：回退配置适配器并撤销测试凭据；无数据迁移。

## 后续 Ticket

- [T009](T009-runtime-containers-graceful-lifecycle.md)
- [T011](T011-local-users-password-bootstrap.md)
- T025
