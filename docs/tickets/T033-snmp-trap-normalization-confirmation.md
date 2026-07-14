# T033：SNMP Trap 接收、规范化与补充确认

## 状态
PLANNED

## 目标
接收标准/受控厂商 Trap，形成平台事件并以补充轮询确认关键状态。

## 背景
Trap 是实时证据但可能丢失、乱序或伪造，不能独自无条件恢复 Alert。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-010
- MVP-COL-005
- MVP-ALT-008
- MVP-OBS-001
- MVP-OBS-002
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)

## 前置依赖
- [T025](T025-collector-task-result-contracts.md)
- [T029](T029-snmp-interface-discovery-candidates.md)

## 允许修改范围
- `services/collector/internal/trap/`
- `apps/platform/src/modules/observations/`
- `apps/platform/src/modules/collection/`
- `packages/contracts/`
- `mib/`
- `tests/fixtures/trap/`

## 禁止修改范围
不得支持 Syslog、任意未审查 MIB、原始 Trap 全文时序标签或直接修改 Alert/Health。

## 实施要求
- 在容器 UDP 1162 接收并校验已纳管来源，生产映射 162。
- 解析标准和最小受控 MIB，保留脱敏摘要并规范化事件。
- linkDown/linkUp 创建候选事实和高优先补充 SNMP Poll。
- Trap 丢失不影响轮询路径，重复/乱序幂等。

## 数据库与迁移影响
新增 TrapEvent 安全摘要和 Inbox 类型；不存无界全文。

## 安全影响
来源校验、包大小/速率限制、MIB 审查和服务网络边界。

## 可观测性要求
接收、拒绝、解析失败、重复、确认轮询和可见延迟。

## 测试要求
- 标准 Trap fixture、伪造来源、重复、乱序、linkDown/linkUp 确认测试。
- Go fuzz/解析边界测试。

## 验收命令
- `go test ./services/collector/internal/trap/...`
- `npm run test:integration --workspace apps/platform -- trap-ingest`
- `pwsh -File scripts/smoke-trap.ps1`
- `npm run test:security -- trap-boundary`

## 完成定义
- Trap 可安全进入 Fact/Event 路径。
- 状态变化由身份和轮询确认。
- 原始无界内容不进入标签/日志。

## 明确非目标
不实现 Syslog、所有厂商私有 Trap 或直接 Alert 生命周期。

## 风险与回滚
风险：UDP 欺骗与解析器崩溃；来源 allowlist、限速和 fuzz。

回滚：停用 Trap listener/profile，保留已接收摘要。

## 后续 Ticket
- [T034](T034-freshness-source-availability.md)
- [T040](T040-alert-rule-fingerprint-episodes.md)
