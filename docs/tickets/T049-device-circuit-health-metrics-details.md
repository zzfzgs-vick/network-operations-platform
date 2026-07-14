# T049：设备、接口与线路健康指标详情

## 状态
PLANNED

## 目标
在对象详情中统一展示状态、来源、Health 原因/分数和时序趋势。

## 背景
运维人员需要从拓扑下钻到可解释证据，UNKNOWN 不能显示为 0 或正常。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-PER-004
- MVP-UIO-004
- MVP-HLT-004
- MVP-HLT-006
- MVP-OBS-004
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)

## 前置依赖
- [T039](T039-health-aggregation-freshness-hysteresis.md)
- [T047](T047-operator-shell-asset-search.md)
- [T027](T027-snmpv2c-interface-polling.md)
- [T032](T032-http-dns-active-probes.md)

## 允许修改范围
- `apps/web/src/features/assets/`
- `apps/web/src/features/observations/`
- `apps/platform 的对象详情/趋势查询`
- `packages/contracts/`
- `tests/e2e/object-details/`

## 禁止修改范围
不得在页面现场执行 Condition/MetricsQL、返回 Secret 或复制可变业务名为时序标签。

## 实施要求
- 详情聚合 Desired/Observed/Effective、来源、最后观测、质量和当前 Health。
- 展示 score breakdown、原因、coverage、policyVersion；UNKNOWN 显示“—”。
- 使用 ECharts 展示 24h/7d 受限趋势和计数器重置语义。
- 显示关联 Alert/Incident 摘要和到拓扑链接。

## 数据库与迁移影响
无新权威表；可增加查询索引。

## 安全影响
按 assets/observations/alerts 权限裁剪，凭据字段永不进入响应。

## 可观测性要求
详情/趋势 p50/p95/p99、VM 查询错误和缓存命中（若仅请求级）。

## 测试要求
- 组件、趋势查询、UNKNOWN/STALE、权限字段白名单和响应时间测试。
- 计数器重置不产生假峰。

## 验收命令
- `npm run test --workspace apps/web -- object-details`
- `npm run test:integration --workspace apps/platform -- trend-query`
- `npm run test:e2e -- health-drilldown`
- `npm run typecheck`

## 完成定义
- 对象状态可解释且来源可追。
- 趋势满足查询边界。
- 未知/过期不假正常。

## 明确非目标
不实现报表系统、全量导出或 Redis 缓存。

## 风险与回滚
风险：趋势查询过宽；固定时间窗、采样和结果上限。

回滚：移除新详情聚合，保留底层数据。

## 后续 Ticket
- [T051](T051-authorized-sse-stale-client-state.md)
- [T053](T053-executive-dashboard-ui.md)
