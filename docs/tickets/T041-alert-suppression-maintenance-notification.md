# T041：Alert 抑制、维护窗口与 Notification Delivery

## 状态
PLANNED

## 目标
在保留检测事实的前提下实现维护、根因/人工抑制和可重试通知投递记录。

## 背景
抑制只影响处理和投递，不得删除下游 Alert 或把 Firing 改成 Resolved。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ALT-003
- MVP-ALT-007
- MVP-ALT-009
- MVP-HLT-002
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)

## 前置依赖
- [T040](T040-alert-rule-fingerprint-episodes.md)
- [T022](T022-circuits-business-topology-desired.md)
- [T006](T006-postgres-reliable-work-tracer.md)

## 允许修改范围
- `apps/platform/src/modules/alerts/`
- `apps/platform/src/modules/notifications/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `tests/integration/alert-handling/`

## 禁止修改范围
不得引入 Alertmanager 权威 Silence、创建 Incident、自动关闭 Alert 或实现具体第三方通知全集成。

## 实施要求
- 创建 MaintenanceWindow、Suppression、NotificationPolicy/Delivery/Attempt 最小模型。
- 维护继续 Condition/Alert/Health 计算，仅抑制通知/可选自动 Incident。
- 实现上游根因、维护和人工 Silence 的独立状态与原因。
- 通知通过 Outbox/Job 至少一次执行，失败不回滚 Alert。

## 数据库与迁移影响
新增维护、抑制和通知投递表及幂等约束。

## 安全影响
配置/维护需 alerts.configure，确认需 alerts.acknowledge；目标地址按敏感配置保护。

## 可观测性要求
抑制/去重/限速数量、投递成功失败、重试和积压。

## 测试要求
- 维护期间 Firing 保留、下游通知抑制、失败不回滚、重复投递幂等。
- 维护结束仍异常不假恢复。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:integration --workspace apps/platform -- alert-suppression`
- `npm run test:db --workspace apps/platform -- notification-delivery`
- `npm run typecheck`

## 完成定义
- 检测、确认、抑制、维护、通知维度独立。
- 通知失败可见且不阻塞权威状态。
- 所有操作可审计。

## 明确非目标
不实现 Alertmanager、短信/电话或 Incident 自动声明。

## 风险与回滚
风险：抑制规则过宽隐藏故障；保留底层状态并显示原因/范围。

回滚：停用抑制/通知策略，保留 Delivery 与 Alert 历史。

## 后续 Ticket
- [T042](T042-condition-health-alert-integration.md)
- [T043](T043-incident-lifecycle-timeline.md)

