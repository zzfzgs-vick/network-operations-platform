# T029：SNMP 接口发现、身份候选与差异

## 状态
PLANNED

## 目标
将接口表 Observed State 与不可变接口身份匹配，生成可审查候选和差异。

## 背景
真实 ifIndex 会变化，接口发现不能批量重复创建或删除正式接口。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-COL-001
- MVP-AST-007
- MVP-AST-008
- MVP-OBS-002
- MVP-OBS-003
- MVP-PER-003
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T021](T021-managed-interface-identity.md)
- [T024](T024-topology-differences-candidate-confirmation.md)
- [T027](T027-snmpv2c-interface-polling.md)

## 允许修改范围
- `apps/platform/src/modules/observations/`
- `apps/platform/src/modules/assets/`
- `apps/platform/src/modules/topology/`
- `services/collector/internal/snmp/`
- `tests/integration/interface-discovery/`
- `apps/web/src/features/topology/differences/`

## 禁止修改范围
不得自动合并证据不足接口、删除旧接口或自动成为正式线路。

## 实施要求
- 规范化 ifName/ifAlias/type/slot/port/MAC/aggregation/VLAN/LLDP local port 等证据。
- 按接口类型运行版本化匹配，输出 MATCHED/CANDIDATE/AMBIGUOUS/CONFLICT/NEW_IDENTITY。
- ifIndex 变化关联到同 interfaceId 或产生候选，不覆盖历史原值。
- 缺失接口进入 STALE/MISSING 差异。

## 数据库与迁移影响
扩展接口证据、发现批次和差异迁移，增加并发唯一约束。

## 安全影响
发现写入仅内部服务；人工确认需 topology.confirm/assets.manage。

## 可观测性要求
发现数量、匹配结果、歧义、重复阻止和耗时。

## 测试要求
- 设备重启、ifIndex 变化、名称变化、异常序列号、多类型接口测试。
- 并发批次不重复身份。

## 验收命令
- `npm run test:db --workspace apps/platform -- interface-discovery`
- `go test ./services/collector/internal/snmp/... -run InterfaceTable`
- `npm run test:e2e -- interface-candidate`
- `npm run verify`

## 完成定义
- 接口发现形成 Observed/候选而非静默权威修改。
- ifIndex 变化不批量重复。
- 确认/拒绝路径可用。

## 明确非目标
不实现 LLDP 邻接、完整厂商堆叠或拓扑渲染。

## 风险与回滚
风险：匹配过度导致历史污染；默认候选并保留规则版本。

回滚：撤销候选决策，保留发现历史。

## 后续 Ticket
- [T030](T030-inventory-metrics-scheduler-policy.md)
- [T033](T033-snmp-trap-normalization-confirmation.md)
- T048

