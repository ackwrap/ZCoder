# ZCode-plus 开发约定

## 修改边界

- 默认中文，先明确功能范围。外层不是 pnpm workspace；应用命令在 `ZCode/`（或明确指定的源码目录）根目录执行。
- `ZCode/` 是源码子模块，**日常允许直接修改源码、测试、配置及规格，完成后按目录统一导出补丁**，不再按功能追加补丁或强制新建开发 worktree。`ZCode/patches/` 是上游依赖补丁，勿与外层 `patches/` 混用。
- `patches.config.json` 的基准分支引用和固定 SHA 是导出基准；不擅自切分支、提交、推送、更新 gitlink 或改远程配置。源码 HEAD 可在基准之后，工具不替用户管理开发分支。
- 保留 staged、unstaged、untracked 内容；禁用 `reset --hard`、`clean -fd` 或强制覆盖取得干净环境。

## 开工与工作区复用

- 记录外层/子模块 Git 状态、HEAD、gitlink 和配置基准；差异先说明。基准引用漂移、HEAD 不包含固定基准或 index 有冲突时停止，不以远程最新提交自动替换基准。
- 读源码 worktree 的 `AGENTS.md`、目标目录指令及 `.agents/skills/architecture-governance/SKILL.md`；UI 另读 `DESIGN.md`。源码开工先跑 `node scripts/check-workspace-freshness.mjs`、`pnpm architecture:check --changed`；失败不自动 merge/rebase。
- 有 `.codegraph/` 才先用 CodeGraph，传对应 `projectPath`；无索引的 worktree 用 Read/Grep，不自行索引。
- **日常测试不还原工作区、不重放队列、不重建开发 worktree。** 复用当前源码、依赖和缓存，保持实时预览常驻；导出脚本另建唯一临时 worktree 验证队列，不修改开发目录或真实 index。

## 补丁交付

1. 先规格、再测试与实现；直接在源码目录修改，保留用户原有暂存分层。新文件无需为导出执行 `git add` 或 `git add -N`。
2. 功能验证后在外层运行 `node scripts/export-patches.mjs`；可先加 `--check`，或用 `--source <源码目录>` 指定已有开发目录。工具读取最终工作树（含暂存、未暂存和非忽略新增文件），不改真实 index。
3. 每次重建**基准到最终源码的整套目录快照**：`packages/<包>`、`apps/<应用>` 各一组，其余顶层目录及根文件分组。工具生成标准 binary/full-index diff、`series`、带 SHA-256/目标 tree 的 `manifest.json`；不手工按功能追加或改顺序。
4. 工具严格逐项 `apply --check --index`、`apply --index`，比较重放 tree；失败即停，不用 `--reject` 或跳过。成功后把旧 `patches/` 整体保留到 `.patch-backups/` 再发布。Windows 临时验证优先 `%LOCALAPPDATA%/Temp/opencode/`；其他平台使用系统临时目录下 `opencode/`。
5. 目录补丁需整套使用，Git 树一致不代替源码类型/Lint/受影响测试及 E2E。排除产物/凭据，保留新增、删除、模式与二进制；改基准须显式确认配置 SHA 并重新验证，不自动更新 gitlink。详见 `docs/patch-workflow.md`。

- 目录快照保留 Codex 浏览器/设备码登录、模型发现及来源优先级/已核实型号窗口兜底、供应商操作精简、Start Plan 设置导航隐藏、运行中的编辑/命令卡默认展开。勿恢复旧独立功能补丁；工作过程默认展开的补丁已移除。
- 上下文面板保留“模型名 · 来源”、窗口及真实压缩阈值；`/mcp`（别名 `/mcps`）提供脱敏诊断。状态刷新只读，主动连接检查复用既有链路，不另建连接或授权流程。Skills/MCP 快捷开关仅作用当前会话，不改配置/授权，不强停已执行调用。
- 导出无需撤回旧队列。启动/准备遇到 dirty 开发目录或基准之后的开发 HEAD 时不应用、不反向撤回补丁；不明版本或手工迁移冲突先备份并停止，不能用新队列覆盖当前编辑。

## 命令与验证

