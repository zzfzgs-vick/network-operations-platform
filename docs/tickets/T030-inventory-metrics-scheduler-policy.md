# T030：设备库存、资源指标与采集调度策略

## 状态
PLANNED

## 目标
补齐设备资源/库存采集和按优先级、抖动、退避运行的生产调度。

## 背景
核心状态必须优先于库存，慢设备与不可达设备不能形成请求风暴。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-COL-001
- MVP-COL-002
- MVP-COL-003
- MVP-COL-004
- MVP-COL-007
- MVP-PER-003
- MVP-PER-011
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T027](T027-snmpv2c-interface-polling.md)
- [T028](T028-snmpv3-secure-polling.md)

## 允许修改范围
- `services/collector/internal/snmp/`
- `services/collector/internal/app/`
- `apps/platform/src/modules/collection/`
- `tests/integration/scheduler/`
- `profiles/`

## 禁止修改范围
不得加入任意脚本 profile、厂商全量 MIB、Broker 或最终 Health 判断。

## 实施要求
- 采集 sysName/sysDescr/sysObjectID/uptime/model/serial/software/CPU/memory/temperature 等可用字段。
- 实现核心 10/15 秒、普通 30/60 秒、LLDP 10 分钟、资产 6 小时、库存 24 小时的配置基线。
- 加入随机抖动、每设备并发上限、优先级、合理退避和恢复。
- 静态/可变指标按受控标签与 Fact 分流。

## 数据库与迁移影响
扩展 collection profile/task schedule 和执行历史；版本化迁移。

## 安全影响
profile 不得包含明文凭据或任意代码。

## 可观测性要求
每类周期、启动延迟、执行耗时、退避、队列和最老任务。

## 测试要求
- 慢/超时/OID缺失/大量接口和不可达退避测试。
- 核心任务在库存压力下仍按时。

## 验收命令
- `go test ./services/collector/internal/app/... -run Scheduler`
- `go test ./services/collector/internal/snmp/... -run Inventory`
- `npm run test:integration --workspace apps/platform -- collection-schedule`
- `npm run verify`

## 完成定义
- 资源和库存按参考周期运行。
- 任务无同步风暴和饥饿。
- 恢复后队列可回落。

## 明确非目标
不实现容量最终验收、LLDP 邻接或 Health。

## 风险与回滚
风险：错误周期造成设备/平台过载；默认值集中配置并有负载测试。

回滚：停用低优先 profile 并恢复上一调度配置。

## 后续 Ticket
- [T034](T034-freshness-source-availability.md)
- T058
