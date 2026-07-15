# MVP Implementation Roadmap

状态：T001～T009 已完成，T010 已就绪

## 权威来源

- [MVP 统一规格](../specs/MVP-SPEC.md)
- [MVP 功能验收](../specs/mvp-acceptance.md)
- [MVP-S1 容量验收](../specs/mvp-s1-capacity-acceptance.md)
- [决策收敛](../product/decision-closure.md)
- [领域模型](../domain/DOMAIN-MODEL.md)
- [架构与 ADR](../architecture/)

## 拆分结果

- 11 个 Epic/实施阶段（Phase 0～10）。
- 60 张稳定编号 Ticket。
- T001～T009 为 DONE；T010 是当前唯一 READY Ticket；其余 Ticket 保持 PLANNED。
- 数字顺序是合法拓扑顺序；部分同阶段 Ticket 可在共同前置完成后并行。
- 非目标只作为范围守卫映射到验收 Ticket，不生成实现 Ticket。

## Phase 0：工程基线

| Ticket | 交付 | 前置 | 状态 | 并行性 |
| --- | --- | --- | --- | --- |
| [T001](T001-cross-platform-monorepo-quality-baseline.md) | 跨平台 Monorepo 与质量基线 | 无 | DONE | 按依赖 |
| [T002](T002-minimal-runtime-skeletons.md) | 最小运行骨架 | T001 | DONE | 按依赖 |

## Phase 1：运行基础设施

| Ticket | 交付 | 前置 | 状态 | 并行性 |
| --- | --- | --- | --- | --- |
| [T003](T003-local-compose-infrastructure.md) | 本地 Compose 基础设施 | T002 | DONE | 可与同前置项并行 |
| [T004](T004-postgres-migration-data-access-baseline.md) | 迁移与数据库访问基线 | T003 | DONE | 按依赖 |
| [T005](T005-shared-contracts-error-model.md) | 共享协议与生成防漂移 | T002 | DONE | 可与同前置项并行 |
| [T006](T006-postgres-reliable-work-tracer.md) | PostgreSQL 可靠工作纵切 | T004, T005 | DONE | 按依赖 |
| [T007](T007-platform-observability-health-baseline.md) | 平台可观测性基线 | T003, T006 | DONE | 按依赖 |
| [T008](T008-configuration-secrets-service-auth.md) | 配置、Secret 与服务认证 | T007 | DONE | 按依赖 |
| [T009](T009-runtime-containers-graceful-lifecycle.md) | 运行容器与优雅生命周期 | T007, T008 | DONE | 按依赖 |

## Phase 2：身份和平台安全

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T010](T010-append-only-audit-foundation.md) | 追加式审计基础 | T006, T008 | 按依赖 |
| [T011](T011-local-users-password-bootstrap.md) | 本地用户、密码与初始化 | T010 | 按依赖 |
| [T012](T012-permission-rbac-enforcement.md) | 权限集合与 RBAC | T011 | 按依赖 |
| [T013](T013-postgres-opaque-session-login.md) | PostgreSQL 不透明会话 | T012 | 按依赖 |
| [T014](T014-csrf-session-sse-lifecycle.md) | CSRF 与会话/SSE 生命周期 | T013 | 可与同前置项并行 |
| [T015](T015-totp-enrollment-login.md) | TOTP 注册与登录 | T013 | 可与同前置项并行 |
| [T016](T016-mfa-recovery-step-up-break-glass.md) | MFA 恢复与 break-glass | T015 | 按依赖 |
| [T017](T017-authentication-security-acceptance.md) | 认证安全验收 | T009, T014, T016 | 按依赖 |

## Phase 3：资产与拓扑权威数据

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T018](T018-location-hierarchy-desired-state.md) | 资产层级期望状态 | T010, T012, T014 | 按依赖 |
| [T019](T019-managed-device-central-collector.md) | 设备与 central-default | T018 | 按依赖 |
| [T020](T020-device-instance-matching-replacement.md) | 硬件实例与替换 | T019 | 按依赖 |
| [T021](T021-managed-interface-identity.md) | 接口身份 | T020 | 按依赖 |
| [T022](T022-circuits-business-topology-desired.md) | 线路与业务拓扑期望 | T021 | 按依赖 |
| [T023](T023-controlled-csv-import.md) | 受控 CSV 导入 | T010, T019 | 按依赖 |
| [T024](T024-topology-differences-candidate-confirmation.md) | 拓扑差异与候选确认 | T021, T022, T023 | 按依赖 |

