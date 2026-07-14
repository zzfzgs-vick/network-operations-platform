# T052：领导大屏只读聚合 API

## 状态
PLANNED

## 目标
提供独立、字段白名单的健康、拓扑、Incident 和趋势聚合接口。

## 背景
Executive Viewer 不应复用返回管理配置和设备敏感详情的运维 API。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-020
- MVP-UIE-002
- MVP-UIE-003
- MVP-UIE-005
- MVP-HLT-006
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)

## 前置依赖
- [T039](T039-health-aggregation-freshness-hysteresis.md)
- [T045](T045-incident-close-reopen-correlation.md)
- [T048](T048-layered-topology-layout-candidates-ui.md)
- [T051](T051-authorized-sse-stale-client-state.md)

## 允许修改范围
- `apps/platform/src/modules/executive/`
- `packages/contracts/openapi/public.yaml`
- `apps/platform/migrations/ 的只读索引`
- `tests/integration/executive/`

## 禁止修改范围
不得返回凭据、完整管理地址、原始认证/审计、低层 OID 或提供状态修改。

## 实施要求
- 实现 summary/topology/incidents/trends 等只读聚合合同。
- 使用预计算 CurrentHealth/快照，返回健康率、覆盖率、各状态和维护数量。
- 拓扑最多 100 聚合节点/300 边，Incident 仅重大开放摘要。
- 所有端点只接受 dashboard.executive.read 并字段白名单。

## 数据库与迁移影响
无新权威表；可新增聚合读取索引/快照作业。

## 安全影响
高影响数据分级；Executive 无配置/凭据路径。

## 可观测性要求
聚合 p50/p95/p99、结果规模、缓存/快照年龄和权限拒绝。

## 测试要求
- 字段白名单、Executive/其他角色权限、覆盖率口径和性能集成测试。
- UNKNOWN 进入分母且不算健康。

## 验收命令
- `npm run contracts:check`
- `npm run test:integration --workspace apps/platform -- executive-api`
- `npm run test:security -- executive-data-boundary`
- `npm run typecheck`

## 完成定义
- 独立聚合 API 可供大屏使用。
- 不泄露运维敏感详情。
- 健康/覆盖口径一致。

## 明确非目标
不实现页面、kiosk、公开 URL 或 Display Session。

## 风险与回滚
风险：聚合查询拖慢业务；使用预计算/索引和固定结果上限。

回滚：下线端点并保留底层快照/索引。

## 后续 Ticket
- [T053](T053-executive-dashboard-ui.md)
