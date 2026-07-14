# T050：Alert 与 Incident 运维界面

## 状态
PLANNED

## 目标
交付告警确认、筛选、关联 Incident 和完整 Incident 处置工作流。

## 背景
运维闭环需要清晰区分检测、确认、抑制、维护和事件状态。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-GEN-005
- MVP-UIO-002
- MVP-UIO-003
- MVP-UIO-005
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)

## 前置依赖
- [T046](T046-alert-incident-operations-api-acceptance.md)
- [T047](T047-operator-shell-asset-search.md)

## 允许修改范围
- `apps/web/src/features/alerts/`
- `apps/web/src/features/incidents/`
- `tests/e2e/operations/`

## 禁止修改范围
不得在前端重算 Alert/Health、自动关闭 Incident、隐藏权限失败或实现完整 ITSM。

## 实施要求
- Alert 页覆盖 Pending/Firing/Resolved、批量确认、抑制/维护原因、转换和 Incident 链接。
- Incident 页覆盖负责人、Severity/Priority、影响、根因、时间线、恢复、关闭和重开。
- 明确 Alert Resolved 与 Incident Closed 的独立状态。
- 所有命令处理版本冲突、部分失败和审计结果。

## 数据库与迁移影响
无。

## 安全影响
按钮按权限改善 UX，后端仍权威；批量操作限制范围。

## 可观测性要求
页面/API 错误、批量成功失败、列表/详情延迟。

## 测试要求
- 组件状态组合、权限、并发版本、关闭校验和浏览器 E2E。
- 确认/抑制不改变 Firing。

## 验收命令
- `npm run test --workspace apps/web -- alerts incidents`
- `npm run test:e2e -- alert-incident-operations`
- `npm run test:security -- operations-ui`
- `npm run typecheck`

## 完成定义
- Operator 可完成 Alert→Incident 处置。
- 状态语义无混淆。
- 历史时间线可查看。

## 明确非目标
不实现聊天室、排班、外部工单或自动复盘。

## 风险与回滚
风险：复杂状态在 UI 合并；直接显示后端独立维度。

回滚：回退页面路由，不改权威历史。

## 后续 Ticket
- [T051](T051-authorized-sse-stale-client-state.md)
- [T054](T054-executive-session-security-acceptance.md)