## Phase 4：采集纵向切片

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T025](T025-collector-task-result-contracts.md) | Collector 任务/结果合同 | T005, T008, T017, T019 | 按依赖 |
| [T026](T026-simulated-observation-fact-slice.md) | 模拟 Observation 纵切 | T006, T025 | 按依赖 |
| [T027](T027-snmpv2c-interface-polling.md) | SNMPv2c 接口采集 | T025, T026 | 可与同前置项并行 |
| [T028](T028-snmpv3-secure-polling.md) | SNMPv3 安全采集 | T016, T027 | 按依赖 |
| [T029](T029-snmp-interface-discovery-candidates.md) | 接口发现与身份候选 | T021, T024, T027 | 按依赖 |
| [T030](T030-inventory-metrics-scheduler-policy.md) | 库存指标与调度策略 | T027, T028 | 按依赖 |

## Phase 5：主动探测和 Trap

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T031](T031-tcp-icmp-active-probes.md) | TCP/ICMP 探测 | T025, T026 | 可与同前置项并行 |
| [T032](T032-http-dns-active-probes.md) | HTTP/DNS 探测 | T031 | 按依赖 |
| [T033](T033-snmp-trap-normalization-confirmation.md) | Trap 规范化与确认 | T025, T029 | 按依赖 |
| [T034](T034-freshness-source-availability.md) | 新鲜度与来源可用性 | T007, T026, T030, T032, T033 | 按依赖 |

## Phase 6：Condition、Health 和 Alert

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T035](T035-condition-definition-direct-evaluation.md) | Condition 与直接事实执行 | T026, T032, T034 | 按依赖 |
| [T036](T036-vmalert-condition-publication.md) | vmalert Condition 发布 | T003, T008, T035 | 按依赖 |
| [T037](T037-metric-condition-ingest-reconciliation.md) | Metric Condition 推送对账 | T006, T036 | 按依赖 |
| [T038](T038-current-health-policy-transitions.md) | Current Health 与转换 | T035, T037 | 按依赖 |
| [T039](T039-health-aggregation-freshness-hysteresis.md) | 健康聚合与迟滞 | T022, T034, T038 | 按依赖 |
| [T040](T040-alert-rule-fingerprint-episodes.md) | Alert Episode | T010, T035, T037 | 按依赖 |
| [T041](T041-alert-suppression-maintenance-notification.md) | 抑制、维护与通知投递 | T006, T022, T040 | 按依赖 |
| [T042](T042-condition-health-alert-integration.md) | Condition/Health/Alert 验收 | T039, T040, T041 | 按依赖 |

## Phase 7：Incident 和运维闭环

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T043](T043-incident-lifecycle-timeline.md) | Incident 生命周期 | T010, T041 | 按依赖 |
| [T044](T044-incident-alert-impact-links.md) | Incident 关联与影响快照 | T022, T039, T042, T043 | 按依赖 |
| [T045](T045-incident-close-reopen-correlation.md) | Incident 关闭与重开 | T044 | 按依赖 |
| [T046](T046-alert-incident-operations-api-acceptance.md) | 运维 API 验收 | T017, T045 | 按依赖 |

## Phase 8：运维拓扑与界面

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T047](T047-operator-shell-asset-search.md) | 运维外壳与资产搜索 | T017, T024, T029 | 按依赖 |
| [T048](T048-layered-topology-layout-candidates-ui.md) | 分层拓扑与候选 UI | T024, T029, T039, T047 | 按依赖 |
| [T049](T049-device-circuit-health-metrics-details.md) | 对象健康指标详情 | T027, T032, T039, T047 | 按依赖 |
| [T050](T050-alert-incident-operations-ui.md) | Alert/Incident UI | T046, T047 | 按依赖 |
| [T051](T051-authorized-sse-stale-client-state.md) | 授权 SSE 与陈旧状态 | T014, T048, T049, T050 | 按依赖 |

## Phase 9：领导大屏

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T052](T052-executive-aggregate-api.md) | 领导聚合 API | T039, T045, T048, T051 | 按依赖 |
| [T053](T053-executive-dashboard-ui.md) | 领导大屏 UI | T048, T049, T052 | 按依赖 |
| [T054](T054-executive-session-security-acceptance.md) | 领导大屏安全验收 | T050, T051, T053 | 按依赖 |

## Phase 10：运行、恢复和容量

| Ticket | 交付 | 前置 | 并行性 |
| --- | --- | --- | --- |
| [T055](T055-off-host-backup-automation.md) | 主机外备份与数据保留 | T007, T009, T016 | 按依赖 |
| [T056](T056-blank-host-disaster-recovery.md) | 空白主机恢复 | T046, T054, T055 | 按依赖 |
| [T057](T057-self-monitoring-degradation-external-check.md) | 自监控与外部检查 | T007, T034, T055 | 按依赖 |
| [T058](T058-mvp-s1-fixtures-load-tooling.md) | MVP-S1 负载工具 | T030, T032, T033, T042, T051 | 按依赖 |
| [T059](T059-mvp-s1-target-capacity-acceptance.md) | MVP-S1 目标容量验收 | T053, T057, T058 | 按依赖 |
| [T060](T060-stress-recovery-release-acceptance.md) | 压力恢复与发布验收 | T054, T056, T057, T059 | 按依赖 |

