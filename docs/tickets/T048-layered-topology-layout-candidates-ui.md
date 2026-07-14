# T048：分层拓扑、局部展开与候选治理界面

## 状态
PLANNED

## 目标
用受限拓扑视图展示区域/站点/设备/线路，并支持坐标持久化和候选确认。

## 背景
默认视图必须聚合，不能绘制 30,000 接口或因状态变化重新布局。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-GEN-005
- MVP-TOP-002
- MVP-TOP-001
- MVP-TOP-003
- MVP-TOP-004
- MVP-TOP-005
- MVP-TOP-006
- MVP-PER-008
- MVP-GEN-113
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)

## 前置依赖
- [T024](T024-topology-differences-candidate-confirmation.md)
- [T029](T029-snmp-interface-discovery-candidates.md)
- [T039](T039-health-aggregation-freshness-hysteresis.md)
- [T047](T047-operator-shell-asset-search.md)

## 允许修改范围
- `apps/web/src/features/topology/`
- `apps/platform/src/modules/topology/ 的 bounded query`
- `packages/contracts/`
- `tests/e2e/topology/`

## 禁止修改范围
不得渲染全量接口图、引入第二图库抽象、自动确认关系或把维护颜色覆盖真实 Health。

## 实施要求
- 评估并封装 AntV G6，仅 topology 模块了解图库对象。
- 实现领导/站点/设备层级查询的节点边上限、局部展开、搜索定位。
- 主颜色 Health，附加 Mode/DataQuality 图标且不只靠颜色。
- 拖拽坐标版本化持久化，状态更新只改样式不全量布局。

## 数据库与迁移影响
复用布局/拓扑表；可增加查询/版本索引。

## 安全影响
布局修改需 topology.manage，候选确认需 topology.confirm。

## 可观测性要求
返回元素数、查询/首绘/展开/定位耗时和浏览器冻结。

## 测试要求
- 组件、布局稳定、权限、候选确认、100 updates/s 缩小压力。
- 默认元素上限测试。

## 验收命令
- `npm run test --workspace apps/web -- topology`
- `npm run test:integration --workspace apps/platform -- topology-view`
- `npm run test:e2e -- topology-governance`
- `npm run typecheck`

## 完成定义
- 分层拓扑可浏览和局部展开。
- 坐标刷新稳定。
- 候选治理不绕审批。

## 明确非目标
不实现 30k 接口全图、3D、通用图库框架或自动重构拓扑。

## 风险与回滚
风险：图库性能/内存；封装边界和固定规模基准。

回滚：切回列表/上一渲染实现，保留布局数据。

## 后续 Ticket
- [T049](T049-device-circuit-health-metrics-details.md)
- [T051](T051-authorized-sse-stale-client-state.md)
- [T053](T053-executive-dashboard-ui.md)
