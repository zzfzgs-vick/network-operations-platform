# T020：Device Instance、匹配证据与硬件替换

## 状态
PLANNED

## 目标
区分逻辑设备与实际硬件实例，实现可审计的候选匹配和人工替换。

## 背景
硬件更换不能混合序列号、运行时间和指标历史，弱证据不能自动关联。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AST-005
- MVP-AST-006
- MVP-AST-008
- MVP-AST-011
- MVP-GEN-106
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T019](T019-managed-device-central-collector.md)

## 允许修改范围
- `apps/platform/src/modules/assets/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `apps/web/src/features/assets/`
- `tests/e2e/device-identity/`

## 禁止修改范围
不得实现机器学习匹配、所有厂商堆叠识别、无人审批复杂合并或物理删除历史。

## 实施要求
- 创建 DeviceInstance、MatchingEvidence、IdentityCandidate、IdentityRedirect、ReplacementRecord。
- 实现强/中/弱证据分类、唯一无冲突强证据自动关联和其他情况候选。
- 实现人工确认/拒绝/合并/撤销/替换，保留原 ID 与审计。
- 表达堆叠多成员和同管理 IP 多实例，不自动识别所有厂商。

## 数据库与迁移影响
新增身份实例与证据表、唯一/重定向/版本约束。

## 安全影响
序列号/MAC 视为资产数据；身份操作需 assets.manage 并审计。

## 可观测性要求
匹配结果、置信度、规则版本、冲突和人工操作计数。

## 测试要求
- 重复 IP、异常序列号、冲突强证据、替换和撤销测试。
- 并发确认只产生一个有效关联。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- device-identity`
- `npm run test:e2e -- device-replacement`
- `npm run typecheck`

## 完成定义
- 硬件替换保留 managedDeviceId 并创建新 instanceId。
- 弱证据不自动合并。
- 错误合并可撤销。

## 明确非目标
不实现接口身份、SNMP 发现或厂商堆叠全自动识别。

## 风险与回滚
风险：错误合并污染历史；唯一约束、审计和撤销是门槛。

回滚：撤销候选/重定向操作，保留原记录；Schema 用前向修复。

## 后续 Ticket
- T021

