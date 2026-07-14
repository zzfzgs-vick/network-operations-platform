# T060：120% 压力、恢复观察与 MVP 发布验收

## 状态
PLANNED

## 目标
完成30分钟120%压力、1小时恢复和全规格发布门检查。

## 背景
最终验收验证降级而非扩大容量承诺，并确认所有非目标和恢复/安全边界未被破坏。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-GEN-002
- MVP-GEN-003
- MVP-OPS-008
- MVP-OPS-009
- MVP-OPS-010
- MVP-OPS-011
- MVP-OPS-012
- MVP-OPS-013
- MVP-OPS-014
- MVP-OPS-015
- MVP-OPS-016
- MVP-PER-002
- MVP-PER-003
- MVP-PER-004
- MVP-PER-005
- MVP-PER-006
- MVP-PER-007
- MVP-PER-008
- MVP-PER-009
- MVP-PER-013
- MVP-GEN-001
- MVP-GEN-004
- MVP-GEN-005
- MVP-GEN-006
- MVP-GEN-007
- MVP-GEN-008
- MVP-GEN-101
- MVP-GEN-102
- MVP-GEN-103
- MVP-GEN-104
- MVP-GEN-105
- MVP-GEN-106
- MVP-GEN-107
- MVP-GEN-108
- MVP-GEN-109
- MVP-GEN-110
- MVP-GEN-111
- MVP-GEN-112
- MVP-GEN-113
- MVP-GEN-114
- MVP-GEN-115
- MVP-PER-001
- MVP-PER-010
- MVP-PER-011
- MVP-PER-012
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)
- [ADR-0006](../architecture/adr/0006-require-totp-for-sensitive-permissions.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T054](T054-executive-session-security-acceptance.md)
- [T056](T056-blank-host-disaster-recovery.md)
- [T057](T057-self-monitoring-degradation-external-check.md)
- [T059](T059-mvp-s1-target-capacity-acceptance.md)

## 允许修改范围
- `tests/capacity/`
- `tests/e2e/`
- `tests/security/`
- `tests/recovery/`
- `docs/handoffs/ 的最终报告`
- `仅有证据的缺陷修正范围`

## 禁止修改范围
不得实现新功能、放宽规格、把压力规模宣传为支持容量、跳过失败测试或标记未实施 Ticket 为 DONE。

## 实施要求
- 运行600设备/36k接口/2.4k Probe/6k关系/60会话/6大屏30分钟。
- 验证无崩溃/OOM/损坏/身份错误合并/静默丢配置/假正常/不可恢复积压。
- 恢复正常负载后观察1小时，10分钟内积压明显下降且无需重启。
- 执行功能、安全、恢复、ADR/非目标和186需求覆盖审查，形成发布结论。

## 数据库与迁移影响
只使用隔离测试数据；不得修改已发布迁移，缺陷以新迁移修正。

## 安全影响
重跑安全套件、Secret扫描、权限和恢复后Session失效。

## 可观测性要求
记录压力/恢复全部资源、队列、错误、延迟和回落时间。

## 测试要求
- 120%压力+恢复、全E2E、安全、空白恢复证据核对。
- 依赖/镜像检查确认无禁用组件。

## 验收命令
- `bash tests/capacity/run.sh --profile mvp-s1-stress --duration 30m --recovery 1h`
- `npm run test:e2e`
- `npm run test:security`
- `npm run test:recovery`
- `npm run test:release`

## 完成定义
- 全部阻塞发布需求通过并可追踪。
- 压力后自动恢复且报告不扩大承诺。
- 最终发布报告列出版本、证据、风险和结论。

## 明确非目标
不实现任何后续版本候选能力，不执行生产上线。

## 风险与回滚
风险：最终测试发现跨域缺陷；回到拥有该领域的最早 Ticket 修复并重跑受影响门。

回滚：不发布失败构建；恢复到最近通过T059的版本并保留全部失败证据。

## 后续 Ticket
- 无
