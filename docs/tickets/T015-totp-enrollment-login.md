# T015：TOTP 注册、验证与敏感权限门控

## 状态
READY

## 目标
实现基于有效敏感 Permission 的 RFC 6238 TOTP 注册和两阶段登录。

## 背景
System Administrator、自定义敏感角色和 Emergency Administrator 都必须按权限而非角色名触发 MFA。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AUT-006
- MVP-AUT-007
- MVP-AUT-008
- MVP-AUT-016
- MVP-AUT-018
- MVP-GEN-110
- MVP-SEC-005
- [ADR-0006](../architecture/adr/0006-require-totp-for-sensitive-permissions.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖
- [T013](T013-postgres-opaque-session-login.md)

## 允许修改范围
- `apps/platform/src/modules/identity-access/`
- `apps/platform/migrations/`
- `packages/contracts/openapi/public.yaml`
- `tests/integration/mfa/`

## 禁止修改范围
不得自写 HMAC/Base32、实现短信/邮件/Push/WebAuthn、多 TOTP 设备或在日志/API返回 Secret。

## 实施要求
- 选择维护中的 TOTP 库，采用 30 秒、6 位、最多 ±1 step 和同 step 重放拒绝。
- 创建待确认 Enrollment、加密 TotpAuthenticator、MfaChallenge 与密钥版本。
- 密码成功只建立低权限 pre-auth，验证 TOTP 后创建新正式 Session。
- 敏感权限授予进入 MFA_ENROLLMENT_REQUIRED，旧会话不获得权限。

## 数据库与迁移影响
新增加密认证器、Enrollment、Challenge 和重放状态；加密密钥不入库。

## 安全影响
最高影响；TOTP Secret、二维码 payload 和验证码全链路禁止日志。

## 可观测性要求
注册/验证成功失败、重放、限速和时间同步异常。

## 测试要求
- RFC 向量、偏差窗口、重放、注册未确认、权限提升和日志泄露测试。
- 自定义角色敏感权限触发 MFA。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:security -- totp`
- `npm run test:integration --workspace apps/platform -- mfa-login`
- `npm run typecheck`

## 完成定义
- 未注册敏感用户不能使用敏感权限。
- 普通用户不被强制。
- 同一时间步验证码不可重用。

## 明确非目标
不实现恢复码、管理员重置、break-glass 或外部 MFA。

## 风险与回滚
风险：密钥管理/时间误差；使用注入密钥、NTP 健康和严格窗口。

回滚：撤销测试认证器和全部会话；不得通过关闭 MFA 保留敏感权限。

## 后续 Ticket
- [T016](T016-mfa-recovery-step-up-break-glass.md)
