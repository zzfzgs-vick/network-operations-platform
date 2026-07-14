# T034：数据新鲜度、来源可用性与 Collector 状态

## 状态
PLANNED

## 目标
统一产生 stale/unavailable/shared Condition 输入，避免各消费者重复比较时间戳。

## 背景
Collector、VictoriaMetrics、vmalert 或任务中断不能被解释为业务恢复。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AST-003
- MVP-COL-005
- MVP-COL-006
- MVP-GEN-006
- MVP-OBS-001
- MVP-OBS-002
- MVP-OBS-003
- MVP-OBS-004
- MVP-OPS-013
- MVP-OBS-005
- MVP-COL-007
- MVP-CND-009
- MVP-HLT-003
- MVP-OPS-012
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T026](T026-simulated-observation-fact-slice.md)
- [T030](T030-inventory-metrics-scheduler-policy.md)
- [T032](T032-http-dns-active-probes.md)
- [T033](T033-snmp-trap-normalization-confirmation.md)
- [T007](T007-platform-observability-health-baseline.md)

## 允许修改范围
- `apps/platform/src/modules/observations/`
- `apps/platform/src/modules/collection/`
- `apps/platform/src/modules/platform-health/`
- `apps/platform/migrations/`
- `tests/integration/freshness/`

## 禁止修改范围
不得在 Alert/Health/UI 重复 staleAfter 计算或把来源故障输出为 FALSE/HEALTHY。

## 实施要求
- 创建 FreshnessPolicy，按数据类型记录 expectedInterval/grace/stale/unavailable。
- 从最近成功任务、Collector heartbeat 和依赖健康产生规范化来源事实。
- 统一输出 status_stale、collector_unavailable、metric_source_unavailable 等 Direct Fact 输入。
- 来源恢复需要足够新鲜样本，不直接跳 HEALTHY。

## 数据库与迁移影响
新增 freshness policy/当前来源状态和转换历史。

## 安全影响
健康详情不泄露内部 Secret/完整错误。

## 可观测性要求
Fresh/Partial/Stale/Unavailable 数量和最老数据年龄。

## 测试要求
- 不同时序周期、Collector 停止、VM/vmalert 断开和恢复确认测试。
- 确认 UNKNOWN 而非 FALSE。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:integration --workspace apps/platform -- freshness`
- `npm run test:recovery -- source-unavailable`
- `npm run typecheck`

## 完成定义
- 新鲜度只有一个权威计算位置。
- 来源故障可见且不会假恢复。
- 恢复需新证据。

## 明确非目标
不实现完整 Health Policy 或 Alert Episode。

## 风险与回滚
风险：统一阈值误用于不同数据；策略按类型版本化。

回滚：恢复上一 FreshnessPolicy 版本，保留状态历史。

## 后续 Ticket
- [T035](T035-condition-definition-direct-evaluation.md)
- [T038](T038-current-health-policy-transitions.md)
- [T040](T040-alert-rule-fingerprint-episodes.md)
