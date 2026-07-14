# T051：授权 SSE 增量更新与客户端陈旧状态

## 状态
PLANNED

## 目标
用持久 Outbox 游标向运维页面推送受权增量，并在会话/来源失效时诚实降级。

## 背景
Worker 不维护浏览器连接，SSE 丢失后必须从持久状态恢复且不能延长会话。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-UIO-001
- MVP-UIO-002
- MVP-UIO-003
- MVP-UIO-005
- MVP-JOB-010
- MVP-AUT-013
- MVP-UIE-006
- MVP-UIO-004
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T014](T014-csrf-session-sse-lifecycle.md)
- [T048](T048-layered-topology-layout-candidates-ui.md)
- [T049](T049-device-circuit-health-metrics-details.md)
- [T050](T050-alert-incident-operations-ui.md)

## 允许修改范围
- `apps/platform/src/modules/sse/`
- `apps/platform/src/modules/reliable-work/ SSE 投影`
- `apps/web/src/app/`
- `apps/web/src/features/`
- `packages/contracts/`
- `tests/e2e/sse/`

## 禁止修改范围
不得用 LISTEN/NOTIFY 作权威、在 URL 传 Token、心跳续期或实现 WebSocket。

## 实施要求
- Worker 写持久、权限可裁剪的事件 envelope，API 以游标读取并分发。
- 重连从持久游标恢复，重复事件客户端幂等。
- Session 撤销/到期/授权变化关闭连接并停止自动请求。
- 数据过期覆盖明确 stale/last updated，而非继续绿色。

## 数据库与迁移影响
可新增 SSE cursor/subscription 元数据；不存原始 Token。

## 安全影响
每事件/重连重新授权，payload 不含敏感详情。

## 可观测性要求
连接数、重连、游标落后、关闭原因、推送延迟和丢弃。

## 测试要求
- API 重启、瞬时通知丢失、权限变化、会话到期、重复事件和 stale UI 测试。
- SSE 心跳不更新活动。

## 验收命令
- `npm run test:integration --workspace apps/platform -- sse-outbox`
- `npm run test:e2e -- sse-session`
- `npm run test:security -- sse-authorization`
- `npm run typecheck`

## 完成定义
- 增量状态可靠且受权。
- 连接不能越过 Session 生命周期。
- 旧数据明确标过期。

## 明确非目标
不实现 WebSocket、跨域 SSE 或 kiosk。

## 风险与回滚
风险：每事件鉴权成本；使用会话版本和允许的投影，不缓存绕撤销。

回滚：关闭 SSE 使用轮询（仍遵守不续期），保留 Outbox。

## 后续 Ticket
- [T052](T052-executive-aggregate-api.md)
- [T054](T054-executive-session-security-acceptance.md)
