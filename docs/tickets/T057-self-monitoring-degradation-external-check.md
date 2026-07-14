# T057：平台自监控、降级与外部可用性检查

## 状态
PLANNED

## 目标
完成组件故障区分、降级行为、外部检查接口和运维告警。

## 背景
平台无法可靠通知自身整机失效，且来源故障不能让业务状态假恢复。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-GEN-006
- MVP-OPS-014
- MVP-OPS-015
- MVP-OPS-016
- MVP-SEC-005
- MVP-OPS-008
- MVP-OPS-009
- MVP-OPS-010
- MVP-OPS-011
- MVP-OPS-012
- MVP-OPS-013
- MVP-COL-007
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T007](T007-platform-observability-health-baseline.md)
- [T034](T034-freshness-source-availability.md)
- [T055](T055-off-host-backup-automation.md)

## 允许修改范围
- `apps/platform/src/modules/platform-health/`
- `deploy/monitoring/`
- `docs/architecture/mvp-deployment.md`
- `tests/recovery/degradation/`

## 禁止修改范围
不得建设第二套 HA 监控平台、依赖同一失效 vmalert 路径作为唯一检测或把故障显示正常。

## 实施要求
- 区分应用容器、PostgreSQL、VM、Collector、Worker、vmalert、宿主机和备份目标。
- 实现 PostgreSQL fail closed、VM 指标不可用但配置可读、Collector stale、恢复后重新对账。
- 提供外部检查所需 HTTPS health、最近备份和最近采集接口/Runbook。
- 实现降级优先级和明确 UI/API 状态。

## 数据库与迁移影响
可扩展 PlatformHealthEvent；不改业务权威模型。

## 安全影响
外部 health 只暴露最小状态，管理详情需认证。

## 可观测性要求
本 Ticket 完成平台自监控与外部监测契约。

## 测试要求
- 逐组件断开/恢复、整机外部探测、备份目标失败和 stale 恢复测试。
- 验证无安全默认放行。

## 验收命令
- `npm run test:recovery -- degradation-matrix`
- `pwsh -File tests/recovery/external-check/run.ps1`
- `npm run test:security -- health-endpoints`
- `npm run verify`

## 完成定义
- 组件故障可区分且不假正常。
- 外部系统可检测整机、备份和采集。
- 恢复后对账完成。

## 明确非目标
不实现 HA、自动漂移或单位外部监控系统本身。

## 风险与回滚
风险：自监控循环依赖；外部+Go/NestJS 独立检查分担。

回滚：保留基础 health，回退错误降级规则并重新故障测试。

## 后续 Ticket
- [T059](T059-mvp-s1-target-capacity-acceptance.md)
- [T060](T060-stress-recovery-release-acceptance.md)
