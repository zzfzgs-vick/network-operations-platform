# T032：HTTP/HTTPS 与 DNS 主动探测

## 状态
PLANNED

## 目标
在统一 ProbeTask 模型上实现 HTTP/HTTPS 和 DNS 结果与安全边界。

## 背景
业务路径监测需要应用层可用性，但不得形成通用 SSRF 或脚本执行器。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-GEN-005
- MVP-COL-002
- MVP-COL-004
- MVP-COL-006
- MVP-PER-013
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)
- [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md)

## 前置依赖
- [T031](T031-tcp-icmp-active-probes.md)

## 允许修改范围
- `services/collector/internal/probe/`
- `apps/platform/src/modules/collection/`
- `packages/contracts/`
- `tests/integration/probes/`

## 禁止修改范围
不得支持任意脚本、无限重定向、返回正文存储、Secret URL 或最终 Alert/Health。

## 实施要求
- 实现受限 HTTP 方法、TLS、状态码、响应时间、有限重定向和正文大小策略。
- 实现 DNS 记录类型、解析耗时、期望值摘要和安全 resolver 配置。
- 结果写入统一 Observation/时序标签。
- 沿用调度限流、退避和幂等。

## 数据库与迁移影响
扩展 ProbeTask 类型配置；敏感 Header 只用 Secret 引用。

## 安全影响
高影响 SSRF/DNS 边界；限制协议、地址、重定向和日志。

## 可观测性要求
按 probe_type 的耗时、结果、TLS/DNS 分类和调度延迟。

## 测试要求
- 本地目标模拟器、重定向环、私网限制策略、TLS 失败、DNS 超时测试。
- Secret Header 不泄露。

## 验收命令
- `go test ./services/collector/internal/probe/... -run 'HTTP|DNS'`
- `npm run test:security -- probe-targets`
- `npm run test:integration --workspace apps/platform -- probe-http-dns`
- `npm run verify`

## 完成定义
- 四类 ProbeTask 使用同一身份和结果边界。
- HTTP/DNS 不成为通用网络请求器。
- 结果可供 Metric Condition 使用。

## 明确非目标
不实现浏览器脚本、内容抓取、外部探针或告警。

## 风险与回滚
风险：SSRF 与敏感响应泄露；只持久化摘要/指标并严格限制目标。

回滚：停用相关任务类型并撤销 Secret 引用，保留结果。

## 后续 Ticket
- [T034](T034-freshness-source-availability.md)
- [T035](T035-condition-definition-direct-evaluation.md)
