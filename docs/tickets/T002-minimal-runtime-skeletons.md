# T002：React、NestJS API/Worker 与 Go 最小运行骨架

## 状态
DONE

## 完成记录
- Windows 本地完整验收：通过，包括根级与 Workspace format/lint/typecheck/test/build、Go test/build 和四运行入口冒烟。
- Ubuntu GitHub Actions CI：通过，包括 Workspace、Go 和真实 SIGTERM 运行入口冒烟。
- 对应 Git Commit：`966e3359ee7dcf8ff36cae2a137df658f717db31`。
- CI 可识别信息：GitHub Actions workflow `quality`，run `29310211481`，Ubuntu job `87012181720`，Windows job `87012181754`；运行地址：<https://github.com/zzfzgs-vick/network-operations-platform/actions/runs/29310211481>。

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
- `scripts/workspace-baseline.test.ts`
- `.github/workflows/ci.yml`
- `package-lock.json`
- `go.mod`

T002 引入 Node 运行骨架依赖，必须同步更新根级唯一 npm 锁文件以保证 npm ci 可复现。

新增首个 Go Package 后，go mod tidy 证明与 go directive 同版本的 toolchain directive 是冗余项，必须删除以保持 go.mod 规范化和可重复测试。

根级 Workspace 基线测试必须同步验证规范化后的 Go 1.26.5 directive，且不得继续要求冗余 toolchain directive。

现有 CI 必须执行 T002 的 Workspace、Go 和运行入口验收，避免运行骨架损坏时仍错误通过。

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
