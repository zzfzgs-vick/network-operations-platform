# T038：对象 Health Policy、Current Health 与转换历史

## 状态
PLANNED

## 目标
让一个 Direct/Metric Condition 独立产生可解释的设备/接口当前健康和追加转换。

## 背景
Health 是 Condition 的并列消费者，不能读取 Alert Instance 或用分数决定权威状态。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-020
- MVP-HLT-001
- MVP-HLT-002
- MVP-HLT-003
- MVP-HLT-004
- MVP-HLT-006
- MVP-HLT-007
- MVP-CND-003
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)

## 前置依赖
- [T035](T035-condition-definition-direct-evaluation.md)
- [T037](T037-metric-condition-ingest-reconciliation.md)

## 允许修改范围
- `apps/platform/src/modules/health/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `tests/integration/health-domain/`

## 禁止修改范围
不得读取 Alert/Incident、执行 MetricsQL、把 MAINTENANCE 加入健康枚举或 UNKNOWN 评分为 0。

## 实施要求
- 创建 HealthPolicy/Version/Assignment/ConditionBinding、CurrentHealth、HealthTransition、ScoreBreakdown。
- 实现 HEALTHY/DEGRADED/CRITICAL/UNKNOWN、独立 OperationalMode/DataQuality。
- 输出 nullable score、coverage、原因、策略/条件版本、有效期。
- 状态变化追加历史，受控修正也追加审计。

## 数据库与迁移影响
新增 Health 领域表、当前唯一键和 transition 幂等约束。

## 安全影响
Health 修正需明确权限/原因；输出不泄露敏感证据。

## 可观测性要求
计算量、耗时、UNKNOWN/STALE、失败和策略版本分布。

## 测试要求
- 状态/模式/质量组合、UNKNOWN null score、版本历史和 Alert 无依赖测试。
- 重复 Condition 不重复 Transition。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test --workspace apps/platform -- health-domain`
- `npm run test:db --workspace apps/platform -- current-health`
- `npm run typecheck`

## 完成定义
- Condition 同时可供 Health 使用而无 Alert 依赖。
- UNKNOWN 分数为 null。
- 转换可解释且追加。

## 明确非目标
不实现站点聚合、复杂迟滞、UI 或业务 Alert。

## 风险与回滚
风险：状态和分数耦合；分开函数/字段和反例测试。

回滚：激活上一 HealthPolicy Version，保留转换历史。

## 后续 Ticket
- [T039](T039-health-aggregation-freshness-hysteresis.md)
- T042
