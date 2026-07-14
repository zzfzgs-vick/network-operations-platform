# T005：共享协议、错误模型与生成物防漂移

## 状态

READY

## 目标

建立跨 Web、NestJS 和 Go 的最小权威合同与生成检查。

## 背景

进程和语言边界只能共享序列化协议，不得共享领域实现或手写重复 DTO。

## 对应规格

- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-ARC-006
- MVP-ARC-011
- MVP-ARC-017
- [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md)
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖

- [T002](T002-minimal-runtime-skeletons.md)

## 允许修改范围

- `package.json`
- `package-lock.json`
- `packages/contracts/`
- `tests/contract/`
- `scripts/contracts-*`
- `apps/web/ 与 apps/platform/ 的合同接线点`
- `services/collector/ 的生成客户端接线点`
- `deploy/docker/platform.Dockerfile`
- `deploy/docker/web.Dockerfile`
- `.dockerignore`

根级清单和锁文件仅用于暴露 T005 契约命令、登记唯一 contracts workspace，
并保证 `npm ci` 可复现；不授权无关依赖升级。
两个 Dockerfile 仅用于按缓存分层复制 contracts workspace 清单和已提交生成物，
不授权修改 Compose、镜像版本、端口、健康检查或运行命令。
根 `.dockerignore` 仅用于排除本地状态、构建产物和 Secret，确保共享契约镜像的
构建上下文安全且可重复；不得排除应用源码、契约权威源或已提交生成物。

## 禁止修改范围

不得定义业务全量 API、领域实体、凭据字段或手写第二套生成类型。

## 实施要求

- 定义最小 public health/error/correlation envelope 和 internal batch/idempotency envelope。
- 生成并提交 TypeScript 与 Go 类型；运行时边界继续做输入校验。
- 统一错误分类、UTC 时间、协议版本、batchId/itemId 和 correlationId。
- CI 重新生成并在 diff 时失败。

## 数据库与迁移影响

无。

## 安全影响

合同禁止密码、Token、TOTP、SNMP Secret、完整 Trap 和无界错误文本。

## 可观测性要求

错误 envelope 保留安全分类和 correlationId。

## 测试要求

- OpenAPI/JSON Schema 验证。
- TypeScript/Go 生成物兼容和防漂移测试。

## 验收命令

- `npm run contracts:generate`
- `npm run contracts:check`
- `npm run test:contract`
- `go test ./...`

## 完成定义

- 权威合同只存在一份。
- 生成物可重复且无 diff。
- 消费者仅导入生成 wire 类型。

## 明确非目标

不实现业务端点、Collector 任务或 Observation 处理。

## 风险与回滚

风险：过早定义全量合同会冻结错误模型；只定义下两个 Ticket 所需 envelope。

技术债：`vite preview` 仅作为当前 MVP 骨架和容器冒烟入口，不是最终生产静态文件服务方案；后续部署加固 Ticket 必须改用适合生产的静态文件服务，并将 Vite 恢复为仅构建期依赖。

回滚：回退合同和生成物；无数据影响。

## 后续 Ticket

- [T006](T006-postgres-reliable-work-tracer.md)
- T025
