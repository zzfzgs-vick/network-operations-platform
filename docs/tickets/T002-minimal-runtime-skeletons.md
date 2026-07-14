# T002：React、NestJS API/Worker 与 Go 最小运行骨架

## 状态
READY

## 目标
让四个运行入口独立构建、启动、报告版本并优雅停止，不包含业务能力。

## 背景
代码库设计要求一个 React SPA、一个 NestJS 包的 API/Worker 双入口及一个 Go Collector 二进制。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-003
- MVP-ARC-006
- MVP-ARC-007
- MVP-ARC-008
- MVP-ARC-009
- MVP-ARC-010
- MVP-ARC-017
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- [T001](T001-cross-platform-monorepo-quality-baseline.md)

## 允许修改范围
- `apps/web/`
- `apps/platform/`
- `services/collector/`
- `scripts/smoke-runtimes.*`

## 禁止修改范围
不得添加数据库访问、认证、SNMP、探测、业务模块或后台业务循环。

## 实施要求
- 创建 React+TypeScript+Vite 最小页面。
- 创建 apps/platform/src/main.ts HTTP 入口和 worker.ts Standalone Application Context；Worker 不监听端口。
- 创建一个 Go Collector main，支持版本输出、启动和终止信号。
- 为各入口添加最小启动/关闭测试，保持同一 NestJS 构建产物双命令。

## 数据库与迁移影响
无。

## 安全影响
仅暴露无敏感信息的版本/存活响应。

## 可观测性要求
记录进程启动、版本和优雅关闭事件。

## 测试要求
- 单元/进程测试证明 API 有监听、Worker 无 HTTP Listener。
- Go 进程收到终止信号后干净退出。

## 验收命令
- `npm run build --workspaces`
- `npm run test --workspace apps/platform`
- `npm run test --workspace apps/web`
- `go test ./...`
- `pwsh -File scripts/smoke-runtimes.ps1`

## 完成定义
- 四个入口可独立构建和验证。
- API 与 Worker 使用独立组合根。
- 无业务功能进入骨架。

## 明确非目标
不创建 Compose、数据库、协议合同或健康业务模型。

## 风险与回滚
风险：共享 AppModule 可能意外启动两类行为；用独立组合根测试防止。

回滚：删除新增应用入口和 workspace 包，不影响数据。

## 后续 Ticket
- [T003](T003-local-compose-infrastructure.md)
- [T005](T005-shared-contracts-error-model.md)