## 高风险人工审阅点

| Ticket | 审阅重点 |
| --- | --- |
| [T006](T006-postgres-reliable-work-tracer.md) | PostgreSQL 锁、租约、幂等、崩溃点和 Dead Letter |
| [T015](T015-totp-enrollment-login.md) / [T016](T016-mfa-recovery-step-up-break-glass.md) | TOTP 密钥、重放、恢复码、step-up 和 break-glass |
| [T028](T028-snmpv3-secure-polling.md) | SNMPv3 Secret 加密、轮换和 Go 内存边界 |
| [T036](T036-vmalert-condition-publication.md) / [T037](T037-metric-condition-ingest-reconciliation.md) | Condition 单一所有权、原子发布、推送与对账 |
| [T039](T039-health-aggregation-freshness-hysteresis.md) / [T042](T042-condition-health-alert-integration.md) | 健康聚合、UNKNOWN 传播、Alert/Health 无循环和风暴一致性 |
| [T055](T055-off-host-backup-automation.md) / [T056](T056-blank-host-disaster-recovery.md) | 主机外备份、数据保留、空白主机恢复和 Session 失效 |
| [T059](T059-mvp-s1-target-capacity-acceptance.md) / [T060](T060-stress-recovery-release-acceptance.md) | 容量证据、120% 降级、积压恢复和发布结论 |

## 需求覆盖矩阵

验收 Ticket 是该需求的主要可执行发布证据，不代表只有该 Ticket 可以测试该需求。

