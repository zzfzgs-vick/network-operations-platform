# T013：PostgreSQL 不透明会话与本地登录

## 状态

DONE

## 完成记录

- 完成日期：2026-07-16。
- 对应 Git Commit：实现 `63469b8336605daf6ca43a7b89f397db463dcd48`。
- CI 可识别信息：GitHub Actions workflow `quality`，run `29500803109`；Ubuntu 24.04 与 Windows 均通过；运行地址：<https://github.com/zzfzgs-vick/network-operations-platform/actions/runs/29500803109>。
- 数据库迁移：`0007_postgres_opaque_sessions.up.sql`，建立 `web_sessions` 与灾难恢复 Session Generation。
- Token 与 Cookie：使用 256 位不透明随机 Token，PostgreSQL 仅保存 SHA-256 摘要；Cookie 使用 `__Host-`、Secure、HttpOnly、SameSite=Lax、Path=/。
- 生命周期：预认证 5 分钟、idle 30 分钟、absolute 12 小时；支持登录轮换、登出和撤销，并在用户禁用、密码变化、授权版本变化或恢复操作后使 Session 失效。
- 验收结果：Session PostgreSQL 13/13、Cookie 6/6、HTTP Login 8/8、RBAC 12/12、Platform Health 7/7 及标准质量门禁均通过，`npm audit` 为 0 vulnerabilities，Session/Login 安全终审无遗留问题。

## 目标

实现密码登录、预认证/正式会话、Host Cookie、Token 哈希和即时撤销。

## 背景

浏览器不得使用 JWT/localStorage，PostgreSQL 是会话权威且故障时 fail closed。

## 对应规格

- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AUT-009
- MVP-AUT-010
- MVP-AUT-011
- MVP-AUT-014
- MVP-GEN-108
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖

- [T012](T012-permission-rbac-enforcement.md)

## 允许修改范围

- `apps/platform/src/modules/identity-access/`
- `apps/platform/src/bootstrap/api-app.module.ts`
- `apps/platform/src/config/config.test.ts`
- `apps/platform/src/config/public.ts`
- `apps/platform/src/modules/platform-health/platform-health.module.ts`
- `apps/platform/migrations/`
- `apps/platform/migrations/README.md`
- `apps/platform/package.json`
- `scripts/db-test.mjs`
- `tests/integration/audit/run-security.mjs`
- `tests/integration/config/run.mjs`
- `tests/integration/session/`
- `.env.example`

范围修正：T013 的完成定义要求将 Session 认证接入真实 API、复用并测试集中配置、提供新迁移、暴露低基数生命周期指标，并通过统一的数据库、安全和 HTTP 集成测试入口验收；新增迁移导致的既有迁移测试只允许按仓库权威迁移清单作最小兼容修正。

## 禁止修改范围

不得使用 JWT、Redis、localStorage、“记住我”、URL Token、跨域 Cookie 或 kiosk Session。

## 实施要求

- 创建 Session 表，分离 sessionId 与 tokenHash，只保存至少 256 位随机 Token 的 SHA-256 摘要。
- 实现密码阶段、5 分钟 pre-auth、30 分钟空闲、12 小时绝对时长和服务端到期。
- 设置 __Host- Cookie 的 Secure/HttpOnly/SameSite=Lax/Path=/ 基线并轮换 Session ID。
- 实现退出、用户停用、密码重置和 authorizationVersion 不匹配撤销。

## 数据库与迁移影响

新增 Session 表、唯一 tokenHash 和到期/用户索引；原始 Token 不入库。

## 安全影响

高影响；Cookie、Token 和认证错误必须 redaction。

## 可观测性要求

会话创建、轮换、到期、撤销和版本不匹配计数。

## 测试要求

- Token 哈希、固定攻击、到期、撤销、停用、密码重置和数据库故障测试。
- 灾难恢复标志可使全部历史 Session 失效。

## 验收命令

- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- sessions`
- `npm run test:security -- session-cookie`
- `npm run test:integration --workspace apps/platform -- login`

## 完成定义

- 数据库无原始 Token。
- 旧 Token 在轮换/撤销后立即失效。
- PostgreSQL 不可用时认证失败关闭。

## 明确非目标

不实现 CSRF、SSE、TOTP、kiosk 或浏览器 UI。

## 风险与回滚

风险：Token 泄露/固定；只在响应 Cookie 产生原值并做全链路泄露扫描。

回滚：撤销所有会话并前向禁用登录；用户和审计保留。

## 后续 Ticket

- [T014](T014-csrf-session-sse-lifecycle.md)
- [T015](T015-totp-enrollment-login.md)
