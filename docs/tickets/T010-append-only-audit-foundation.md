# T010：追加式审计与请求关联基础

## 状态
DONE

## 完成记录

- WSL Ubuntu 24.04 本地原生 Node.js、Go、真实 PostgreSQL 18.4、审计脱敏及运行时回归验收：通过。
- GitHub Actions Ubuntu 24.04 与 Windows 验收：通过。
- 对应 Git Commit：实现 `4e53ec121adbe9e016ac11818527cb7acc054879`。
- CI 可识别信息：GitHub Actions workflow `quality`，run `29396912564`，Ubuntu job `87292393333`，Windows job `87292393364`；运行地址：<https://github.com/zzfzgs-vick/network-operations-platform/actions/runs/29396912564>。

## 目标
建立统一 actor/correlation 上下文、追加式 Audit Event 和敏感字段红线。

## 背景
身份、权限、资产确认、规则发布和恢复都依赖不可覆盖的审计基础。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-SEC-001
- MVP-SEC-002
- MVP-GEN-006
- [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md)
- [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md)
- [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md)
- [ADR-0006](../architecture/adr/0006-require-totp-for-sensitive-permissions.md)
- [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md)
- [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md)
- [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T006](T006-postgres-reliable-work-tracer.md)
- [T008](T008-configuration-secrets-service-auth.md)

## 允许修改范围
- `package.json`
- `scripts/db-test.mjs`
- `docs/tickets/T010-append-only-audit-foundation.md`
- `apps/platform/src/modules/audit/`
- `apps/platform/migrations/`
- `packages/contracts/ 的 audit-safe envelope`
- `tests/integration/audit/`
- `tests/integration/health/platform-health.test.mjs`

T010 的完成定义要求通过统一命令执行真实 PostgreSQL 审计集成测试和审计脱敏安全测试。当前根级缺少 test:security 入口，数据库测试分发器也不识别 audit 选择器，因此需要最小范围修正。

T010 新增 0004 迁移后，T007 Platform Health 集成测试中固定的 v2→v3 断言不再成立。测试应基于仓库迁移清单动态验证从 v2 升级到当前最新版本，同时保留重复执行、兼容性和校验断言。

## 禁止修改范围
不得实现具体业务审计事件、审计删除、Secret/Token/Cookie 原文记录或可覆盖时间线。

## 实施要求
- 创建不可变 AuditEvent 迁移和 append/query 接口。
- 把 userId/actorId、事件类型、时间、来源、结果、失败分类、对象和 correlationId 纳入最小模型。
- 实现统一 redaction 和受限详情结构。
- 支持业务事务内追加审计而不产生数据库/审计双写。

## 数据库与迁移影响
新增 AuditEvent 表和查询索引；只追加，提供前向修复策略。

## 安全影响
高影响；审计本身不得成为 Secret 泄露面。

## 可观测性要求
审计写入失败、延迟和拒绝字段计数。

## 测试要求
- 事务回滚时审计同步回滚。
- canary Secret/Token 不进入数据库、日志或错误。

## 验收命令
- `npm run db:migrate --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- audit`
- `npm run test:security -- audit-redaction`

## 完成定义
- 审计事件不可普通更新/删除。
- 请求关联可端到端追踪。
- 敏感字段测试通过。

## 明确非目标
不实现审计 UI、长期归档或每个业务事件。

## 风险与回滚
风险：通用 details 容易吸入敏感数据；采用白名单结构而非任意对象。

回滚：停止新写入并以新迁移前向禁用；已产生审计保留。

## 后续 Ticket
- [T011](T011-local-users-password-bootstrap.md)
- [T018](T018-location-hierarchy-desired-state.md)
