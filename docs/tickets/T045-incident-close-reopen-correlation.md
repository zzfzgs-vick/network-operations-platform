# T045：Incident 关闭、重开、等级与确定性自动声明

## 状态
PLANNED

## 目标
补齐 Incident 的 CLOSED/重开、Severity/Priority 和有限可解释自动声明。

## 背景
技术恢复不等于流程关闭，同类问题长期复发应创建新 Incident 而非无限重开。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-INC-005
- MVP-INC-006
- MVP-INC-007
- MVP-INC-008
- MVP-GEN-105
- MVP-GEN-106
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)

## 前置依赖
- [T044](T044-incident-alert-impact-links.md)

## 允许修改范围
- `apps/platform/src/modules/incidents/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `tests/integration/incident-lifecycle/`

## 禁止修改范围
不得实现机器学习归并、自动关闭全部 Incident、完整复盘系统或外部 ITSM。

## 实施要求
- CLOSED 前校验影响、告警检查、摘要、处置、关闭人/时间。
- 高严重 Incident 保存根因状态、postmortemRequired/status/reference、行动和风险。
- Severity 与 Priority 独立，调整记录原因，不改 Alert Severity。
- 实现版本化确定性自动声明/关联和受控重开/relatedIncident。

## 数据库与迁移影响
扩展关闭、复盘、重开和相关 Incident 字段/历史。

## 安全影响
关闭/重开/等级操作需权限并审计。

## 可观测性要求
声明来源、重复避免、关闭时长、重开次数和规则版本。

## 测试要求
- 不完整关闭拒绝、Alert 恢复不自动关闭、重开/新事件边界、规则幂等。
- 等级调整不改 Alert。

## 验收命令
- `npm run test --workspace apps/platform -- incident-lifecycle`
- `npm run test:db --workspace apps/platform -- incident-correlation`
- `npm run test:integration --workspace apps/platform -- incident-close`
- `npm run typecheck`

## 完成定义
- Resolved 与 Closed 明确。
- 自动行为可解释/版本化。
- 关闭/重开完整审计。

## 明确非目标
不实现 ML、自然语言归并、完整 ITSM 或自动复盘。

## 风险与回滚
风险：确定性规则重复建 Incident；开放主关联唯一约束和幂等键。

回滚：停用自动规则，取消错误 Incident 并保留历史。

## 后续 Ticket
- [T046](T046-alert-incident-operations-api-acceptance.md)

