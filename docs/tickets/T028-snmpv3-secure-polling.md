# T028：SNMPv3 安全凭据与采集

## 状态
PLANNED

## 目标
在与 v2c 相同任务/结果边界下实现 SNMPv3 默认安全模式。

## 背景
SNMPv3 是 MVP 默认安全采集方式，Engine ID 还可作为强身份证据。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-COL-001
- MVP-SEC-003
- MVP-AST-006
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T027](T027-snmpv2c-interface-polling.md)
- [T016](T016-mfa-recovery-step-up-break-glass.md)

## 允许修改范围
- `services/collector/internal/snmp/`
- `apps/platform/src/modules/collection/`
- `apps/platform/migrations/`
- `apps/web/src/features/assets/credentials/`
- `tests/integration/snmp/`

## 禁止修改范围
不得返回/导出明文 Secret、把凭据嵌入任务日志或实现设备配置写入。

## 实施要求
- 创建加密 CredentialReference 生命周期和最小管理 API，需 credentials.manage 与近期 MFA。
- 实现 SNMPv3 auth/privacy 组合、Engine ID 获取和错误分类。
- Go 仅在执行内存解密/使用凭据，不持久化明文。
- 复用 v2c 指标/Observation 规范和限流。

## 数据库与迁移影响
新增加密 SNMP Credential 元数据和密钥版本；密钥不入库。

## 安全影响
最高影响；凭据查看/修改 step-up、审计和泄露扫描。

## 可观测性要求
按非敏感认证失败类别计数，不记录用户名/Secret。

## 测试要求
- 协议矩阵、错误凭据、Engine ID、密钥轮换、权限和日志泄露测试。
- v2c/v3 同设备调度隔离。

## 验收命令
- `go test ./services/collector/internal/snmp/... -run V3`
- `npm run test:security -- snmp-credentials`
- `npm run test:integration --workspace apps/platform -- snmpv3`
- `npm run typecheck`

## 完成定义
- SNMPv3 可安全采集核心字段。
- 凭据管理受 MFA 和审计保护。
- 数据库/日志无明文 Secret。

## 明确非目标
不实现所有厂商私有 MIB 或自动配置设备。

## 风险与回滚
风险：加密密钥丢失导致不可用；运行文档记录轮换/恢复，不降级明文。

回滚：停用/轮换凭据和任务，保留加密记录与审计。

## 后续 Ticket
- [T029](T029-snmp-interface-discovery-candidates.md)
- [T030](T030-inventory-metrics-scheduler-policy.md)

