# T043：Incident 生命周期、负责人和追加时间线

## 状态
PLANNED

## 目标
实现可人工声明、分派、处置、恢复和取消的独立 Incident 记录。

## 背景
Incident 是人员协调对象，不是 Alert、Trap、通知或工单的别名。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-020
- MVP-INC-001
- MVP-INC-002
- MVP-INC-004
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)

## 前置依赖
- [T041](T041-alert-suppression-maintenance-notification.md)
- [T010](T010-append-only-audit-foundation.md)

## 允许修改范围
- `apps/platform/src/modules/incidents/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `tests/integration/incidents/`

## 禁止修改范围
不得自动为每条 Alert 创建 Incident、修改 Alert 检测状态或实现完整 ITSM/排班。

## 实施要求
- 创建 Incident、Owner、状态、TimelineEvent 和审计字段。
- 支持从 Alert/设备/线路/拓扑异常或无 Alert 问题人工声明。
- 实现 DECLARED→INVESTIGATING→MITIGATING→MONITORING→RESOLVED/CANCELED 基础转换。
- 状态、负责人、备注和缓解措施只追加时间线。

## 数据库与迁移影响
新增 Incident/Timeline 表、乐观版本和追加约束。

## 安全影响
incidents.manage 权限，输入/备注长度与敏感信息提示。

## 可观测性要求
开放 Incident、状态时长、负责人未分配和时间线写入失败。

## 测试要求
- 状态机、并发更新、无 Alert 创建、取消和时间线不可覆盖测试。
- 权限/审计 API 测试。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test --workspace apps/platform -- incident-domain`
- `npm run test:db --workspace apps/platform -- incident-timeline`
- `npm run typecheck`

## 完成定义
- Incident 可独立声明和推进。
- 时间线追加且可追责。
- Alert 不被反向改写。

## 明确非目标
不实现 Alert 关联、影响快照、自动声明、UI 或外部工单。

## 风险与回滚
风险：任意备注含敏感数据；输入限制和审计提示，不自动复制 Secret。

回滚：停止新建并保留现有 Incident/时间线；前向迁移修复。

## 后续 Ticket
- [T044](T044-incident-alert-impact-links.md)
