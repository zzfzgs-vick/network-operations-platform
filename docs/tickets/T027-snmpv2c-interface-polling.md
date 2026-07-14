# T027：SNMPv2c 接口状态与计数器采集

## 状态
PLANNED

## 目标
用少量真实/模拟 Agent 贯通 SNMPv2c 任务、轮询、Observation 和 VictoriaMetrics 写入。

## 背景
MVP 需兼容 SNMPv2c，但安全默认仍由后续 SNMPv3 完成。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-010
- MVP-GEN-005
- MVP-OBS-004
- MVP-PER-004
- MVP-COL-001
- MVP-COL-004
- MVP-COL-007
- MVP-PER-003
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)

## 前置依赖
- [T025](T025-collector-task-result-contracts.md)
- [T026](T026-simulated-observation-fact-slice.md)

## 允许修改范围
- `services/collector/internal/snmp/`
- `services/collector/internal/app/`
- `apps/platform/src/modules/collection/`
- `deploy/victoriametrics/ 的指标接线`
- `tests/fixtures/snmp/`
- `tests/integration/snmp/`

## 禁止修改范围
不得实现 SNMPv3、LLDP 确认、最终 Health/Alert 或把 community 写日志/指标。

## 实施要求
- 实现 SNMPv2c 任务执行、超时、设备级并发、批量和安全错误。
- 采集 ifAdminStatus/ifOperStatus/speed/counters/errors/discards/ifLastChange/身份字段。
- 处理超时、OID 不支持、异常值和计数器重置。
- 将指标以受控稳定标签写入 VictoriaMetrics，业务名称不复制为高基数标签。

## 数据库与迁移影响
可扩展采集任务/执行记录迁移；community 仅加密引用。

## 安全影响
SNMP community 作为 Secret 注入/加密引用，不输出。

## 可观测性要求
轮询耗时、成功/超时、OID 不支持、批次大小和样本写入。

## 测试要求
- Go 单元/协议、模拟 Agent、慢/超时/异常值和计数器重置测试。
- 少量真实厂商兼容测试记录。

## 验收命令
- `go test ./services/collector/internal/snmp/... -run V2`
- `npm run test:integration --workspace apps/platform -- snmpv2c`
- `pwsh -File scripts/smoke-snmp.ps1 -Version v2c`
- `npm run verify`

## 完成定义
- SNMPv2c 接口核心字段进入 Observation/VM。
- Secret 无泄露。
- 慢设备不阻塞其他设备。

## 明确非目标
不实现 v3、接口正式匹配、LLDP 或业务告警。

## 风险与回滚
风险：厂商差异与 counter wrap；保留原始证据并用 fixture 覆盖。

回滚：停用 v2c profile/任务，保留历史观测。

## 后续 Ticket
- [T028](T028-snmpv3-secure-polling.md)
- [T029](T029-snmp-interface-discovery-candidates.md)
- [T030](T030-inventory-metrics-scheduler-policy.md)
