# T012：权限集合与默认拒绝 RBAC

## 状态
READY

## 目标
实现基于稳定 Permission 的后端授权、默认角色模板和 authorizationVersion 基础。

## 背景
角色名称仅是模板，前端隐藏不能代替后端权限检查。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-019
- MVP-AUT-003
- MVP-UIO-005
- MVP-SEC-007
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)
- [ADR-0006](../architecture/adr/0006-require-totp-for-sensitive-permissions.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖
- [T011](T011-local-users-password-bootstrap.md)

## 允许修改范围
- `apps/platform/src/modules/identity-access/`
- `apps/platform/migrations/`
- `packages/contracts/ 权限错误 envelope`
- `tests/integration/authz/`

## 禁止修改范围
不得实现属性授权、逐设备授权、前端唯一鉴权或按角色名硬编码敏感策略。

## 实施要求
- 创建 Role、Permission、UserRoleAssignment 及权限版本迁移。
- 初始化五个默认角色模板和规格中的稳定权限标识。
- 所有受保护 API 通过显式 Permission guard 默认拒绝。
- 角色/权限变化递增 authorizationVersion 并追加审计。

## 数据库与迁移影响
新增 RBAC 表、唯一约束和 authorizationVersion。

## 安全影响
高影响；权限拒绝审计不泄露资源详情。

## 可观测性要求
授权允许/拒绝按受控 permission 标签计数。

## 测试要求
- 自定义角色、角色改名、直接 API 越权和并发版本更新测试。
- 默认无权限用户被拒绝。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- rbac`
- `npm run test:security -- authorization`
- `npm run typecheck`

## 完成定义
- 后端每个受保护测试端点声明权限。
- 角色名变化不影响授权语义。
- 权限变更可审计。

## 明确非目标
不实现 Session、TOTP、属性级或设备级授权。

## 风险与回滚
风险：权限遗漏造成默认放行；全局 guard 和未声明路由测试阻止。

回滚：保留用户，前向撤销角色分配并关闭受保护入口。

## 后续 Ticket
- [T013](T013-postgres-opaque-session-login.md)
- [T018](T018-location-hierarchy-desired-state.md)
