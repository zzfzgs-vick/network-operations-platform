# T059：MVP-S1 目标负载容量验收与报告

## 状态
PLANNED

## 目标
在参考 Ubuntu 主机执行2小时预热+8小时目标负载并验证全部性能/资源目标。

## 背景
500设备不是代码限制，支持声明只对已记录软件、硬件、周期和保留模型成立。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-OBS-004
- MVP-OPS-016
- MVP-PER-001
- MVP-PER-002
- MVP-PER-003
- MVP-PER-004
- MVP-PER-005
- MVP-PER-006
- MVP-PER-007
- MVP-PER-008
- MVP-PER-009
- MVP-PER-011
- MVP-PER-012
- MVP-PER-013
- MVP-GEN-113
- [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md)

## 前置依赖
- [T053](T053-executive-dashboard-ui.md)
- [T057](T057-self-monitoring-degradation-external-check.md)
- [T058](T058-mvp-s1-fixtures-load-tooling.md)

## 允许修改范围
- `tests/capacity/`
- `docs/handoffs/ 的容量报告`
- `apps/、services/、deploy/ 的有证据性能修正`

## 禁止修改范围
不得降低已接受目标、跳过鉴权、把Windows结果当生产结果、静默缩短90天保留或把500写成硬限制。

## 实施要求
- 在16 vCPU/64GB/2TB NVMe/1Gbps Ubuntu参考主机运行目标规模。
- 执行规定采集周期、≤500k series、≤20k samples/s、50会话/5大屏和告警负载。
- 验证 API p50/p95/p99、实时传播、拓扑渲染、资源余量和任务调度偏差。
- 输出 commit/镜像/系统/硬件/数据/周期/基数/延迟/错误/资源/队列和已验证范围。

## 数据库与迁移影响
只使用隔离容量数据；任何索引修正必须新迁移并回归。

## 安全影响
负载不绕过 Session/RBAC/TOTP；测试 Secret 隔离。

## 可观测性要求
采集规格要求的全套主机、容器、DB、VM、Go、Node、SSE、浏览器指标。

## 测试要求
- 2h 预热+8h目标负载。
- API/拓扑/Health/Alert/调度/保留容量验证。

## 验收命令
- `bash tests/capacity/run.sh --profile mvp-s1-target --warmup 2h --duration 8h`
- `npm run test:capacity -- validate-target-report`
- `npm run verify`

## 完成定义
- 目标规模全部阻塞指标通过。
- 容量报告完整可复现。
- 未通过项有明确阻塞结论而非口头豁免。

## 明确非目标
不执行120%压力、不承诺S2/S3或更小主机同容量。

## 风险与回滚
风险：长测波动/环境污染；固定版本、空闲参考主机和重复失败样本。

回滚：性能修正逐项回退并重跑受影响阶段；不修改目标。

## 后续 Ticket
- [T060](T060-stress-recovery-release-acceptance.md)
