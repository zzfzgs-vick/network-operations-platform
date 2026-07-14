# T035：Condition Definition、三值逻辑与 Direct Fact 执行

## 状态
PLANNED

## 目标
实现不可变 Condition/Version/DAG/Assignment 和 Direct Fact 的 TRUE/FALSE/UNKNOWN 评估。

## 背景
Alert 与 Health 共享同一条件结果，阈值、新鲜度和组合语义只能有一个所有者。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-020
- MVP-CND-001
- MVP-CND-002
- MVP-CND-003
- MVP-CND-004
- MVP-CND-005
- MVP-CND-006
- MVP-GEN-112
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)

## 前置依赖
- [T026](T026-simulated-observation-fact-slice.md)
- [T032](T032-http-dns-active-probes.md)
- [T034](T034-freshness-source-availability.md)

## 允许修改范围
- `apps/platform/src/modules/conditions/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `tests/integration/conditions/`

## 禁止修改范围
不得实现任意脚本、MetricsQL 执行、Alert/Health 最终状态或循环依赖。

## 实施要求
- 创建 ConditionDefinition/Version/Assignment/Dependency/ExecutionBinding/Evaluation。
- 实现 ALL/ANY/NOT/QUORUM 及必要的 SEQUENCE/DEPENDENCY 最小三值逻辑与循环检测。
- Direct Fact Evaluator 产生稳定幂等 Evaluation 和 Transition。
- 保存值、阈值/窗口摘要、证据、配置哈希、有效期和执行状态。

## 数据库与迁移影响
新增 Condition 领域表、活动版本和 transition 幂等约束。

## 安全影响
表达式/组合大小限额，不允许代码执行或 Secret。

## 可观测性要求
评估数量、耗时、UNKNOWN、循环拒绝和队列延迟。

## 测试要求
- 完整三值真值表、DAG 循环、重复/并发 Evaluation 和来源 UNKNOWN 测试。
- Alert/Health 模块不得被 conditions 导入。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test --workspace apps/platform -- conditions`
- `npm run test:db --workspace apps/platform -- condition-evaluation`
- `npm run typecheck`

## 完成定义
- Direct Fact 可产生版本化三值结果。
- 循环配置被拒绝。
- 条件模块无 Alert/Health 依赖。

## 明确非目标
不生成 vmalert YAML、Health 或 Alert。

## 风险与回滚
风险：组合语义膨胀；只实现明确列出的操作符和有限深度。

回滚：停用新 Condition Version，恢复上一活动版本。

## 后续 Ticket
- [T036](T036-vmalert-condition-publication.md)
- [T038](T038-current-health-policy-transitions.md)
- [T040](T040-alert-rule-fingerprint-episodes.md)
