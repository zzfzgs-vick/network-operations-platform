# T056：空白主机恢复与历史会话失效演练

## 状态
PLANNED

## 目标
在干净 Ubuntu 24.04 主机按顺序恢复核心平台并实测 RPO/RTO。

## 背景
存在备份不等于可恢复，生产验收要求从空主机恢复身份、配置、指标和采集。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-002
- MVP-OPS-003
- MVP-OPS-004
- MVP-OPS-005
- MVP-OPS-006
- MVP-SEC-006
- MVP-OPS-001
- MVP-OPS-002
- MVP-OPS-007
- MVP-AUT-014
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)

## 前置依赖
- [T055](T055-off-host-backup-automation.md)
- [T054](T054-executive-session-security-acceptance.md)
- [T046](T046-alert-incident-operations-api-acceptance.md)

## 允许修改范围
- `deploy/restore/`
- `docs/architecture/mvp-deployment.md 的恢复 Runbook`
- `tests/recovery/blank-host/`
- `docs/handoffs/ 的演练记录`

## 禁止修改范围
不得实现自动故障转移、跨机房灾备、恢复旧 Session 或把演练简化为文件存在检查。

## 实施要求
- 编写恢复顺序：主机/Docker→仓库/Secret→PostgreSQL全局+业务→迁移检查→API/Worker/Go→VM→辅助服务。
- 恢复后强制失效所有 Session 并验证 Emergency Administrator 重新认证。
- 验证用户、身份、资产、拓扑、规则、维护、Alert/Incident、VM 历史和新采集。
- 记录实际丢失窗口、RPO/RTO、问题和修正。

## 数据库与迁移影响
恢复生产等价备份；任何修正用新迁移，不改已发布迁移。

## 安全影响
高影响；Secret/应急材料受控，恢复操作需近期 MFA/主机授权。

## 可观测性要求
每阶段开始/完成、失败、总 RTO、数据窗口和恢复后健康。

## 测试要求
- 真实空白 Ubuntu 主机恢复演练。
- 旧 Cookie 全失效，身份 ID 不变化，Compose 重启可恢复。

## 验收命令
- `bash tests/recovery/blank-host/run.sh`
- `npm run test:recovery -- post-restore-verification`
- `npm run test:security -- restored-session-invalidation`

## 完成定义
- A类≤4h/4h、B类≤24h/8h 有实测证据。
- 核心平台和新采集恢复。
- 旧 Session 全无效。

## 明确非目标
不实现自动备用主机漂移、PITR、零停机或跨站点复制。

## 风险与回滚
风险：演练环境与生产偏差；记录精确版本/硬件/Secret流程。

回滚：演练失败不影响生产；修正 Runbook/脚本后重新完整演练。

## 后续 Ticket
- [T057](T057-self-monitoring-degradation-external-check.md)
- [T060](T060-stress-recovery-release-acceptance.md)
