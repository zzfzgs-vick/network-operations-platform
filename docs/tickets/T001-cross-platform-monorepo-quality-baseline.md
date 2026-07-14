# T001：跨平台 Monorepo 与质量基线

## 状态
DONE

## 完成记录

- Windows 本地验收：通过。
- Ubuntu GitHub Actions CI：通过（用户确认）。
- 对应 Git Commit：`5e35a6a60fdf671b647a78cc04fa805847e04b71`。
- CI 可识别信息：GitHub Actions workflow `quality`，matrix job `ubuntu-24.04`，对应上述 Git Commit；当前未提供 Run ID 或运行 URL。

## 目标
建立不含业务功能的原生 npm workspace、单一 Go 模块和 Windows/Ubuntu 一致质量入口。

## 背景
后续所有 Ticket 都依赖可重复的 install、lint、format-check、typecheck、test、build 基线；T001 只证明仓库可构建。

## 对应规格
- [MVP 统一规格](../specs/MVP-SPEC.md)
- MVP-GEN-001
- MVP-GEN-002
- MVP-GEN-003
- MVP-GEN-007
- MVP-GEN-008
- MVP-ARC-001
- MVP-ARC-017
- MVP-ARC-021
- MVP-ARC-022
- MVP-ARC-023
- [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md)

## 前置依赖
- 无

## 允许修改范围
- `根目录 workspace、锁文件、TypeScript/Go 版本配置`
- `scripts/、.github/workflows/、.editorconfig、.gitattributes、.gitignore`
- `根 README 的开发命令说明`

## 禁止修改范围
不得创建业务模块、数据库表、Compose、登录、采集、Condition、Health、Alert、Incident 或页面。

## 实施要求
- 使用原生 npm workspaces、一个根 package-lock.json 和一个根 Go module；不引入 Nx/Turbo/Lerna。
- 固定 Node.js 24 LTS、TypeScript strict、当前稳定 Go，并提供 PowerShell 与 POSIX Shell 验证入口。
- 提供 lint、format-check、typecheck、test、build、verify 根命令和最小 Windows/Ubuntu CI。
- 记录依赖锁定、升级和安全审查策略，不预装业务依赖。

## 数据库与迁移影响
无。

## 安全影响
仅涉及依赖锁定与 CI 供应链基线；不得保存任何 Secret。

## 可观测性要求
无运行时可观测性影响。

## 测试要求
- 验证空仓库级命令在 Windows PowerShell 可运行。
- CI 同时验证 Ubuntu 构建入口与行尾规则。

## 验收命令
- `npm ci`
- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `pwsh -File scripts/verify.ps1`

## 完成定义
- 所有根命令退出码为 0。
- Windows 和 Ubuntu CI 均通过。
- 仓库仍无业务功能和运行基础设施。

## 明确非目标
不创建 React/NestJS/Go 可执行入口；不执行 T002 及以后内容。

## 风险与回滚
风险：工具链选择过多会制造维护负担；只引入完成六个质量命令所需的最小依赖。

回滚：回退新增根配置、脚本和 CI 文件即可；无数据迁移。

## 后续 Ticket
- [T002](T002-minimal-runtime-skeletons.md)

