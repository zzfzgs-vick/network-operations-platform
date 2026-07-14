# T024：拓扑差异、候选确认与禁止静默删除

## 状态
PLANNED

## 目标
把发现/期望差异转为可确认、拒绝、锁定、忽略和归档的治理流程。

## 背景
Observed State 只能作为证据；Effective State 的变化需要人工批准且消失关系不能物理删除。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AST-004
- MVP-AST-005
- MVP-AST-006
- MVP-AST-008
- MVP-AST-009
- MVP-AST-010
- MVP-AST-011
- MVP-JOB-003
- MVP-UIO-001
- MVP-AST-001
- MVP-AST-002
- MVP-AST-003
- MVP-TOP-003
- MVP-TOP-004
- MVP-GEN-111
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T021](T021-managed-interface-identity.md)
- [T022](T022-circuits-business-topology-desired.md)
- [T023](T023-controlled-csv-import.md)

## 允许修改范围
- `apps/platform/src/modules/topology/`
- `apps/platform/src/modules/assets/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `apps/web/src/features/topology/differences/`
- `tests/e2e/topology-differences/`

## 禁止修改范围
不得自动提升正式拓扑、物理删除候选历史、修改设备配置或实现 LLDP 协议采集。

## 实施要求
- 创建 TopologyDifference/Candidate 状态机及 CANDIDATE/CONFIRMED/REJECTED/CONFLICT/STALE/MISSING/LOCKED/RETIRED。
- 覆盖新设备/接口/邻接、期望缺失、对端/站点/型号/序列号/接口名变化和身份歧义。
- 实现接受、拒绝、忽略、合并、锁定、误报与撤销审计。
- 确认正式关系与重算 Outbox 在同一事务提交。

## 数据库与迁移影响
新增差异/候选/决策历史和状态唯一约束。

## 安全影响
确认需 topology.confirm；合并/锁定操作强审计。

## 可观测性要求
候选积压、冲突、陈旧和处理时长。

## 测试要求
- 重复发现、消失、锁定冲突、并发确认和 Outbox 崩溃点测试。
- UI 权限和审计 E2E。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- topology-difference`
- `npm run test:e2e -- topology-candidate`
- `npm run test:integration --workspace apps/platform -- topology-outbox`

## 完成定义
- Observed 不静默覆盖 Effective。
- 消失关系走 STALE/MISSING。
- 确认原子且可审计。

## 明确非目标
不实现 LLDP 采集、自动拓扑重构或完整拓扑可视化。

## 风险与回滚
风险：确认与重算双写；使用事务 Outbox。

回滚：撤销确认产生新的修正记录，不删除历史。

## 后续 Ticket
- [T029](T029-snmp-interface-discovery-candidates.md)
- T048
