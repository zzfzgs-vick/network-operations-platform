# T044：Incident-Alert 关联、根因角色与影响快照

## 状态
PLANNED

## 目标
把多个 Alert、Health Impact 和拓扑快照关联到一个 Incident，并保留历史关系。

## 背景
历史 Incident 不能随当前拓扑变化，解除关联也不能删除 Alert。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-INC-003
- MVP-INC-004
- MVP-INC-005
- MVP-TOP-002
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)

## 前置依赖
- [T043](T043-incident-lifecycle-timeline.md)
- [T042](T042-condition-health-alert-integration.md)
- [T022](T022-circuits-business-topology-desired.md)
- [T039](T039-health-aggregation-freshness-hysteresis.md)

## 允许修改范围
- `apps/platform/src/modules/incidents/`
- `apps/platform/src/modules/topology/ 公共快照接口`
- `apps/platform/src/modules/health/ 公共影响接口`
- `apps/platform/migrations/`
- `tests/integration/incident-links/`

## 禁止修改范围
不得修改 Alert Severity/状态、实时查询当前拓扑替代历史快照或物理删除解除关系。

## 实施要求
- 创建 IncidentAlertLink 与 ROOT_CAUSE_CANDIDATE/CONFIRMED_ROOT_CAUSE/SYMPTOM/IMPACT/RELATED。
- 同一 Alert 同时仅一个主要开放 Incident，次要关联需原因。
- 保存站点、设备、线路、业务、时间和影响等级快照/版本引用。
- 关联/解除、根因和影响变化追加时间线与审计。

## 数据库与迁移影响
新增关联、影响快照和主要开放关联唯一约束。

## 安全影响
关联/根因修改需 incidents.manage；展示遵循资产权限。

## 可观测性要求
重复 Incident 候选、关联角色、影响范围计算耗时。

## 测试要求
- 拓扑变更后历史快照稳定、解除保留历史、并发主关联约束。
- Incident 关闭/取消不改 Alert。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- incident-links`
- `npm run test:integration --workspace apps/platform -- impact-snapshot`
- `npm run typecheck`

## 完成定义
- 一 Incident 可关联多 Alert。
- 角色和历史解除可解释。
- 影响快照不随当前拓扑漂移。

## 明确非目标
不实现自动声明、UI、外部工单或 ML 根因。

## 风险与回滚
风险：快照体量膨胀；保存必要字段/版本引用而非复制全图。

回滚：解除新关联并保留解除记录；快照不删除。

## 后续 Ticket
- [T045](T045-incident-close-reopen-correlation.md)

