# T014：CSRF、防后台续期与 SSE 会话生命周期

## 状态
READY

## 目标
完成同源 Cookie 会话的 CSRF、防被动续期和长连接撤销语义。

## 背景
SSE 心跳、轮询和页面保持不能让会话永久有效，状态变更必须独立防 CSRF。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AUT-012
- MVP-AUT-013
- MVP-UIE-004
- MVP-UIE-006
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖
- [T013](T013-postgres-opaque-session-login.md)

## 允许修改范围
- `apps/platform/src/modules/identity-access/`
- `apps/platform/src/modules/sse/`
- `packages/contracts/ SSE envelope`
- `tests/integration/session/`
- `tests/e2e/session/`

## 禁止修改范围
不得通过 SameSite 单独防 CSRF、通过查询参数传 Token、让心跳更新活动或实现 WebSocket。

## 实施要求
- 实现与 Session 关联的 CSRF Token/确认头和 Origin/Referer 校验。
- 区分显式 User Activity 与后台刷新、SSE heartbeat、健康检查。
- SSE 建连/重连验证 Session，撤销、空闲/绝对到期和授权版本变化时关闭。
- 统一客户端可识别但不泄密的会话失效原因。

## 数据库与迁移影响
可扩展 Session 活动和撤销字段；使用版本化迁移。

## 安全影响
高影响；覆盖 CSRF、长连接和过期边界。

## 可观测性要求
CSRF 拒绝、SSE 关闭原因、空闲/绝对到期计数。

## 测试要求
- 跨站请求、GET 修改禁止、后台轮询不续期和 SSE 到期测试。
- 直接 API/前端绕过测试。

## 验收命令
- `npm run test:security -- csrf`
- `npm run test:integration --workspace apps/platform -- session-lifecycle`
- `npm run test:e2e -- session-expiry`
- `npm run typecheck`

## 完成定义
- 全部状态变更受 CSRF 防护。
- 被动连接不延长空闲期。
- 撤销后 SSE 关闭。

## 明确非目标
不实现 WebSocket、kiosk、业务 SSE 事件或 MFA。

## 风险与回滚
风险：误判活动会导致频繁登出或永久会话；以明确 allowlist 记录活动。

回滚：关闭新 SSE 接线并撤销现有会话；前向迁移保留字段。

## 后续 Ticket
- [T015](T015-totp-enrollment-login.md)
- T051
