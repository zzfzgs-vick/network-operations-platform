# T016：恢复码、MFA 重置、敏感操作与应急恢复

## 状态
READY

## 目标
补齐 TOTP 丢失恢复、近期认证、Emergency Administrator 和宿主机 break-glass。

## 背景
恢复路径必须比正常登录更受控，密码重置不能绕过第二因素。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AUT-008
- MVP-AUT-015
- MVP-AUT-016
- MVP-SEC-006
- MVP-SEC-007
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)
- [ADR-0006](../architecture/adr/0006-require-totp-for-sensitive-permissions.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖
- [T015](T015-totp-enrollment-login.md)

## 允许修改范围
- `apps/platform/src/modules/identity-access/`
- `apps/platform/migrations/`
- `apps/platform/src/cli/`
- `tests/integration/mfa/`
- `tests/recovery/auth/`
- `docs/architecture/authentication-authorization.md 的实现说明`

## 禁止修改范围
不得实现安全问题、通用绕过码、邮件明文 Secret、管理员查看 Secret 或直接删库字段作为恢复流程。

## 实施要求
- 生成默认 10 个一次性恢复码，只显示一次并慢哈希保存，重生成使旧码失效。
- 实现管理员受控重置、TOTP 解绑规则、全部 Session 撤销和重新注册。
- 敏感操作要求默认 10 分钟内 MFA 或密码+TOTP step-up。
- 实现仅宿主机授权的 break-glass 命令，记录数据库审计和独立主机安全日志。

## 数据库与迁移影响
新增 RecoveryCodeSet/MfaRecoveryEvent 及消费唯一约束。

## 安全影响
最高影响；双人/离线保管属于运行说明，代码不得输出旧 Secret。

## 可观测性要求
恢复码使用、管理员重置、step-up 拒绝、break-glass 高优先级事件。

## 测试要求
- 恢复码单次/失效、密码重置不绕 MFA、管理员重置撤销会话。
- 宿主机恢复后强制改密和重新注册。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:security -- mfa-recovery`
- `npm run test:recovery -- auth-break-glass`
- `npm run test:integration --workspace apps/platform -- step-up`

## 完成定义
- 丢失认证器可受控恢复且无旁路。
- 应急管理员仍要求 TOTP。
- 所有恢复动作可审计。

## 明确非目标
不实现外部身份恢复、短信或永久 bypass。

## 风险与回滚
风险：break-glass 成为后门；限制本机、OS 权限、双日志和强制轮换。

回滚：撤销新恢复材料和全部会话，保留审计；前向迁移修复。

## 后续 Ticket
- [T017](T017-authentication-security-acceptance.md)

