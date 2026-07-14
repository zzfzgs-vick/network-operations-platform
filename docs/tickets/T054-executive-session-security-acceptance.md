# T054：领导大屏会话、数据分级与过期验收

## 状态
PLANNED

## 目标
验证大屏不会放宽普通会话、安全权限或陈旧数据语义。

## 背景
自动刷新不能永久续期；会话到期后旧状态必须明显标记停止更新。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-UIE-002
- MVP-UIE-005
- MVP-UIE-001
- MVP-UIE-003
- MVP-UIE-004
- MVP-UIE-006
- MVP-GEN-108
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖
- [T053](T053-executive-dashboard-ui.md)
- [T050](T050-alert-incident-operations-ui.md)
- [T051](T051-authorized-sse-stale-client-state.md)

## 允许修改范围
- `tests/e2e/executive/`
- `tests/security/executive/`
- `docs/specs/mvp-acceptance.md 的证据链接`
- `apps/web/src/features/executive/ 的缺陷修正`

## 禁止修改范围
不得增加 remember-me、kiosk Token、IP 旁路、Display Session 或延长全局超时。

## 实施要求
- 验证 Executive 只能访问聚合接口，不能访问配置/凭据/审计详情。
- 保持 30 分钟空闲、12 小时绝对时长，刷新/SSE 不续期。
- 到期停止请求/连接并显示最后更新时间、数据过期和重新登录。
- 验证 URL/响应/localStorage 无 Token，浏览器重启语义符合普通 Session。

## 数据库与迁移影响
无。

## 安全影响
本 Ticket 是大屏安全发布门。

## 可观测性要求
记录会话到期、停止刷新和 stale overlay 触发。

## 测试要求
- 浏览器时间推进、直接 API 越权、Token 泄露和自动刷新测试。
- 1920×1080/4K 状态过期视觉检查。

## 验收命令
- `npm run test:e2e -- executive-session-expiry`
- `npm run test:security -- executive-permissions`
- `npm run test:security -- token-leak`
- `npm run verify`

## 完成定义
- 大屏完整但不具无人值守认证。
- 到期后不再表现为实时。
- 普通 Session 基线未放宽。

## 明确非目标
不实现 kiosk、自动登录或终端身份。

## 风险与回滚
风险：测试环境时间控制失真；服务端时钟适配器和浏览器 E2E 共同验证。

回滚：回退缺陷修正，不改变会话策略。

## 后续 Ticket
- [T059](T059-mvp-s1-target-capacity-acceptance.md)
- [T060](T060-stress-recovery-release-acceptance.md)
