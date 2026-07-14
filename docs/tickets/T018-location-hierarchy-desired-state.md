# T018：区域、站点、机房与设备组期望状态

## 状态
PLANNED

## 目标
提供首个受 RBAC 和审计保护的资产层级 CRUD 纵向切片。

## 背景
设备、线路、拓扑和容量统计都依赖稳定的区域/站点/机房/设备组身份。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AST-001
- MVP-AST-002
- MVP-AST-010
- MVP-UIO-001
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T012](T012-permission-rbac-enforcement.md)
- [T014](T014-csrf-session-sse-lifecycle.md)
- [T010](T010-append-only-audit-foundation.md)

## 允许修改范围
- `apps/platform/src/modules/assets/`
- `apps/platform/migrations/`
- `packages/contracts/openapi/public.yaml`
- `apps/web/src/features/assets/ 的最小管理页`
- `tests/e2e/assets/`

## 禁止修改范围
不得创建设备、接口、线路、发现或完整资产 UI。

## 实施要求
- 创建不可变层级 ID、名称、状态、父子约束和归档迁移。
- 实现受 assets.read/assets.manage 保护的命令/查询和审计。
- 创建最小列表/创建/编辑/归档页面作为纵向验证。
- 归档不删除历史引用。

## 数据库与迁移影响
新增 Region/Site/Room/DeviceGroup 表、层级唯一约束和版本字段。

## 安全影响
资产写入受后端权限和 CSRF；输入长度/字符校验。

## 可观测性要求
记录命令成功失败和查询延迟。

## 测试要求
- 领域层级、数据库约束、API 权限和浏览器 CRUD 测试。
- 归档后历史可查询。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- asset-hierarchy`
- `npm run test:e2e -- asset-hierarchy`
- `npm run verify`

## 完成定义
- 层级可创建、查询、编辑和归档。
- 所有操作有审计。
- 无物理删除。

## 明确非目标
不实现 Managed Device、CSV 导入或拓扑。

## 风险与回滚
风险：层级循环和重名；数据库/领域双重约束。

回滚：通过前向迁移禁用写入，保留已创建身份和审计。

## 后续 Ticket
- [T019](T019-managed-device-central-collector.md)

