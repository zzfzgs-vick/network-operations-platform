# Executable tickets

本目录是 MVP 的本地可执行 Issue Tracker。统一规格入口为 [MVP-SPEC](../specs/MVP-SPEC.md)，实施顺序见 [IMPLEMENTATION-ROADMAP](IMPLEMENTATION-ROADMAP.md)，阻塞边见 [DEPENDENCY-GRAPH](DEPENDENCY-GRAPH.md)。

## 状态

只使用：

- `PLANNED`
- `READY`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`
- `SUPERSEDED`

仅当前置 Ticket 全部 `DONE` 后才可把 Ticket 改为 `READY`。[T001](T001-cross-platform-monorepo-quality-baseline.md) 和 [T002](T002-minimal-runtime-skeletons.md) 已为 `DONE`；当前唯一 `READY` Ticket 是 [T003](T003-local-compose-infrastructure.md)。Ticket 编号永久保留，不复用；完成后可保持原位，确需归档时移入 `completed/`，不改变编号或文件名。

## 工作规则

- 一次只实施一张 READY Ticket，不提前带入后续范围。
- 数据库变更使用新迁移，不修改已发布迁移。
- 每张 Ticket 的允许/禁止范围、测试和验收命令是合并边界。
- 安全、错误处理、审计和可观测性随纵向切片交付，不留到最后统一补做。
- 任何新基础设施或 MVP 范围变化先回到 ADR/规格变更，不直接写进 Ticket。

## 阶段索引

- **Phase 0 工程基线**：[T001](T001-cross-platform-monorepo-quality-baseline.md)、[T002](T002-minimal-runtime-skeletons.md)
- **Phase 1 运行基础设施**：[T003](T003-local-compose-infrastructure.md)、[T004](T004-postgres-migration-data-access-baseline.md)、[T005](T005-shared-contracts-error-model.md)、[T006](T006-postgres-reliable-work-tracer.md)、[T007](T007-platform-observability-health-baseline.md)、[T008](T008-configuration-secrets-service-auth.md)、[T009](T009-runtime-containers-graceful-lifecycle.md)
- **Phase 2 身份和平台安全**：[T010](T010-append-only-audit-foundation.md)、[T011](T011-local-users-password-bootstrap.md)、[T012](T012-permission-rbac-enforcement.md)、[T013](T013-postgres-opaque-session-login.md)、[T014](T014-csrf-session-sse-lifecycle.md)、[T015](T015-totp-enrollment-login.md)、[T016](T016-mfa-recovery-step-up-break-glass.md)、[T017](T017-authentication-security-acceptance.md)
- **Phase 3 资产与拓扑权威数据**：[T018](T018-location-hierarchy-desired-state.md)、[T019](T019-managed-device-central-collector.md)、[T020](T020-device-instance-matching-replacement.md)、[T021](T021-managed-interface-identity.md)、[T022](T022-circuits-business-topology-desired.md)、[T023](T023-controlled-csv-import.md)、[T024](T024-topology-differences-candidate-confirmation.md)
- **Phase 4 采集纵向切片**：[T025](T025-collector-task-result-contracts.md)、[T026](T026-simulated-observation-fact-slice.md)、[T027](T027-snmpv2c-interface-polling.md)、[T028](T028-snmpv3-secure-polling.md)、[T029](T029-snmp-interface-discovery-candidates.md)、[T030](T030-inventory-metrics-scheduler-policy.md)
- **Phase 5 主动探测和 Trap**：[T031](T031-tcp-icmp-active-probes.md)、[T032](T032-http-dns-active-probes.md)、[T033](T033-snmp-trap-normalization-confirmation.md)、[T034](T034-freshness-source-availability.md)
- **Phase 6 Condition、Health 和 Alert**：[T035](T035-condition-definition-direct-evaluation.md)、[T036](T036-vmalert-condition-publication.md)、[T037](T037-metric-condition-ingest-reconciliation.md)、[T038](T038-current-health-policy-transitions.md)、[T039](T039-health-aggregation-freshness-hysteresis.md)、[T040](T040-alert-rule-fingerprint-episodes.md)、[T041](T041-alert-suppression-maintenance-notification.md)、[T042](T042-condition-health-alert-integration.md)
- **Phase 7 Incident 和运维闭环**：[T043](T043-incident-lifecycle-timeline.md)、[T044](T044-incident-alert-impact-links.md)、[T045](T045-incident-close-reopen-correlation.md)、[T046](T046-alert-incident-operations-api-acceptance.md)
- **Phase 8 运维拓扑与界面**：[T047](T047-operator-shell-asset-search.md)、[T048](T048-layered-topology-layout-candidates-ui.md)、[T049](T049-device-circuit-health-metrics-details.md)、[T050](T050-alert-incident-operations-ui.md)、[T051](T051-authorized-sse-stale-client-state.md)
- **Phase 9 领导大屏**：[T052](T052-executive-aggregate-api.md)、[T053](T053-executive-dashboard-ui.md)、[T054](T054-executive-session-security-acceptance.md)
- **Phase 10 运行、恢复和容量**：[T055](T055-off-host-backup-automation.md)、[T056](T056-blank-host-disaster-recovery.md)、[T057](T057-self-monitoring-degradation-external-check.md)、[T058](T058-mvp-s1-fixtures-load-tooling.md)、[T059](T059-mvp-s1-target-capacity-acceptance.md)、[T060](T060-stress-recovery-release-acceptance.md)

## 文档

- [Ticket 模板](TICKET-TEMPLATE.md)
- [实施 Roadmap 与 186 项覆盖矩阵](IMPLEMENTATION-ROADMAP.md)
- [Ticket 依赖图](DEPENDENCY-GRAPH.md)
