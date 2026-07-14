# T037：Metric Condition 推送、对账与执行连续性

## 状态
PLANNED

## 目标
实现 vmalert 实时推送、周期对账、Pending 同步和停机后状态修复。

## 背景
一次通知不能成为最终状态，重复、乱序、漏推送和执行器故障都需幂等修复。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-004
- MVP-SEC-004
- MVP-CND-006
- MVP-CND-007
- MVP-CND-008
- MVP-CND-009
- MVP-ALT-006
- MVP-ALT-010
- MVP-ARC-013
- MVP-ARC-015
- MVP-ARC-016
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T036](T036-vmalert-condition-publication.md)
- [T006](T006-postgres-reliable-work-tracer.md)

## 允许修改范围
- `apps/platform/src/modules/conditions/`
- `apps/platform/src/modules/reliable-work/ 注册`
- `apps/platform/migrations/`
- `packages/contracts/openapi/internal.yaml`
- `tests/integration/vmalert-reconcile/`

## 禁止修改范围
不得同步执行外部通知、因无推送恢复条件、让 vmalert 修改 Alert/Health/Incident 或引入 Alertmanager。

## 实施要求
- 实现私有认证批量 Ingest，逐项校验后快速写 Inbox。
- Worker 幂等处理 TRUE/FALSE/UNKNOWN、重复和乱序 Evaluation。
- 实现 30～60 秒对账、启动/发布/恢复立即对账和 Pending 获取。
- vmalert 状态写回/启动恢复失败形成平台状态，无法匹配结果标 AMBIGUOUS。

## 数据库与迁移影响
扩展 Evaluation 当前投影、对账游标/运行记录和待修复事实。

## 安全影响
内部认证、批量限额、原始标签/注解白名单。

## 可观测性要求
最近推送/对账、批次成功拒绝、漂移、Pending、执行错误和延迟。

## 测试要求
- 重复/乱序/漏推送、平台/vmalert/VM 重启、Reload 回滚和 Pending 测试。
- 10k 重复输入不重复 Transition 的缩小集成测试。

## 验收命令
- `npm run test:integration --workspace apps/platform -- vmalert-ingest`
- `npm run test:recovery -- condition-reconcile`
- `npm run test:db --workspace apps/platform -- condition-idempotency`
- `npm run verify`

## 完成定义
- 推送低延迟且对账能修复。
- 无消息不等于 FALSE。
- 当前 Condition 预计算可查询。

## 明确非目标
不创建 Alert Episode、Health Policy 或通知渠道。

## 风险与回滚
风险：对账放大数据库负载；使用游标/批次和受控周期。

回滚：停止新版本消费者，恢复上一规则包和对账游标；历史保留。

## 后续 Ticket
- [T038](T038-current-health-policy-transitions.md)
- [T040](T040-alert-rule-fingerprint-episodes.md)