在源码 worktree 根目录执行；版本按 `mise.toml`（当前 Node 24.14.0、pnpm 10.33.2），用 pnpm 而非 npm。

- 首次完整初始化：`pnpm bootstrap`（含构建，非每次测试）。
- 源码验收：`pnpm architecture:check --changed`、`pnpm test:architecture`、`pnpm typecheck`、`pnpm lint`；格式检查用 `pnpm exec oxfmt --check <修改文件...>`。
- 单个根单测：`pnpm exec vitest run packages/services/test/codexDeviceLogin.test.ts`。
- CLI 另跑 `pnpm --dir apps/zcode-cli typecheck`、`pnpm --dir apps/zcode-cli lint`；根 Vitest/Lint **不覆盖 CLI**。包测试例：`pnpm --dir apps/zcode-cli/packages/adapters exec vitest run tests/model-execution.test.ts`。找不到 `turbo` 先将源码根 `node_modules/.bin` 加入 PATH。
- 定向桌面 E2E：`pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/settings/manual-review/pending/provider-codex.test.ts`。模型 replay 配置 `E2E_PROVIDER_HTTP_MODE=replay` 和 `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json`。
- Codex 浏览器 UI：`node --test packages/ui/test/browser/manual-review/pending/codex-device.test.mjs`；需 Chrome，或用 `CHROME_EXECUTABLE_PATH` 指向 Chromium。
- 不默认跑全量。`test:unit:affected` 全选时会跳过并成功退出，不等于通过；`verify:pre-push` 要求干净推送状态且不含 typecheck，不能替代补丁验收。详见 `docs/testing/pre-push-hook.md`。
- 源码须实际跑类型、Lint、受影响测试，交互变化加 E2E；报告阻塞、存量警告及未测平台，mock 不证明真实授权/调用。**只改外层文档仅查内容、路径、格式，不启动上游构建或测试。** 外层补丁工具改行为须先补规格，测顺序、失败停止、基线不符及保护已有改动。

## 预览与启动陷阱

- 开发目录用 `ZCODE_DATA_BASE_DIR=<测试数据基目录> pnpm dev:desktop:test`；沿用用户指定数据目录，不擅自换库。`dev:desktop` 默认生产环境。UI 热更新，Host watch 可能重启；CLI 改动需 `node scripts/build-desktop-agent-cli.mjs` 后重启，确保更新 `bundled-agents/`，不只 `cli/dist/`。
- dev 每次启动清理 `packages/desktop/out`，反复重启会重建。保留预览、依赖、`.turbo` 及构建缓存；冷 worktree 不代表每次测试必须全量编译。
- `./start-test.sh` 固定操作当前 `ZCode/`，复用 `node scripts/prepare-patches.mjs` 的基准/完整性检查；只对完全干净的固定基准首次应用队列。**`--check` 非只读**：仍可能恢复版本备份、下载工具、首次应用补丁、安装依赖或修改沙箱权限。
- 启动脚本默认数据在外层 `.zcode-dev-data/`；Linux 临时补桌面 `package.json` 版本，退出恢复。隔离目录缺 Electron 可用 `ELECTRON_OVERRIDE_DIST_PATH=<已有 electron/dist>`，不因此改源码或关闭沙箱。

## 保留的安全与交付约束

- 不导入闭源安装包、反编译产物或来源不明代码；再分发先核对许可证。CUA 不拉整个 `trycua/cua` 子模块，优先固定官方运行时并校验 SHA-256；驱动仅观察/执行，会话、权限、停止归 ZCode。三端及 X11/Wayland 分别验证；桌面控制须授权，不记凭据/隐私。
- 不处理 CTF/靶场破解、越狱、提示词注入或绕过权限/安全围栏；不提供未授权凭据获取、规避检测、隐藏持久化或攻击第三方的实现。安全改动仅限明确授权的防御、审计、修复与合规验证，不以调试为由移除审批、沙箱、鉴权、限流或凭据保护；边界不明先问，疑似越权即停。
- 交付列出外层文件、补丁顺序/基线、行为、实际检查及未完成项；核对 `ZCode/` 与开工状态，说明经授权的工作区变化。