| MVP 需求编号 | 实现 Ticket | 验收 Ticket | 状态 |
| --- | --- | --- | --- |
| MVP-GEN-001 | [T001](T001-cross-platform-monorepo-quality-baseline.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-GEN-002 | [T001](T001-cross-platform-monorepo-quality-baseline.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-GEN-003 | [T001](T001-cross-platform-monorepo-quality-baseline.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-GEN-004 | [T047](T047-operator-shell-asset-search.md)<br>[T053](T053-executive-dashboard-ui.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-GEN-005 | [T027](T027-snmpv2c-interface-polling.md)<br>[T032](T032-http-dns-active-probes.md)<br>[T048](T048-layered-topology-layout-candidates-ui.md)<br>[T050](T050-alert-incident-operations-ui.md)<br>[T053](T053-executive-dashboard-ui.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-GEN-006 | [T034](T034-freshness-source-availability.md)<br>[T039](T039-health-aggregation-freshness-hysteresis.md)<br>[T057](T057-self-monitoring-degradation-external-check.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-GEN-007 | [T001](T001-cross-platform-monorepo-quality-baseline.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-GEN-008 | [T001](T001-cross-platform-monorepo-quality-baseline.md)<br>[T009](T009-runtime-containers-graceful-lifecycle.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-GEN-101 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-102 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-103 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-104 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-105 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-106 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-107 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-108 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-109 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-110 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-111 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-112 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-113 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-114 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-GEN-115 | —（范围守卫） | [T060](T060-stress-recovery-release-acceptance.md) | 非目标 |
| MVP-ARC-001 | [T001](T001-cross-platform-monorepo-quality-baseline.md)<br>[T009](T009-runtime-containers-graceful-lifecycle.md) | [T001](T001-cross-platform-monorepo-quality-baseline.md) | 已映射 |
| MVP-ARC-002 | [T003](T003-local-compose-infrastructure.md)<br>[T009](T009-runtime-containers-graceful-lifecycle.md)<br>[T056](T056-blank-host-disaster-recovery.md) | [T009](T009-runtime-containers-graceful-lifecycle.md) | 已映射 |
| MVP-ARC-003 | [T002](T002-minimal-runtime-skeletons.md)<br>[T003](T003-local-compose-infrastructure.md) | [T009](T009-runtime-containers-graceful-lifecycle.md) | 已映射 |
| MVP-ARC-004 | [T003](T003-local-compose-infrastructure.md)<br>[T004](T004-postgres-migration-data-access-baseline.md)<br>[T037](T037-metric-condition-ingest-reconciliation.md) | [T009](T009-runtime-containers-graceful-lifecycle.md) | 已映射 |
| MVP-ARC-005 | [T019](T019-managed-device-central-collector.md)<br>[T025](T025-collector-task-result-contracts.md) | [T026](T026-simulated-observation-fact-slice.md) | 已映射 |
| MVP-ARC-006 | [T002](T002-minimal-runtime-skeletons.md)<br>[T005](T005-shared-contracts-error-model.md)<br>[T025](T025-collector-task-result-contracts.md) | [T026](T026-simulated-observation-fact-slice.md) | 已映射 |
| MVP-ARC-007 | [T002](T002-minimal-runtime-skeletons.md)<br>[T009](T009-runtime-containers-graceful-lifecycle.md) | [T009](T009-runtime-containers-graceful-lifecycle.md) | 已映射 |
| MVP-ARC-008 | [T002](T002-minimal-runtime-skeletons.md)<br>[T006](T006-postgres-reliable-work-tracer.md) | [T009](T009-runtime-containers-graceful-lifecycle.md) | 已映射 |
| MVP-ARC-009 | [T002](T002-minimal-runtime-skeletons.md)<br>[T006](T006-postgres-reliable-work-tracer.md) | [T009](T009-runtime-containers-graceful-lifecycle.md) | 已映射 |
| MVP-ARC-010 | [T025](T025-collector-task-result-contracts.md)<br>[T027](T027-snmpv2c-interface-polling.md)<br>[T031](T031-tcp-icmp-active-probes.md)<br>[T033](T033-snmp-trap-normalization-confirmation.md) | [T026](T026-simulated-observation-fact-slice.md) | 已映射 |
| MVP-ARC-011 | [T005](T005-shared-contracts-error-model.md) | [T005](T005-shared-contracts-error-model.md) | 已映射 |
| MVP-ARC-012 | [T004](T004-postgres-migration-data-access-baseline.md) | [T004](T004-postgres-migration-data-access-baseline.md) | 已映射 |
| MVP-ARC-013 | [T003](T003-local-compose-infrastructure.md)<br>[T037](T037-metric-condition-ingest-reconciliation.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ARC-014 | [T036](T036-vmalert-condition-publication.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ARC-015 | [T036](T036-vmalert-condition-publication.md)<br>[T037](T037-metric-condition-ingest-reconciliation.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ARC-016 | [T037](T037-metric-condition-ingest-reconciliation.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ARC-017 | [T001](T001-cross-platform-monorepo-quality-baseline.md)<br>[T002](T002-minimal-runtime-skeletons.md) | [T001](T001-cross-platform-monorepo-quality-baseline.md) | 已映射 |
| MVP-ARC-018 | [T004](T004-postgres-migration-data-access-baseline.md)<br>[T006](T006-postgres-reliable-work-tracer.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ARC-019 | [T012](T012-permission-rbac-enforcement.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-ARC-020 | [T019](T019-managed-device-central-collector.md)<br>[T026](T026-simulated-observation-fact-slice.md)<br>[T035](T035-condition-definition-direct-evaluation.md)<br>[T038](T038-current-health-policy-transitions.md)<br>[T040](T040-alert-rule-fingerprint-episodes.md)<br>[T043](T043-incident-lifecycle-timeline.md)<br>[T052](T052-executive-aggregate-api.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ARC-021 | [T001](T001-cross-platform-monorepo-quality-baseline.md) | [T001](T001-cross-platform-monorepo-quality-baseline.md) | 已映射 |
| MVP-ARC-022 | [T001](T001-cross-platform-monorepo-quality-baseline.md) | [T001](T001-cross-platform-monorepo-quality-baseline.md) | 已映射 |
| MVP-ARC-023 | [T001](T001-cross-platform-monorepo-quality-baseline.md)<br>[T004](T004-postgres-migration-data-access-baseline.md) | [T001](T001-cross-platform-monorepo-quality-baseline.md) | 已映射 |
| MVP-AST-001 | [T018](T018-location-hierarchy-desired-state.md)<br>[T022](T022-circuits-business-topology-desired.md)<br>[T023](T023-controlled-csv-import.md)<br>[T024](T024-topology-differences-candidate-confirmation.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-002 | [T018](T018-location-hierarchy-desired-state.md)<br>[T023](T023-controlled-csv-import.md)<br>[T024](T024-topology-differences-candidate-confirmation.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-003 | [T024](T024-topology-differences-candidate-confirmation.md)<br>[T034](T034-freshness-source-availability.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-004 | [T019](T019-managed-device-central-collector.md)<br>[T022](T022-circuits-business-topology-desired.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-005 | [T020](T020-device-instance-matching-replacement.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-006 | [T019](T019-managed-device-central-collector.md)<br>[T020](T020-device-instance-matching-replacement.md)<br>[T028](T028-snmpv3-secure-polling.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-007 | [T021](T021-managed-interface-identity.md)<br>[T029](T029-snmp-interface-discovery-candidates.md) | [T029](T029-snmp-interface-discovery-candidates.md) | 已映射 |
| MVP-AST-008 | [T020](T020-device-instance-matching-replacement.md)<br>[T021](T021-managed-interface-identity.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-009 | [T023](T023-controlled-csv-import.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-010 | [T018](T018-location-hierarchy-desired-state.md)<br>[T019](T019-managed-device-central-collector.md)<br>[T022](T022-circuits-business-topology-desired.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-AST-011 | [T020](T020-device-instance-matching-replacement.md) | [T024](T024-topology-differences-candidate-confirmation.md) | 已映射 |
| MVP-COL-001 | [T027](T027-snmpv2c-interface-polling.md)<br>[T028](T028-snmpv3-secure-polling.md)<br>[T029](T029-snmp-interface-discovery-candidates.md) | [T030](T030-inventory-metrics-scheduler-policy.md) | 已映射 |
| MVP-COL-002 | [T025](T025-collector-task-result-contracts.md)<br>[T031](T031-tcp-icmp-active-probes.md)<br>[T032](T032-http-dns-active-probes.md) | [T030](T030-inventory-metrics-scheduler-policy.md) | 已映射 |
| MVP-COL-003 | [T019](T019-managed-device-central-collector.md)<br>[T025](T025-collector-task-result-contracts.md) | [T030](T030-inventory-metrics-scheduler-policy.md) | 已映射 |
| MVP-COL-004 | [T027](T027-snmpv2c-interface-polling.md)<br>[T030](T030-inventory-metrics-scheduler-policy.md)<br>[T031](T031-tcp-icmp-active-probes.md)<br>[T032](T032-http-dns-active-probes.md) | [T030](T030-inventory-metrics-scheduler-policy.md) | 已映射 |
| MVP-COL-005 | [T033](T033-snmp-trap-normalization-confirmation.md) | [T034](T034-freshness-source-availability.md) | 已映射 |
| MVP-COL-006 | [T031](T031-tcp-icmp-active-probes.md)<br>[T032](T032-http-dns-active-probes.md) | [T034](T034-freshness-source-availability.md) | 已映射 |
| MVP-COL-007 | [T007](T007-platform-observability-health-baseline.md)<br>[T026](T026-simulated-observation-fact-slice.md)<br>[T030](T030-inventory-metrics-scheduler-policy.md)<br>[T034](T034-freshness-source-availability.md)<br>[T057](T057-self-monitoring-degradation-external-check.md) | [T034](T034-freshness-source-availability.md) | 已映射 |
| MVP-OBS-001 | [T026](T026-simulated-observation-fact-slice.md)<br>[T033](T033-snmp-trap-normalization-confirmation.md) | [T034](T034-freshness-source-availability.md) | 已映射 |
| MVP-OBS-002 | [T026](T026-simulated-observation-fact-slice.md)<br>[T029](T029-snmp-interface-discovery-candidates.md)<br>[T033](T033-snmp-trap-normalization-confirmation.md) | [T034](T034-freshness-source-availability.md) | 已映射 |
| MVP-OBS-003 | [T026](T026-simulated-observation-fact-slice.md)<br>[T029](T029-snmp-interface-discovery-candidates.md) | [T034](T034-freshness-source-availability.md) | 已映射 |
| MVP-OBS-004 | [T027](T027-snmpv2c-interface-polling.md)<br>[T049](T049-device-circuit-health-metrics-details.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T034](T034-freshness-source-availability.md) | 已映射 |
| MVP-OBS-005 | [T034](T034-freshness-source-availability.md) | [T034](T034-freshness-source-availability.md) | 已映射 |
| MVP-CND-001 | [T035](T035-condition-definition-direct-evaluation.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-CND-002 | [T035](T035-condition-definition-direct-evaluation.md)<br>[T036](T036-vmalert-condition-publication.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-CND-003 | [T035](T035-condition-definition-direct-evaluation.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-CND-004 | [T035](T035-condition-definition-direct-evaluation.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-CND-005 | [T035](T035-condition-definition-direct-evaluation.md)<br>[T036](T036-vmalert-condition-publication.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-CND-006 | [T035](T035-condition-definition-direct-evaluation.md)<br>[T037](T037-metric-condition-ingest-reconciliation.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-CND-007 | [T036](T036-vmalert-condition-publication.md)<br>[T037](T037-metric-condition-ingest-reconciliation.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-CND-008 | [T037](T037-metric-condition-ingest-reconciliation.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-CND-009 | [T034](T034-freshness-source-availability.md)<br>[T037](T037-metric-condition-ingest-reconciliation.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-HLT-001 | [T038](T038-current-health-policy-transitions.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-HLT-002 | [T038](T038-current-health-policy-transitions.md)<br>[T041](T041-alert-suppression-maintenance-notification.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-HLT-003 | [T034](T034-freshness-source-availability.md)<br>[T038](T038-current-health-policy-transitions.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-HLT-004 | [T038](T038-current-health-policy-transitions.md)<br>[T049](T049-device-circuit-health-metrics-details.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-HLT-005 | [T039](T039-health-aggregation-freshness-hysteresis.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-HLT-006 | [T038](T038-current-health-policy-transitions.md)<br>[T039](T039-health-aggregation-freshness-hysteresis.md)<br>[T052](T052-executive-aggregate-api.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-HLT-007 | [T038](T038-current-health-policy-transitions.md)<br>[T039](T039-health-aggregation-freshness-hysteresis.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-HLT-008 | [T039](T039-health-aggregation-freshness-hysteresis.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-001 | [T040](T040-alert-rule-fingerprint-episodes.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-002 | [T040](T040-alert-rule-fingerprint-episodes.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-003 | [T040](T040-alert-rule-fingerprint-episodes.md)<br>[T041](T041-alert-suppression-maintenance-notification.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-004 | [T040](T040-alert-rule-fingerprint-episodes.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-005 | [T040](T040-alert-rule-fingerprint-episodes.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-006 | [T037](T037-metric-condition-ingest-reconciliation.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-007 | [T041](T041-alert-suppression-maintenance-notification.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-008 | [T033](T033-snmp-trap-normalization-confirmation.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-009 | [T041](T041-alert-suppression-maintenance-notification.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-010 | [T037](T037-metric-condition-ingest-reconciliation.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-ALT-011 | [T040](T040-alert-rule-fingerprint-episodes.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-INC-001 | [T043](T043-incident-lifecycle-timeline.md) | [T046](T046-alert-incident-operations-api-acceptance.md) | 已映射 |
| MVP-INC-002 | [T043](T043-incident-lifecycle-timeline.md) | [T046](T046-alert-incident-operations-api-acceptance.md) | 已映射 |
| MVP-INC-003 | [T044](T044-incident-alert-impact-links.md) | [T046](T046-alert-incident-operations-api-acceptance.md) | 已映射 |
| MVP-INC-004 | [T043](T043-incident-lifecycle-timeline.md)<br>[T044](T044-incident-alert-impact-links.md) | [T046](T046-alert-incident-operations-api-acceptance.md) | 已映射 |
| MVP-INC-005 | [T044](T044-incident-alert-impact-links.md)<br>[T045](T045-incident-close-reopen-correlation.md) | [T046](T046-alert-incident-operations-api-acceptance.md) | 已映射 |
| MVP-INC-006 | [T045](T045-incident-close-reopen-correlation.md) | [T046](T046-alert-incident-operations-api-acceptance.md) | 已映射 |
| MVP-INC-007 | [T045](T045-incident-close-reopen-correlation.md) | [T046](T046-alert-incident-operations-api-acceptance.md) | 已映射 |
| MVP-INC-008 | [T045](T045-incident-close-reopen-correlation.md) | [T046](T046-alert-incident-operations-api-acceptance.md) | 已映射 |
| MVP-TOP-001 | [T022](T022-circuits-business-topology-desired.md)<br>[T048](T048-layered-topology-layout-candidates-ui.md) | [T048](T048-layered-topology-layout-candidates-ui.md) | 已映射 |
| MVP-TOP-002 | [T022](T022-circuits-business-topology-desired.md)<br>[T044](T044-incident-alert-impact-links.md) | [T048](T048-layered-topology-layout-candidates-ui.md) | 已映射 |
| MVP-TOP-003 | [T024](T024-topology-differences-candidate-confirmation.md)<br>[T048](T048-layered-topology-layout-candidates-ui.md) | [T048](T048-layered-topology-layout-candidates-ui.md) | 已映射 |
| MVP-TOP-004 | [T024](T024-topology-differences-candidate-confirmation.md)<br>[T048](T048-layered-topology-layout-candidates-ui.md) | [T048](T048-layered-topology-layout-candidates-ui.md) | 已映射 |
| MVP-TOP-005 | [T048](T048-layered-topology-layout-candidates-ui.md) | [T048](T048-layered-topology-layout-candidates-ui.md) | 已映射 |
| MVP-TOP-006 | [T022](T022-circuits-business-topology-desired.md)<br>[T048](T048-layered-topology-layout-candidates-ui.md) | [T048](T048-layered-topology-layout-candidates-ui.md) | 已映射 |
| MVP-UIE-001 | [T053](T053-executive-dashboard-ui.md)<br>[T054](T054-executive-session-security-acceptance.md) | [T054](T054-executive-session-security-acceptance.md) | 已映射 |
| MVP-UIE-002 | [T052](T052-executive-aggregate-api.md)<br>[T053](T053-executive-dashboard-ui.md) | [T054](T054-executive-session-security-acceptance.md) | 已映射 |
| MVP-UIE-003 | [T052](T052-executive-aggregate-api.md)<br>[T054](T054-executive-session-security-acceptance.md) | [T054](T054-executive-session-security-acceptance.md) | 已映射 |
| MVP-UIE-004 | [T053](T053-executive-dashboard-ui.md)<br>[T054](T054-executive-session-security-acceptance.md) | [T054](T054-executive-session-security-acceptance.md) | 已映射 |
| MVP-UIE-005 | [T039](T039-health-aggregation-freshness-hysteresis.md)<br>[T052](T052-executive-aggregate-api.md)<br>[T053](T053-executive-dashboard-ui.md) | [T054](T054-executive-session-security-acceptance.md) | 已映射 |
| MVP-UIE-006 | [T051](T051-authorized-sse-stale-client-state.md)<br>[T054](T054-executive-session-security-acceptance.md) | [T054](T054-executive-session-security-acceptance.md) | 已映射 |
| MVP-UIO-001 | [T018](T018-location-hierarchy-desired-state.md)<br>[T019](T019-managed-device-central-collector.md)<br>[T024](T024-topology-differences-candidate-confirmation.md)<br>[T047](T047-operator-shell-asset-search.md) | [T051](T051-authorized-sse-stale-client-state.md) | 已映射 |
| MVP-UIO-002 | [T046](T046-alert-incident-operations-api-acceptance.md)<br>[T050](T050-alert-incident-operations-ui.md) | [T051](T051-authorized-sse-stale-client-state.md) | 已映射 |
| MVP-UIO-003 | [T046](T046-alert-incident-operations-api-acceptance.md)<br>[T050](T050-alert-incident-operations-ui.md) | [T051](T051-authorized-sse-stale-client-state.md) | 已映射 |
| MVP-UIO-004 | [T049](T049-device-circuit-health-metrics-details.md)<br>[T051](T051-authorized-sse-stale-client-state.md) | [T051](T051-authorized-sse-stale-client-state.md) | 已映射 |
| MVP-UIO-005 | [T012](T012-permission-rbac-enforcement.md)<br>[T047](T047-operator-shell-asset-search.md)<br>[T050](T050-alert-incident-operations-ui.md) | [T051](T051-authorized-sse-stale-client-state.md) | 已映射 |
| MVP-AUT-001 | [T011](T011-local-users-password-bootstrap.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-002 | [T011](T011-local-users-password-bootstrap.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-003 | [T012](T012-permission-rbac-enforcement.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-004 | [T011](T011-local-users-password-bootstrap.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-005 | [T011](T011-local-users-password-bootstrap.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-006 | [T015](T015-totp-enrollment-login.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-007 | [T015](T015-totp-enrollment-login.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-008 | [T015](T015-totp-enrollment-login.md)<br>[T016](T016-mfa-recovery-step-up-break-glass.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-009 | [T013](T013-postgres-opaque-session-login.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-010 | [T013](T013-postgres-opaque-session-login.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-011 | [T013](T013-postgres-opaque-session-login.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-012 | [T014](T014-csrf-session-sse-lifecycle.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-013 | [T014](T014-csrf-session-sse-lifecycle.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-014 | [T013](T013-postgres-opaque-session-login.md)<br>[T017](T017-authentication-security-acceptance.md)<br>[T056](T056-blank-host-disaster-recovery.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-015 | [T016](T016-mfa-recovery-step-up-break-glass.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-016 | [T015](T015-totp-enrollment-login.md)<br>[T016](T016-mfa-recovery-step-up-break-glass.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-017 | [T011](T011-local-users-password-bootstrap.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-AUT-018 | [T015](T015-totp-enrollment-login.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-SEC-001 | [T010](T010-append-only-audit-foundation.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-SEC-002 | [T010](T010-append-only-audit-foundation.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-SEC-003 | [T008](T008-configuration-secrets-service-auth.md)<br>[T028](T028-snmpv3-secure-polling.md)<br>[T055](T055-off-host-backup-automation.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-SEC-004 | [T008](T008-configuration-secrets-service-auth.md)<br>[T025](T025-collector-task-result-contracts.md)<br>[T037](T037-metric-condition-ingest-reconciliation.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-SEC-005 | [T015](T015-totp-enrollment-login.md)<br>[T057](T057-self-monitoring-degradation-external-check.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-SEC-006 | [T016](T016-mfa-recovery-step-up-break-glass.md)<br>[T056](T056-blank-host-disaster-recovery.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-SEC-007 | [T012](T012-permission-rbac-enforcement.md)<br>[T016](T016-mfa-recovery-step-up-break-glass.md)<br>[T017](T017-authentication-security-acceptance.md) | [T017](T017-authentication-security-acceptance.md) | 已映射 |
| MVP-JOB-001 | [T006](T006-postgres-reliable-work-tracer.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-002 | [T006](T006-postgres-reliable-work-tracer.md)<br>[T026](T026-simulated-observation-fact-slice.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-003 | [T006](T006-postgres-reliable-work-tracer.md)<br>[T024](T024-topology-differences-candidate-confirmation.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-004 | [T006](T006-postgres-reliable-work-tracer.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-005 | [T006](T006-postgres-reliable-work-tracer.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-006 | [T006](T006-postgres-reliable-work-tracer.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-007 | [T006](T006-postgres-reliable-work-tracer.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-008 | [T006](T006-postgres-reliable-work-tracer.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-009 | [T007](T007-platform-observability-health-baseline.md)<br>[T042](T042-condition-health-alert-integration.md) | [T042](T042-condition-health-alert-integration.md) | 已映射 |
| MVP-JOB-010 | [T051](T051-authorized-sse-stale-client-state.md) | [T051](T051-authorized-sse-stale-client-state.md) | 已映射 |
| MVP-OPS-001 | [T009](T009-runtime-containers-graceful-lifecycle.md)<br>[T056](T056-blank-host-disaster-recovery.md) | [T056](T056-blank-host-disaster-recovery.md) | 已映射 |
| MVP-OPS-002 | [T055](T055-off-host-backup-automation.md)<br>[T056](T056-blank-host-disaster-recovery.md) | [T056](T056-blank-host-disaster-recovery.md) | 已映射 |
| MVP-OPS-003 | [T055](T055-off-host-backup-automation.md) | [T056](T056-blank-host-disaster-recovery.md) | 已映射 |
| MVP-OPS-004 | [T055](T055-off-host-backup-automation.md) | [T056](T056-blank-host-disaster-recovery.md) | 已映射 |
| MVP-OPS-005 | [T055](T055-off-host-backup-automation.md) | [T056](T056-blank-host-disaster-recovery.md) | 已映射 |
| MVP-OPS-006 | [T055](T055-off-host-backup-automation.md) | [T056](T056-blank-host-disaster-recovery.md) | 已映射 |
| MVP-OPS-007 | [T056](T056-blank-host-disaster-recovery.md) | [T056](T056-blank-host-disaster-recovery.md) | 已映射 |
| MVP-OPS-008 | [T057](T057-self-monitoring-degradation-external-check.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-OPS-009 | [T009](T009-runtime-containers-graceful-lifecycle.md)<br>[T057](T057-self-monitoring-degradation-external-check.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-OPS-010 | [T007](T007-platform-observability-health-baseline.md)<br>[T057](T057-self-monitoring-degradation-external-check.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-OPS-011 | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-OPS-012 | [T007](T007-platform-observability-health-baseline.md)<br>[T034](T034-freshness-source-availability.md)<br>[T057](T057-self-monitoring-degradation-external-check.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-OPS-013 | [T034](T034-freshness-source-availability.md)<br>[T057](T057-self-monitoring-degradation-external-check.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-OPS-014 | [T055](T055-off-host-backup-automation.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-OPS-015 | [T055](T055-off-host-backup-automation.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-OPS-016 | [T055](T055-off-host-backup-automation.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T057](T057-self-monitoring-degradation-external-check.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-001 | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-002 | [T058](T058-mvp-s1-fixtures-load-tooling.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-003 | [T030](T030-inventory-metrics-scheduler-policy.md)<br>[T058](T058-mvp-s1-fixtures-load-tooling.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-004 | [T027](T027-snmpv2c-interface-polling.md)<br>[T049](T049-device-circuit-health-metrics-details.md)<br>[T058](T058-mvp-s1-fixtures-load-tooling.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-005 | [T058](T058-mvp-s1-fixtures-load-tooling.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-006 | [T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-007 | [T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-008 | [T048](T048-layered-topology-layout-candidates-ui.md)<br>[T053](T053-executive-dashboard-ui.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-009 | [T042](T042-condition-health-alert-integration.md)<br>[T058](T058-mvp-s1-fixtures-load-tooling.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-010 | [T060](T060-stress-recovery-release-acceptance.md) | [T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-011 | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-012 | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |
| MVP-PER-013 | [T031](T031-tcp-icmp-active-probes.md)<br>[T032](T032-http-dns-active-probes.md)<br>[T058](T058-mvp-s1-fixtures-load-tooling.md)<br>[T059](T059-mvp-s1-target-capacity-acceptance.md) | [T059](T059-mvp-s1-target-capacity-acceptance.md)<br>[T060](T060-stress-recovery-release-acceptance.md) | 已映射 |

## 首个执行项

当前首个可执行项是 [T010：追加式审计与请求关联基础](T010-append-only-audit-foundation.md)。T001～T009 已为 DONE，T010 的全部前置依赖均已完成，因此 T010 是当前唯一 READY Ticket。
