# T017：认证、会话与权限安全验收闭环

## 状态
PLANNED

## 目标
以端到端安全测试证明本地认证、RBAC、TOTP、会话和恢复满足 MVP。

## 背景
安全不能推迟到最后加固；本 Ticket 在业务模块开始前冻结可信 Principal 接口。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-019
- MVP-SEC-001
- MVP-SEC-002
- MVP-SEC-003
- MVP-SEC-004
- MVP-SEC-005
- MVP-SEC-006
- MVP-SEC-007
- MVP-AUT-001
- MVP-AUT-002
- MVP-AUT-003
- MVP-AUT-004
- MVP-AUT-005
- MVP-AUT-006
- MVP-AUT-007
- MVP-AUT-008
- MVP-AUT-009
- MVP-AUT-010
- MVP-AUT-011
- MVP-AUT-012
- MVP-AUT-013
- MVP-AUT-014
- MVP-AUT-015
- MVP-AUT-016
- MVP-AUT-017
- MVP-AUT-018
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)
- [ADR-0006](../architecture/adr/0006-require-totp-for-sensitive-permissions.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖
- [T009](T009-runtime-containers-graceful-lifecycle.md)
- [T014](T014-csrf-session-sse-lifecycle.md)
- [T016](T016-mfa-recovery-step-up-break-glass.md)

## 允许修改范围
- `tests/e2e/auth/`
- `tests/security/`
- `scripts/verify-auth.*`
- `docs/specs/mvp-acceptance.md 的测试证据链接`

## 禁止修改范围
不得修改产品安全阈值、放宽 Session/TOTP、实现业务功能或把失败测试标记为忽略。

## 实施要求
- 建立登录、权限、MFA、CSRF、撤销、到期、SSE、恢复和 Secret 泄露的可重复安全套件。
- 验证五个默认角色和自定义角色，尤其敏感 Permission 门控。
- 生成测试证据索引并确认 PostgreSQL 故障 fail closed。
- 固定统一 Principal/Permission 接口供后续业务 Controller 使用。

## 数据库与迁移影响
不新增业务表；测试可创建/清理隔离数据。

## 安全影响
本 Ticket 是 Phase 2 发布门。

## 可观测性要求
验证全部认证审计事件和失败分类。

## 测试要求
- API 集成、浏览器 E2E、安全负面、恢复演练。
- 日志/Trace/审计 Secret 扫描。

## 验收命令
- `npm run test:security`
- `npm run test:e2e -- auth`
- `npm run test:recovery -- auth`
- `npm run verify`

## 完成定义
- ADR-0005/0006/0007 验收项全部通过。
- 后续模块可复用稳定 Principal/Permission。
- 无跳过或未解决的安全失败。

## 明确非目标
不实现资产、Collector 或领导大屏。

## 风险与回滚
风险：测试只覆盖 happy path；要求负面和故障矩阵。

回滚：仅测试与证据变更可回退；安全实现缺陷回到对应前置 Ticket 修复。

## 后续 Ticket
- [T018](T018-location-hierarchy-desired-state.md)
- T025
