# T021：Managed Interface 身份与候选匹配

## 状态
PLANNED

## 目标
实现不可变 interfaceId、接口类型规则和 ifIndex 变化下的候选匹配。

## 背景
ifIndex 只属于观测上下文，接口重启、模块更换和逻辑接口类型需要不同匹配证据。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AST-007
- MVP-AST-008
- MVP-OBS-003
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T020](T020-device-instance-matching-replacement.md)

## 允许修改范围
- `apps/platform/src/modules/assets/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `apps/web/src/features/assets/`
- `tests/integration/interface-identity/`

## 禁止修改范围
不得实现 SNMP 轮询、自动合并证据不足接口或删除旧接口。

## 实施要求
- 创建 ManagedInterface、类型、可变属性、MatchingEvidence 和候选关系。
- 为物理、聚合、SVI、Loopback、子接口、Tunnel、管理和其他逻辑接口定义最小匹配策略。
- 保存原始 ifIndex 但不作为正式身份。
- 实现人工确认、拒绝、重新绑定和撤销审计。

## 数据库与迁移影响
新增接口、候选和证据迁移，包含设备内身份与并发确认约束。

## 安全影响
接口编辑需 assets.manage；不包含凭据。

## 可观测性要求
记录匹配结果、冲突、规则版本和候选积压。

## 测试要求
- ifIndex 变化、接口重命名、聚合/SVI/子接口和证据不足测试。
- 并发确认不产生重复 interfaceId。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- interface-identity`
- `npm run test:integration --workspace apps/platform -- interface-candidate`
- `npm run typecheck`

## 完成定义
- 接口 ID 不随 ifIndex/名称变化。
- 低置信度仅形成候选。
- 历史可撤销和追踪。

## 明确非目标
不执行 SNMP 发现或绘制接口拓扑。

## 风险与回滚
风险：错误匹配混合时序历史；候选默认和唯一约束保护。

回滚：撤销候选关联，保留接口与证据；前向迁移修复。

## 后续 Ticket
- [T022](T022-circuits-business-topology-desired.md)
- [T024](T024-topology-differences-candidate-confirmation.md)
- [T029](T029-snmp-interface-discovery-candidates.md)

