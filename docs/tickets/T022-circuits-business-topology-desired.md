# T022：Circuit、业务路径与正式拓扑期望状态

## 状态
PLANNED

## 目标
建立线路双端、合同信息、业务依赖和人工布局的权威 Desired State。

## 背景
正式拓扑不能由发现结果或显示名称临时拼接，影响分析需要稳定关系身份。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AST-010
- MVP-TOP-001
- MVP-TOP-002
- MVP-AST-001
- MVP-AST-004
- MVP-TOP-006
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T021](T021-managed-interface-identity.md)

## 允许修改范围
- `apps/platform/src/modules/topology/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `apps/web/src/features/topology/ 的最小编辑入口`
- `tests/e2e/topology-desired/`

## 禁止修改范围
不得实现 LLDP 自动发现、全图渲染、Health 或无人审批关系。

## 实施要求
- 创建 Circuit、TopologyRelation、BusinessService/Path 和端点引用。
- 保存合同带宽、运营商、重要等级、启停、业务关联和布局坐标。
- 实现锁定、归档、版本和受 topology.manage 保护的命令。
- 正式关系和布局变更追加审计。

## 数据库与迁移影响
新增线路、正式关系、业务路径和布局迁移；端点使用不可变 ID 外键。

## 安全影响
业务名称和管理细节按权限输出；无设备 Secret。

## 可观测性要求
记录拓扑变更、版本冲突和查询延迟。

## 测试要求
- 端点完整性、并发版本、锁定、归档和权限测试。
- 关系 ID 不因端点显示名变化。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- topology-desired`
- `npm run test:e2e -- circuit-create`
- `npm run typecheck`

## 完成定义
- 正式线路与业务路径可受控维护。
- 拓扑坐标持久且可审计。
- 历史引用不被归档破坏。

## 明确非目标
不实现候选发现、拓扑图库或影响计算。

## 风险与回滚
风险：跨模块外键形成循环；只依赖 assets 公共身份。

回滚：归档关系而非删除；Schema 前向修复。

## 后续 Ticket
- [T024](T024-topology-differences-candidate-confirmation.md)
- T048
