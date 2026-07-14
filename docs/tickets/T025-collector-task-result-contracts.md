# T025：Collector Node、采集任务与结果合同

## 状态
PLANNED

## 目标
建立 central-default 下可领取任务、提交结果和轮换服务凭据的明确控制面/Go 边界。

## 背景
控制面不能假设采集进程在 API 主机，Go 也不能直接访问数据库或前端。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-005
- MVP-ARC-006
- MVP-ARC-010
- MVP-COL-002
- MVP-COL-003
- MVP-SEC-003
- MVP-SEC-004
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T005](T005-shared-contracts-error-model.md)
- [T008](T008-configuration-secrets-service-auth.md)
- [T019](T019-managed-device-central-collector.md)
- [T017](T017-authentication-security-acceptance.md)

## 允许修改范围
- `apps/platform/src/modules/collection/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `services/collector/internal/platformclient/`
- `tests/contract/collector/`

## 禁止修改范围
不得实现远程 Collector 注册、mTLS、SNMP/Probe 协议、Go 直连 PostgreSQL 或前端依赖。

## 实施要求
- 创建 CollectionTask、调度属性、preferred collector、状态和结果 envelope。
- 实现内部任务领取/结果提交服务认证、批次/idempotency、版本与限额。
- Go 客户端只使用生成合同并带 central-default 来源。
- 任务与结果保留 collectorId、时间、重试和安全错误分类。

## 数据库与迁移影响
新增 CollectionTask 和安全 CredentialReference，不保存明文凭据。

## 安全影响
内部端点认证、Secret 引用和结果大小限制。

## 可观测性要求
任务领取、结果批次、拒绝、延迟和 Collector 最近心跳。

## 测试要求
- 合同兼容、重复领取/结果、未认证、超限和版本不匹配测试。
- Go/NestJS 端到端 stub 测试。

## 验收命令
- `npm run contracts:check`
- `npm run test:integration --workspace apps/platform -- collection-contract`
- `go test ./services/collector/... -run PlatformClient`
- `npm run typecheck`

## 完成定义
- 测试任务可由 Go 领取并提交幂等结果。
- collectorId 全链路保留。
- 没有协议或最终业务判断。

## 明确非目标
不实现分布式节点生命周期、SNMP、Probe、Trap 或 Health。

## 风险与回滚
风险：合同过宽或泄露凭据；只传引用和最小任务参数。

回滚：停用内部路由并归档测试任务；保留迁移历史。

## 后续 Ticket
- [T026](T026-simulated-observation-fact-slice.md)
- [T027](T027-snmpv2c-interface-polling.md)
- [T031](T031-tcp-icmp-active-probes.md)

