# T039：健康聚合、覆盖率、迟滞与上游传播

## 状态
PLANNED

## 目标
实现设备、接口、线路、站点和业务的版本化聚合策略与增量重算。

## 背景
关键依赖不能被平均掉，UNKNOWN 必须进入覆盖率和领导统计。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-HLT-005
- MVP-HLT-006
- MVP-HLT-007
- MVP-HLT-008
- MVP-UIE-005
- MVP-GEN-006
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)

## 前置依赖
- [T038](T038-current-health-policy-transitions.md)
- [T022](T022-circuits-business-topology-desired.md)
- [T034](T034-freshness-source-availability.md)

## 允许修改范围
- `apps/platform/src/modules/health/`
- `apps/platform/src/modules/topology/ 公共读取接口`
- `apps/platform/migrations/`
- `tests/integration/health-aggregation/`

## 禁止修改范围
不得使用全局简单平均、页面请求时全量扫描、把维护算健康或把上游不可达传播为全部 CRITICAL。

## 实施要求
- 实现 CRITICAL_DEPENDENCY、WEIGHTED_COMPONENT、QUORUM、REDUNDANCY_GROUP、PERCENTAGE_THRESHOLD。
- 按对象类型配置覆盖率、关键输入、进入/恢复窗口和迟滞。
- Condition 变化只增量重算受影响父对象，周期一致性校验。
- 上游不可达使下游 UNKNOWN/UPSTREAM_UNREACHABLE，维护独立统计。

## 数据库与迁移影响
扩展策略、依赖图、聚合快照和一致性作业状态。

## 安全影响
策略修改需 system/alerts configure 权限和审计。

## 可观测性要求
重算队列、最老等待、耗时、覆盖率、UNKNOWN 和一致性偏差。

## 测试要求
- 1 核心 CRITICAL+99 健康、冗余单/双故障、覆盖不足、迟滞和上游传播测试。
- 30k 缩放模型下增量范围测试。

## 验收命令
- `npm run test --workspace apps/platform -- health-aggregation`
- `npm run test:db --workspace apps/platform -- health-incremental`
- `npm run test:integration --workspace apps/platform -- health-freshness`
- `npm run typecheck`

## 完成定义
- 关键依赖不会被平均。
- 覆盖不足返回 UNKNOWN/null。
- 状态抖动受迟滞控制。

## 明确非目标
不实现大屏 UI、机器学习评分或任意脚本公式。

## 风险与回滚
风险：依赖图重算爆炸；限定 DAG、增量索引和周期校验。

回滚：恢复上一策略版本并触发受控重算，不改写历史。

## 后续 Ticket
- T042
- T052

