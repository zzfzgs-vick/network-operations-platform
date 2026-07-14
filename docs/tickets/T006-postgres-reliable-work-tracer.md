# T006：Inbox、Outbox、Job Queue 最小可靠纵向切片

## 状态
PLANNED

## 目标
用一条无业务含义的测试消息证明 PostgreSQL 至少一次、幂等、租约、重试和 Dead Letter 路径。

## 背景
ADR-0013 是后续 Observation、Condition、Health、Alert 和通知的可靠基础，需在领域体量之前验证。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-JOB-001
- MVP-JOB-002
- MVP-JOB-003
- MVP-JOB-004
- MVP-JOB-005
- MVP-JOB-006
- MVP-JOB-007
- MVP-JOB-008
- MVP-ARC-008
- MVP-ARC-009
- MVP-ARC-018
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T004](T004-postgres-migration-data-access-baseline.md)
- [T005](T005-shared-contracts-error-model.md)

## 允许修改范围
- `apps/platform/src/modules/reliable-work/`
- `apps/platform/migrations/`
- `apps/platform/src/worker.ts 接线`
- `tests/integration/reliable-work/`

## 禁止修改范围
不得加入业务 Job 类型、Broker、LISTEN/NOTIFY、进程内权威队列或 exactly-once 声明。

## 实施要求
- 创建 Inbox、Outbox、BackgroundJob、JobAttempt、WorkerLease、DeadLetter 的最小版本化迁移和索引。
- 实现稳定幂等键、同事务状态+Outbox、SKIP LOCKED 短认领、有限租约和优雅恢复。
- 实现分类重试、指数退避/抖动、最大次数和人工可重试 Dead Letter 应用接口。
- 用测试消息贯通 ingest→Inbox→Worker→Outbox，重复和崩溃不重复效果。

## 数据库与迁移影响
新增可靠工作表、唯一性/租约/状态索引；提供升级和前向修复说明。

## 安全影响
队列只存安全摘要和 payload reference；不得复制 Secret 或无界 payload。

## 可观测性要求
记录队列长度、最老等待、尝试、重试、租约和 Dead Letter。

## 测试要求
- 真实 PostgreSQL 并发、重复、崩溃点、租约过期和 Dead Letter 集成测试。
- API 提交后 Worker 重启仍可完成消息。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- reliable-work`
- `npm run test --workspace apps/platform -- worker`
- `npm run typecheck`

## 完成定义
- 测试消息至少一次且业务效果一次。
- 崩溃后无需手改数据库即可恢复。
- Dead Letter 可查询和重试。

## 明确非目标
不处理 Observation、Alert、通知或 SSE；不加入业务表。

## 风险与回滚
风险：队列表锁竞争和重复副作用；数据库唯一约束和崩溃点测试是合并门槛。

回滚：停止 Worker，回退未投入生产的迁移；已有测试消息可清理。

## 后续 Ticket
- [T007](T007-platform-observability-health-baseline.md)
- [T010](T010-append-only-audit-foundation.md)
- T026

