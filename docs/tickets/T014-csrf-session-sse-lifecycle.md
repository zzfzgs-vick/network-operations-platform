# T014：CSRF、防后台续期与 SSE 会话生命周期

## 状态

DONE

## 完成记录

- 完成日期：2026-07-16。
- 对应 Git Commit：实现 `c48fdeb2f99bf187b3bfada356022bb6fd7f9987`。
- CI 可识别信息：GitHub Actions workflow `quality`，run `29505530272`；Ubuntu 24.04 与 Windows 均通过；运行地址：<https://github.com/zzfzgs-vick/network-operations-platform/actions/runs/29505530272>。
- 数据库迁移：`0008_csrf_session_foundation.up.sql`，为 Web Session 增加仅保存 SHA-256 摘要的会话绑定 CSRF Token，并在升级时撤销无法证明新 Token 的旧活动会话。
- CSRF 边界：状态变更执行精确 Origin/Referer、确认头与会话绑定 Token 校验；登录响应使用 `Cache-Control: no-store`，原始 Token 不进入数据库、日志、指标或 SSE envelope。
- SSE 生命周期：连接和重连验证 PostgreSQL 权威 Session；心跳不更新 User Activity；撤销、授权版本变化、空闲或绝对到期后使用稳定安全原因关闭连接。
- 验收结果：CSRF 4/4、SSE Session 生命周期 5/5、Session expiry E2E 5/5、既有 Login 8/8、Platform Health 7/7 及标准质量门禁均通过，`npm audit` 为 0 vulnerabilities，针对性安全终审无遗留问题。

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
- `apps/platform/src/bootstrap/api-app.module.ts`
- `apps/platform/src/config/`
- `apps/platform/src/modules/platform-health/platform-health.module.ts`
- `apps/platform/migrations/`
- `apps/platform/migrations/README.md`
- `packages/contracts/` 中的 SSE envelope 权威 Schema 与生成物
- `package.json`
- `tests/integration/audit/run-security.mjs`
- `tests/integration/config/run.mjs`
- `tests/integration/session/`
- `tests/e2e/session/`

范围修正：T014 的完成定义要求将 CSRF 与 SSE 生命周期接入真实 API 和集中配置，提供版本化迁移、共享 SSE envelope、低基数指标，并通过根级安全、集成和端到端测试入口验收；新增迁移导致的既有迁移测试只允许按仓库权威迁移清单作最小兼容修正。

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
