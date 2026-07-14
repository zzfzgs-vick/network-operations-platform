# T040：Alert Rule、Fingerprint、Episode 与转换历史

## 状态
PLANNED

## 目标
让共享 Condition 独立驱动技术 Alert Episode，支持复发、确认和追加历史。

## 背景
Alert 是技术异常，不能依赖最终 Health，也不能把 ACK/抑制与检测状态混为一体。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-020
- MVP-ALT-001
- MVP-ALT-002
- MVP-ALT-003
- MVP-ALT-004
- MVP-ALT-005
- MVP-ALT-011
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)

## 前置依赖
- [T035](T035-condition-definition-direct-evaluation.md)
- [T037](T037-metric-condition-ingest-reconciliation.md)
- [T010](T010-append-only-audit-foundation.md)

## 允许修改范围
- `apps/platform/src/modules/alerts/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `tests/integration/alerts/`

## 禁止修改范围
不得执行重复 MetricsQL、读取 Health Status、创建 Incident、发送外部通知或覆盖已 Resolved Episode。

## 实施要求
- 创建 AlertRule/Version/ConditionBinding、Fingerprint、Instance/Episode、Transition 和 ACK 维度。
- Fingerprint 仅使用 ruleId/target/stable dimensions；Episode identity 包含 startsAt。
- Condition TRUE/FALSE/UNKNOWN 驱动 Pending/Firing/Resolved/数据状态，UNKNOWN 不恢复。
- 复发创建新 Episode，规则版本变化保留触发快照。

## 数据库与迁移影响
新增 Alert 领域表、Episode/Transition 幂等唯一约束和查询索引。

## 安全影响
规则管理/确认权限、输入限额和审计。

## 可观测性要求
规则/Episode/转换、重复抑制、处理延迟和 UNKNOWN 数量。

## 测试要求
- 复发、重复/乱序 TRUE/FALSE、ACK 不恢复、规则停用/版本变化测试。
- 并发不创建双 Episode。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test --workspace apps/platform -- alert-domain`
- `npm run test:db --workspace apps/platform -- alert-episode`
- `npm run test:integration --workspace apps/platform -- condition-alert`

## 完成定义
- 相同 Fingerprint 复发产生新 Episode。
- 检测/确认/数据维度独立。
- Alert 不依赖 Health。

## 明确非目标
不实现抑制、维护、Incident、通知投递或页面。

## 风险与回滚
风险：Fingerprint 维度不稳定导致风暴；白名单稳定维度和版本测试。

回滚：停用规则版本，保留所有 Episode/Transition。

## 后续 Ticket
- T041
- T042
