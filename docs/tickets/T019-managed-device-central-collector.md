# T019：Managed Device 与 central-default Collector

## 状态
PLANNED

## 目标
创建逻辑设备期望状态和内置中心采集节点，保留未来 Collector 关联。

## 背景
第一个业务纵向切片需要稳定 managedDeviceId 和 collectorId，但不实现远程节点注册。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-020
- MVP-AST-010
- MVP-UIO-001
- MVP-ARC-005
- MVP-AST-004
- MVP-AST-006
- MVP-COL-003
- MVP-GEN-101
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T018](T018-location-hierarchy-desired-state.md)

## 允许修改范围
- `apps/platform/src/modules/assets/`
- `apps/platform/src/modules/collection/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `apps/web/src/features/assets/`
- `tests/e2e/devices/`

## 禁止修改范围
不得实现 Device Instance 自动发现、SNMP、远程 Collector 注册、mTLS 或分布式调度。

## 实施要求
- 创建 ManagedDevice 不可变身份、业务名称、管理地址、角色、重要等级、负责人和层级关联。
- 创建内置且不可删除的 central-default CollectorNode。
- 设备可选择 preferredCollectorId，默认 central-default。
- 实现受控 CRUD、归档、权限、审计和最小详情页。

## 数据库与迁移影响
新增 ManagedDevice、CollectorNode 和引用约束；管理 IP 不唯一充当身份。

## 安全影响
管理地址按敏感详情权限输出；无凭据字段。

## 可观测性要求
记录设备变更、Collector 关联和查询延迟。

## 测试要求
- IP/名称重复不合并，ID 不变。
- central-default 初始化幂等且不能普通删除。
- 权限/API/UI 纵向测试。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- managed-device`
- `npm run test:e2e -- managed-device`
- `npm run verify`

## 完成定义
- 测试设备可经 UI/API 创建并关联中心节点。
- 设备 ID 不受属性变化影响。
- 分布式能力未进入范围。

## 明确非目标
不实现硬件实例、接口、采集任务或凭据。

## 风险与回滚
风险：把管理 IP 当唯一键；数据库测试必须允许合理复用并生成候选。

回滚：归档设备而非删除；前向撤销写入口。

## 后续 Ticket
- [T020](T020-device-instance-matching-replacement.md)
- T023
- T025
