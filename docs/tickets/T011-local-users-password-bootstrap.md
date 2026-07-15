# T011：本地用户、密码与首个管理员初始化

## 状态
READY

## 目标
实现不可变 userId、本地密码生命周期和一次性安全管理员初始化。

## 背景
MVP 无外部 IdP，所有后续权限与审计都依赖稳定平台用户身份。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AUT-001
- MVP-AUT-002
- MVP-AUT-004
- MVP-AUT-005
- MVP-AUT-017
- MVP-GEN-109
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)

## 前置依赖
- [T010](T010-append-only-audit-foundation.md)

## 允许修改范围
- `apps/platform/src/modules/identity-access/`
- `apps/platform/migrations/`
- `packages/contracts/openapi/public.yaml`
- `tests/integration/auth/`

## 禁止修改范围
不得实现公开注册、OIDC/LDAP/AD、固定默认密码、Session、TOTP 或用户管理 UI。

## 实施要求
- 创建 PlatformUser 与 LocalCredential 版本化迁移，业务引用仅使用 userId。
- 采用维护良好的 Argon2id 实现、独立盐、可升级参数和至少 12 字符策略。
- 实现本机/受控命令首管理员初始化，一次成功后关闭入口并审计。
- 实现用户创建、启停、首次改密和管理员重置的应用服务骨架。

## 数据库与迁移影响
新增用户、凭据和初始化状态；哈希不可通过查询 DTO 返回。

## 安全影响
高影响；登录错误不枚举用户，失败限速状态可持久或有明确边界。

## 可观测性要求
认证成功/失败、锁定延迟和初始化事件计数。

## 测试要求
- 密码哈希、弱密码、枚举、首次改密和初始化重复执行测试。
- 用户停用后认证拒绝。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- local-auth`
- `npm run test:security -- password-policy`
- `npm run typecheck`

## 完成定义
- 首管理员只能受控创建一次。
- 密码永不明文/可逆保存或返回。
- userId 在用户名变化后稳定。

## 明确非目标
不创建登录页面、Session、RBAC 或 MFA。

## 风险与回滚
风险：认证实现错误影响全平台；使用成熟库并用安全测试封锁日志泄露。

回滚：保留用户身份，使用前向迁移禁用未完成认证入口；不删除审计。

## 后续 Ticket
- [T012](T012-permission-rbac-enforcement.md)
