# T008：配置加载、Secret 边界与内部服务认证

## 状态
READY

## 目标
为 API、Worker、Go、PostgreSQL、VictoriaMetrics 和 vmalert 建立可验证且不泄密的配置边界。

## 背景
后续认证和采集需要 Secret，但真实值不能进入 Git、合同、日志或普通错误。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-SEC-002
- MVP-SEC-003
- MVP-SEC-004
- MVP-ARC-016
- [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)

## 前置依赖
- [T007](T007-platform-observability-health-baseline.md)

## 允许修改范围
- `apps/platform/src/config/`
- `services/collector/internal/config/`
- `deploy/secrets/README.md`
- `.env.example`
- `tests/integration/config/`

## 禁止修改范围
不得提交真实 Secret、实现 Vault/Keycloak、创建 SNMP 凭据业务模型或公网暴露内部 Ingest。

## 实施要求
- 集中校验必需配置、类型、编码和环境差异，支持环境变量/挂载 Secret 文件。
- 实现日志/错误 redaction 和配置缺失 fail-fast。
- 为 Collector 与 vmalert 内部接口建立可轮换服务身份认证。
- 文档化开发占位 Secret 与生产注入边界。

## 数据库与迁移影响
无业务迁移；服务凭据不得明文入库。

## 安全影响
高影响；覆盖 Secret 生命周期、轮换边界和内部网络认证。

## 可观测性要求
记录配置加载成功类别和认证失败计数，不记录值。

## 测试要求
- 缺失/错误配置、CRLF Secret、轮换和日志泄露测试。
- 未认证内部请求被拒绝。

## 验收命令
- `npm run test --workspace apps/platform -- config`
- `npm run test:integration --workspace apps/platform -- service-auth`
- `go test ./services/collector/... -run Config`
- `npm run verify`

## 完成定义
- 所有进程使用同一约定加载配置。
- 内部接口默认拒绝未认证请求。
- 日志扫描无 Secret。

## 明确非目标
不实现用户认证、SNMP Credential 或生产密钥管理系统。

## 风险与回滚
风险：错误 redaction 可能漏值；以固定 canary Secret 做日志扫描。

回滚：回退配置适配器并撤销测试凭据；无数据迁移。

## 后续 Ticket
- [T009](T009-runtime-containers-graceful-lifecycle.md)
- [T011](T011-local-users-password-bootstrap.md)
- T025

