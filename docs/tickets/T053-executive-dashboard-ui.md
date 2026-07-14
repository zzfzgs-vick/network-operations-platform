# T053：领导大屏、聚合拓扑与趋势界面

## 状态
PLANNED

## 目标
交付 Executive Viewer 登录后的 1920×1080/4K 只读大屏和全屏展示。

## 背景
领导大屏是 MVP 核心，但仍使用普通会话，不支持无人值守认证。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-GEN-004
- MVP-GEN-005
- MVP-UIE-001
- MVP-UIE-002
- MVP-UIE-004
- MVP-UIE-005
- MVP-PER-008
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)

## 前置依赖
- [T052](T052-executive-aggregate-api.md)
- [T048](T048-layered-topology-layout-candidates-ui.md)
- [T049](T049-device-circuit-health-metrics-details.md)

## 允许修改范围
- `apps/web/src/features/executive/`
- `apps/web/src/ui/ 的真实共享展示原语`
- `tests/e2e/executive/`

## 禁止修改范围
不得实现 kiosk、自动登录、永久 Session、URL Token、编辑入口或复用管理员详情响应。

## 实施要求
- 展示整体健康、核心设备/线路、重大告警、影响站点/业务、开放 Incident。
- 展示区域/站点/核心线路聚合拓扑、24h 趋势、利用率和不稳定线路排行。
- 支持自动刷新、SSE、全屏/轮播和 1920×1080，基本适配 4K。
- 状态不只依赖颜色，显示 UNKNOWN/覆盖率/维护。

## 数据库与迁移影响
无。

## 安全影响
只用 dashboard.executive.read 和聚合 API；无编辑命令。

## 可观测性要求
首绘、拓扑渲染、更新、浏览器内存和 SSE 状态。

## 测试要求
- 组件、参考分辨率截图/布局、权限、首绘和状态更新测试。
- 无独显参考终端验证。

## 验收命令
- `npm run test --workspace apps/web -- executive`
- `npm run test:e2e -- executive-dashboard`
- `npm run test:performance:web -- executive`
- `npm run typecheck`

## 完成定义
- Executive Viewer 可登录查看完整大屏。
- 聚合拓扑/趋势达到边界。
- 无配置与敏感详情。

## 明确非目标
不实现 kiosk、Display Device/Session、自动恢复认证或公开大屏。

## 风险与回滚
风险：4K/图表内存与布局；限制元素和增量更新。

回滚：回退大屏路由/组件，聚合 API 保留。

## 后续 Ticket
- [T054](T054-executive-session-security-acceptance.md)
- [T059](T059-mvp-s1-target-capacity-acceptance.md)
