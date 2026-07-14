# T047：运维工作台外壳、资产搜索与列表

## 状态
PLANNED

## 目标
交付登录后的运维导航、设备/接口/线路搜索和权限感知列表。

## 背景
先建立窄的可用工作台，不一次性搭建所有页面或通用低代码框架。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-UIO-001
- MVP-UIO-005
- MVP-GEN-004
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖
- [T017](T017-authentication-security-acceptance.md)
- [T024](T024-topology-differences-candidate-confirmation.md)
- [T029](T029-snmp-interface-discovery-candidates.md)

## 允许修改范围
- `apps/web/src/app/`
- `apps/web/src/features/assets/`
- `apps/platform/src/modules/assets/ 的搜索查询`
- `packages/contracts/`
- `tests/e2e/operator/`

## 禁止修改范围
不得实现拓扑画布、Alert/Incident 页面、Executive 大屏或前端作为唯一鉴权。

## 实施要求
- 创建权限感知导航和路由保护，但以 API 拒绝为权威。
- 实现设备/接口/线路统一搜索、稳定分页、筛选和结果定位链接。
- 资产列表展示 Desired/Observed 来源、最后观测和候选状态。
- 提供 1920×1080 可用布局和无障碍基础。

## 数据库与迁移影响
可增加搜索索引迁移；不得复制业务数据到新搜索系统。

## 安全影响
搜索结果按权限裁剪，不返回凭据/完整管理地址清单给无权角色。

## 可观测性要求
搜索延迟、错误、空结果和权限拒绝。

## 测试要求
- Web 组件、API 搜索、Operator/Executive 越权和浏览器 E2E。
- 键盘导航和基本可访问性。

## 验收命令
- `npm run test --workspace apps/web -- operator-shell`
- `npm run test:integration --workspace apps/platform -- asset-search`
- `npm run test:e2e -- operator-search`
- `npm run typecheck`

## 完成定义
- Operator 可安全搜索和进入对象。
- 直接 API 越权失败。
- 无重复搜索后端。

## 明确非目标
不实现全文搜索集群、拓扑、告警或大屏。

## 风险与回滚
风险：高基数搜索拖慢 PostgreSQL；使用受控索引和分页。

回滚：移除新路由/查询，保留索引或用前向迁移移除。

## 后续 Ticket
- [T048](T048-layered-topology-layout-candidates-ui.md)
- [T049](T049-device-circuit-health-metrics-details.md)

