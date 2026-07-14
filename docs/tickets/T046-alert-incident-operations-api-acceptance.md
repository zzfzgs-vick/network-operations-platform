# T046：Alert 与 Incident 运维 API 验收闭环

## 状态
PLANNED

## 目标
冻结可供运维 UI 使用的查询、过滤、命令和权限合同。

## 背景
UI 不能依赖未定义响应，Alert/Incident 独立生命周期需在页面开发前完成 API 验收。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-INC-002
- MVP-INC-003
- MVP-INC-004
- MVP-INC-005
- MVP-INC-006
- MVP-INC-007
- MVP-INC-008
- MVP-UIO-002
- MVP-UIO-003
- MVP-INC-001
- MVP-ALT-003
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)

## 前置依赖
- [T045](T045-incident-close-reopen-correlation.md)
- [T017](T017-authentication-security-acceptance.md)

## 允许修改范围
- `packages/contracts/openapi/public.yaml`
- `apps/platform/src/modules/alerts/adapters/http/`
- `apps/platform/src/modules/incidents/adapters/http/`
- `tests/integration/operations-api/`

## 禁止修改范围
不得实现 UI、改变领域状态机、返回凭据或把通知状态混入检测状态。

## 实施要求
- 定义 Alert Pending/Firing/Resolved、确认/批量确认、抑制/维护、转换和 Incident 关联查询。
- 定义 Incident 列表/详情、负责人、等级、影响、时间线、关闭和重开命令。
- 实现站点/设备/接口/线路/严重等级筛选与稳定分页。
- 逐端点声明 Permission、CSRF、审计和错误模型。

## 数据库与迁移影响
无新领域迁移；可增加必要只读索引的版本化迁移。

## 安全影响
后端权限和批量命令上限；Executive 不可访问运维详情。

## 可观测性要求
查询 p95、筛选基数、批量命令结果和权限拒绝。

## 测试要求
- 合同、API 集成、权限矩阵、分页稳定和批量部分失败测试。
- Alert/Incident 互不改写断言。

## 验收命令
- `npm run contracts:check`
- `npm run test:integration -- operations-api`
- `npm run test:security -- operations-permissions`
- `npm run typecheck`

## 完成定义
- 运维 API 合同稳定并生成客户端。
- 所有命令可审计且受权。
- 后续 UI 无需猜测响应。

## 明确非目标
不实现页面、第三方通知或外部工单。

## 风险与回滚
风险：单个详情响应过大；分页、字段白名单和快照摘要。

回滚：保留旧合同版本，回退新端点/索引。

## 后续 Ticket
- [T050](T050-alert-incident-operations-ui.md)
