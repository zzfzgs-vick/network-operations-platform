# T036：vmalert Metric Condition 编译、发布与回滚

## 状态
PLANNED

## 目标
把权威 Metric Condition Version 编译为受控规则包并原子发布到 vmalert。

## 背景
生产 YAML 不能手工成为权威，Alert/Health 必须共同使用已验证的同一版本。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-CND-002
- MVP-CND-005
- MVP-CND-007
- MVP-ARC-014
- MVP-ARC-015
- MVP-GEN-112
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)

## 前置依赖
- [T035](T035-condition-definition-direct-evaluation.md)
- [T003](T003-local-compose-infrastructure.md)
- [T008](T008-configuration-secrets-service-auth.md)

## 允许修改范围
- `apps/platform/src/modules/conditions/`
- `apps/platform/migrations/`
- `deploy/vmalert/ 生成目录与发布适配器`
- `tests/integration/vmalert-publication/`

## 禁止修改范围
不得允许用户上传任意 YAML、模板访问 Secret、API 直接执行文件路径或创建第二 MetricsQL 定义。

## 实施要求
- 为 MetricConditionDefinition 保存唯一 MetricsQL、阈值、窗口、迟滞、标签和限制。
- 生成带 conditionId/version/config hash 的不可变规则包。
- 执行语法/依赖/单元测试，原子替换并 Reload/检查实际加载。
- 失败保持全部消费者在上一有效版本并记录审计/部署状态。

## 数据库与迁移影响
新增 ConditionDeployment/Validation/ExecutionBinding 元数据。

## 安全影响
表达式长度、结果数、并发和路径限制；内部 Reload 认证。

## 可观测性要求
发布/Reload 成败、哈希漂移、执行器版本和回滚。

## 测试要求
- 有效/无效 MetricsQL、Reload 失败、文件原子替换、版本一致性和回滚测试。
- 生成物无 Secret。

## 验收命令
- `npm run test:integration --workspace apps/platform -- vmalert-publication`
- `npm run test:contract -- vmalert-rules`
- `docker compose -f deploy/compose/dev.compose.yml config`
- `npm run typecheck`

## 完成定义
- 平台数据库是唯一规则权威。
- 发布失败不产生混合版本。
- 当前/期望哈希可查询。

## 明确非目标
不处理 vmalert 推送、Alert Episode 或 Health。

## 风险与回滚
风险：Windows/Linux 原子文件语义差异；同文件系统 rename 并双平台测试。

回滚：重新激活上一规则包并 Reload，保留失败部署记录。

## 后续 Ticket
- [T037](T037-metric-condition-ingest-reconciliation.md)

