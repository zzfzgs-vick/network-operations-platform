# T031：TCP Connect 与 ICMP 主动探测

## 状态
PLANNED

## 目标
实现两类主动探测任务的安全调度、执行、时序写入和来源追踪。

## 背景
核心线路和业务路径需要独立于 SNMP 的主动可达性证据。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-010
- MVP-COL-002
- MVP-COL-004
- MVP-COL-006
- MVP-PER-013
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)

## 前置依赖
- [T025](T025-collector-task-result-contracts.md)
- [T026](T026-simulated-observation-fact-slice.md)

## 允许修改范围
- `services/collector/internal/probe/`
- `apps/platform/src/modules/collection/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `tests/integration/probes/`

## 禁止修改范围
不得实现 HTTP/DNS、最终 Health/Alert、特权容器或远程 ProbeNode。

## 实施要求
- 创建 ProbeTask 类型、目标、周期、超时、优先级和 central-default 关联。
- 实现 TCP Connect 与 ICMP，ICMP 仅授予最小 Linux capability。
- 写入成功、耗时、丢包/错误分类到 VictoriaMetrics 和 Observation。
- 限制并发、超时、重试和来源地址风险。

## 数据库与迁移影响
新增 ProbeTask/Execution 元数据和幂等结果约束。

## 安全影响
限制目标/端口，防 SSRF/扫描滥用；ICMP 不运行 privileged。

## 可观测性要求
启动延迟、执行耗时、成功/超时、队列和最老等待。

## 测试要求
- Go 单元/协议、目标模拟器、超时、拒绝目标和 capability 文档测试。
- 重复结果幂等。

## 验收命令
- `go test ./services/collector/internal/probe/... -run 'TCP|ICMP'`
- `npm run test:integration --workspace apps/platform -- probe-tcp-icmp`
- `pwsh -File scripts/smoke-probe.ps1 -Types tcp,icmp`
- `npm run typecheck`

## 完成定义
- 两类探测可持续调度并查询指标。
- 95% 调度偏差测试可采集证据。
- 安全目标限制生效。

## 明确非目标
不实现 HTTP/DNS、Condition 或业务告警。

## 风险与回滚
风险：ICMP 跨平台权限与探测滥用；模块隔离、最小 capability、目标 allowlist。

回滚：停用 ProbeTask，撤销 capability，保留历史结果。

## 后续 Ticket
- [T032](T032-http-dns-active-probes.md)
- [T034](T034-freshness-source-availability.md)
