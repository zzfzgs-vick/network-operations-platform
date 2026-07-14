# T023：受控 CSV 资产导入与撤销

## 状态
PLANNED

## 目标
提供校验、预览、幂等、确认、错误报告和可撤销的 Desired State 导入。

## 背景
批量资产建立不能按名称/IP静默覆盖，也不能绕过字段所有权和审计。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-AST-001
- MVP-AST-002
- MVP-AST-009
- MVP-GEN-115
- MVP-SEC-001
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)

## 前置依赖
- [T019](T019-managed-device-central-collector.md)
- [T010](T010-append-only-audit-foundation.md)

## 允许修改范围
- `apps/platform/src/modules/assets/`
- `apps/platform/migrations/`
- `packages/contracts/`
- `apps/web/src/features/assets/import/`
- `tests/e2e/import/`

## 禁止修改范围
不得支持任意 Excel 宏、外部 CMDB 双向同步、按名称/IP默认覆盖或无人确认提交。

## 实施要求
- 定义受限 CSV 格式、稳定匹配优先级和字段级所有权。
- 实现上传校验、预览、新增/修改/冲突/忽略统计和错误行下载。
- 以 batchId/idempotencyKey 提交确认，重复提交不重复修改。
- 实现批次审计和可撤销前向补偿，保留原历史。

## 数据库与迁移影响
新增 ImportBatch、ImportRowResult、变更前后引用与幂等约束。

## 安全影响
高影响输入边界；限制大小、行数、编码、公式注入和敏感列。

## 可观测性要求
导入行数、错误、冲突、耗时和撤销结果。

## 测试要求
- 恶意 CSV、重复上传/提交、冲突、部分错误和撤销测试。
- 权限与审计 E2E。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:security -- csv-import`
- `npm run test:db --workspace apps/platform -- import-batch`
- `npm run test:e2e -- asset-import`

## 完成定义
- 导入前可预览，确认后幂等。
- 错误行明确且无静默覆盖。
- 整批可审计撤销。

## 明确非目标
不支持 Excel/API 批量同步、CMDB 或自动数据修复。

## 风险与回滚
风险：CSV 公式/大文件 DoS；流式限额和转义测试。

回滚：执行批次撤销应用服务；不删除 ImportBatch 审计。

## 后续 Ticket
- [T024](T024-topology-differences-candidate-confirmation.md)

