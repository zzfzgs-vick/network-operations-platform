# T026：模拟 Observation 到 Normalized Fact 纵向切片

## 状态
PLANNED

## 目标
贯通模拟采集结果→Inbox→幂等 Observation→Normalized Fact→受权查询和审计。

## 背景
这是首个业务数据纵向切片，先验证身份、来源、事务和查询，不开始真实 SNMP。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-005
- MVP-ARC-006
- MVP-ARC-010
- MVP-ARC-020
- MVP-OBS-001
- MVP-OBS-002
- MVP-OBS-003
- MVP-JOB-002
- MVP-COL-007
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T006](T006-postgres-reliable-work-tracer.md)
- [T025](T025-collector-task-result-contracts.md)

## 允许修改范围
- `apps/platform/src/modules/observations/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `services/collector/internal/app/ 的模拟提交`
- `tests/integration/observations/`
- `apps/web/src/features/assets/ 的最小当前事实展示`

## 禁止修改范围
不得实现真实 SNMP、Condition、Health、Alert、VictoriaMetrics 指标或候选自动确认。

## 实施要求
- 创建 Observation、NormalizedFact 和 CurrentFactProjection 的最小模型。
- 保留 sourceType、collectorId、observedAt、有效期、confidence、原始标识和值及可确定身份。
- Inbox 消费与 Fact 更新同事务，重复 itemId 不重复历史。
- 身份歧义进入候选引用，不写正式设备/接口当前事实。

## 数据库与迁移影响
新增 Observation/Fact/Projection 表和幂等/当前唯一约束。

## 安全影响
observations.read 权限；原始值白名单与大小限制。

## 可观测性要求
Inbox 延迟、重复数、规范化失败和事实新鲜时间。

## 测试要求
- 真实 PostgreSQL 重复、乱序、身份歧义和崩溃点测试。
- API 权限、审计和最小 UI 查询测试。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- observations`
- `npm run test:integration --workspace apps/platform -- simulated-observation`
- `npm run test:e2e -- current-fact`

## 完成定义
- 一个测试设备可接收模拟 Observation 并查询 Fact。
- 重复提交只产生一次权威效果。
- 权限和审计通过。

## 明确非目标
不实现真实协议、Condition/Health/Alert 或全量资产表。

## 风险与回滚
风险：原始 payload 无界；合同限额和安全摘要。

回滚：停止消费者并归档测试观察；历史不物理删除。

## 后续 Ticket
- [T027](T027-snmpv2c-interface-polling.md)
- [T034](T034-freshness-source-availability.md)
- [T035](T035-condition-definition-direct-evaluation.md)
