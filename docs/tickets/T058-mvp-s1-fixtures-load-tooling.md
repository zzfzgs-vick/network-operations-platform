# T058：MVP-S1 可重复数据、协议与负载工具

## 状态
PLANNED

## 目标
建立固定版本的设备、接口、Probe、拓扑、告警风暴、Web/SSE 和时序测试工具链。

## 背景
容量验收不能只插数据库记录，必须用可重复真实/模拟工作负载。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-PER-002
- MVP-PER-003
- MVP-PER-004
- MVP-PER-005
- MVP-PER-009
- MVP-PER-013
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)

## 前置依赖
- [T030](T030-inventory-metrics-scheduler-policy.md)
- [T032](T032-http-dns-active-probes.md)
- [T033](T033-snmp-trap-normalization-confirmation.md)
- [T042](T042-condition-health-alert-integration.md)
- [T051](T051-authorized-sse-stale-client-state.md)

## 允许修改范围
- `tests/capacity/`
- `tests/fixtures/`
- `services/ 下仅测试目标/Agent`
- `scripts/capacity-*`
- `docs/specs/mvp-s1-capacity-acceptance.md 的工具说明`

## 禁止修改范围
不得改变容量目标、生成生产数据、安装集群组件或用无意义指标填满预算。

## 实施要求
- 生成固定 seed 的 500/600 设备、30k/36k 接口和 5k/6k 拓扑数据。
- 提供 SNMP v2c/v3 模拟 Agent、Probe 目标、Trap、慢/超时/异常/ifIndex 变化场景。
- 提供 2k/2.4k Probe、Web/SSE、时序写查和 10k Alert 转换工具。
- 固定配置、版本、清理和报告原始数据格式。

## 数据库与迁移影响
测试数据通过公开/测试导入路径创建，不绕过不可变身份/约束；清理隔离。

## 安全影响
所有测试凭据仅本地随机生成，工具不得成为通用攻击器。

## 可观测性要求
工具自身记录实际规模、周期、吞吐、错误和 seed。

## 测试要求
- 生成确定性、重复运行无重复身份、清理和资源上限测试。
- 协议模拟与真实少量设备测试分开。

## 验收命令
- `pwsh -File tests/capacity/generate.ps1 -Profile MVP-S1 -Seed 20260714`
- `npm run test:capacity -- tooling-smoke`
- `go test ./tests/capacity/...`
- `npm run verify`

## 完成定义
- 目标/压力数据可一键生成和清理。
- 工作负载覆盖协议与失败混合。
- 输出可进入统一报告。

## 明确非目标
不执行正式8小时/120%验收，不选择超出需要的负载平台。

## 风险与回滚
风险：工具本身成为瓶颈；独立记录发生器资源并支持分进程。

回滚：清理隔离测试数据/容器，保留生成器版本。

## 后续 Ticket
- [T059](T059-mvp-s1-target-capacity-acceptance.md)

