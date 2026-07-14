# T042：Condition、Health 与 Alert 并列消费验收

## 状态
PLANNED

## 目标
端到端证明一个 Condition Version 同时驱动 Health 和 Alert，且重放、故障、风暴下保持一致。

## 背景
这是 ADR-0010/0011/0012/0013 的核心交叉边界，需在 Incident 之前冻结。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ALT-001
- MVP-ALT-002
- MVP-ALT-003
- MVP-ALT-004
- MVP-ALT-005
- MVP-ALT-007
- MVP-ALT-009
- MVP-ALT-011
- MVP-ARC-013
- MVP-ARC-014
- MVP-ARC-015
- MVP-ARC-016
- MVP-ARC-018
- MVP-ARC-020
- MVP-CND-001
- MVP-CND-002
- MVP-CND-004
- MVP-CND-005
- MVP-CND-006
- MVP-HLT-001
- MVP-HLT-002
- MVP-HLT-003
- MVP-HLT-004
- MVP-HLT-005
- MVP-HLT-006
- MVP-HLT-007
- MVP-JOB-001
- MVP-JOB-002
- MVP-JOB-003
- MVP-JOB-004
- MVP-JOB-006
- MVP-JOB-007
- MVP-JOB-008
- MVP-CND-003
- MVP-CND-007
- MVP-CND-008
- MVP-CND-009
- MVP-HLT-008
- MVP-ALT-006
- MVP-ALT-008
- MVP-ALT-010
- MVP-JOB-005
- MVP-JOB-009
- MVP-PER-009
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T039](T039-health-aggregation-freshness-hysteresis.md)
- [T040](T040-alert-rule-fingerprint-episodes.md)
- [T041](T041-alert-suppression-maintenance-notification.md)

## 允许修改范围
- `tests/integration/condition-health-alert/`
- `tests/recovery/condition-alert/`
- `tests/capacity/alert-storm/`
- `apps/platform 的缺陷修正范围`

## 禁止修改范围
不得新增产品行为、把 Health/Alert 互相依赖、降低幂等约束或把失败笼统推迟至 T060。

## 实施要求
- 构建 Direct Fact 和 Metric Condition 两条端到端场景。
- 验证同一 conditionVersion、发布回滚、UNKNOWN、不健康执行器和对账修复。
- 执行 10,000 次转换的可重复告警风暴预验收，检查重复 Episode/Transition。
- 验证 Worker 崩溃、租约、Outbox、Dead Letter 和恢复指标。

## 数据库与迁移影响
不新增领域；仅可为发现的正确性缺陷增加版本化约束迁移。

## 安全影响
验证内部 Ingest 认证和规则管理权限。

## 可观测性要求
收集 Condition/Health/Alert 延迟、重复、队列和风暴指标。

## 测试要求
- 数据库集成、跨进程、故障恢复和告警风暴测试。
- 静态依赖检查防止模块循环。

## 验收命令
- `npm run test:integration -- condition-health-alert`
- `npm run test:recovery -- condition-alert`
- `npm run test:capacity -- alert-storm-small`
- `npm run verify`

## 完成定义
- Health 与 Alert 仅共享 Condition。
- UNKNOWN 不恢复 Alert 且可使 Health UNKNOWN。
- 风暴无重复 Episode/历史。

## 明确非目标
不实现 Incident、UI 或正式 MVP-S1 全容量。

## 风险与回滚
风险：跨模块竞态只在压力下出现；真实 PostgreSQL+崩溃点测试。

回滚：回退缺陷修正到上一稳定版本，保留测试数据和历史。

## 后续 Ticket
- [T043](T043-incident-lifecycle-timeline.md)
- [T050](T050-alert-incident-operations-ui.md)
- [T058](T058-mvp-s1-fixtures-load-tooling.md)
