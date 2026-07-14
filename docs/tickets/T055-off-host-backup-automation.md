# T055：主机外备份与数据保留策略

## 状态
PLANNED

## 目标
实现符合校验、告警和 Secret 分离要求的主机外备份，并落地业务数据保留策略。

## 背景
单主机故障必须依赖主机外备份；运行中 volume 复制不是可接受的唯一方案。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-OPS-002
- MVP-OPS-003
- MVP-OPS-004
- MVP-OPS-005
- MVP-OPS-006
- MVP-OPS-014
- MVP-OPS-015
- MVP-OPS-016
- MVP-SEC-003
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)

## 前置依赖
- [T009](T009-runtime-containers-graceful-lifecycle.md)
- [T016](T016-mfa-recovery-step-up-break-glass.md)
- [T007](T007-platform-observability-health-baseline.md)

## 允许修改范围
- `deploy/backup/`
- `deploy/compose/ 的备份作业接线`
- `docs/architecture/mvp-deployment.md 的运行说明`
- `tests/recovery/backup/`

## 禁止修改范围
不得提交真实目标凭据、实现 HA/PITR、复制运行中 volume 作为唯一备份或把密钥与备份无保护同存。

## 实施要求
- PostgreSQL 每 4 小时 custom-format 逻辑备份、角色/全局对象、checksum、可读验证和主机外复制。
- 实现 48h 每4小时、14日每日、8周每周保留。
- VictoriaMetrics 每日 snapshot+vmbackup，保留7日/4周并记录范围/大小/校验。
- 失败/目标不可用写运行记录并产生高优先级 Platform Alert。
- 配置原始指标90天、Alert/Incident/审计至少1年及正式身份/拓扑归档保留；清理不得破坏引用或静默缩短承诺。

## 数据库与迁移影响
可新增 BackupRun 元数据迁移；不改变业务表。

## 安全影响
backup.manage/restore.execute、近期 MFA；目标 Secret 独立注入。

## 可观测性要求
开始/结束、大小、checksum、目标、最近成功、失败原因和保留清理。

## 测试要求
- 假目标、校验失败、备份/业务数据保留清理、引用完整性、Secret 泄露和实际小型备份恢复验证。
- 失败告警测试。

## 验收命令
- `pwsh -File tests/recovery/backup/run.ps1`
- `npm run test:integration --workspace apps/platform -- backup-status`
- `npm run test:security -- backup-secrets`
- `npm run verify`

## 完成定义
- 两类备份可恢复且在主机外。
- 保留策略自动执行。
- 业务数据按类别保留且清理不会破坏历史身份、Alert、Incident 或审计引用。
- 失败可见并告警。

## 明确非目标
不实现 WAL/PITR、集群复制、跨机房灾备或生产目标采购。

## 风险与回滚
风险：脚本成功但文件不可恢复；每次校验并由 T056 做空白恢复。

回滚：停止计划任务，保留已有备份和运行记录；恢复上一脚本版本。

## 后续 Ticket
- [T056](T056-blank-host-disaster-recovery.md)
- [T057](T057-self-monitoring-degradation-external-check.md)
