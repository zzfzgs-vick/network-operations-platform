# T003：本地开发 Docker Compose 基础设施

## 状态
READY

## 目标
提供仅用于本地开发的 PostgreSQL、VictoriaMetrics 和 vmalert 可重复启动环境及基础镜像构建。

## 背景
MVP 运行边界依赖三项基础服务，但当前 Ticket 不生成业务规则或生产部署。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-013
- MVP-ARC-002
- MVP-ARC-003
- MVP-ARC-004
- MVP-GEN-102
- MVP-GEN-103
- MVP-GEN-104
- MVP-GEN-114
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T002](T002-minimal-runtime-skeletons.md)

## 允许修改范围
- `deploy/compose/`
- `deploy/docker/`
- `deploy/victoriametrics/`
- `deploy/vmalert/`
- `scripts/smoke-infra.*`
- `.env.example`

## 禁止修改范围
不得创建生产 Secret、业务表、vmalert 业务规则、Alertmanager、Redis、Broker、Kubernetes 或完整生产 Compose。

## 实施要求
- 创建显式命名的本地开发 Compose，固定单 PostgreSQL、单 VictoriaMetrics、单 vmalert。
- 为 Web、API、Worker、Collector 提供最小多阶段 Docker 构建定义，但不承诺生产加固完成。
- 使用健康检查和命名 volume，示例环境变量不得包含真实凭据。
- 提供启动、停止、清理和连通性 smoke 命令。

## 数据库与迁移影响
只启动空 PostgreSQL；不创建业务 Schema。

## 安全影响
示例 Secret 仅占位；真实凭据不得提交。

## 可观测性要求
Compose health 显示三个依赖服务是否可用。

## 测试要求
- Compose 配置解析测试。
- 基础服务启动后端口与健康检查通过。

## 验收命令
- `docker compose -f deploy/compose/dev.compose.yml config`
- `docker compose -f deploy/compose/dev.compose.yml up -d postgres victoriametrics vmalert`
- `pwsh -File scripts/smoke-infra.ps1`
- `docker compose -f deploy/compose/dev.compose.yml down`

## 完成定义
- 本地基础服务可重复启动和销毁。
- 未引入未批准组件。
- 业务规则目录保持空或仅含无业务健康占位。

## 明确非目标
不实现生产备份、HA、业务采集、规则 YAML 或前端功能。

## 风险与回滚
风险：Windows volume/行尾差异；smoke 必须在 Windows 与 Ubuntu CI 验证配置。

回滚：停止 Compose 并删除本 Ticket 创建的开发 volume；无业务数据。

## 后续 Ticket
- [T004](T004-postgres-migration-data-access-baseline.md)
- [T007](T007-platform-observability-health-baseline.md)
