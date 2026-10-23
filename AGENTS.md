# ZCode-plus 开发约定

## 修改边界

- 默认中文，先明确功能范围。外层是补丁仓库，不是 pnpm workspace；应用命令在源码 worktree 根目录执行。
- `ZCode/` 是上游子模块。**二开源码、测试、配置及规格只在隔离 worktree 修改，再导出到外层 `patches/`**；外层说明、工具、补丁可直接编辑。`ZCode/patches/` 是上游依赖补丁，勿混用。
- 当前 `ZCode/` 不作开发或独立验收目录；用户明确要求应用、运行或构建时才应用已验证队列。不擅自更新 gitlink、切分支、提交、推送或改远程配置。
- 保留 staged、unstaged、untracked 内容；禁用 `reset --hard`、`clean -fd` 或强制覆盖取得干净环境。

## 开工与工作区复用

- 记录外层及子模块 Git 状态；用 `git -C <外层> ls-files --stage -- ZCode` 读 gitlink，与子模块 HEAD 核对。不一致先报告，补丁不以远程最新提交为基线。
- 读源码 worktree 的 `AGENTS.md`、目标目录指令及 `.agents/skills/architecture-governance/SKILL.md`；UI 另读 `DESIGN.md`。源码开工先跑 `node scripts/check-workspace-freshness.mjs`、`pnpm architecture:check --changed`；失败不自动 merge/rebase。
- 有 `.codegraph/` 才先用 CodeGraph，传对应 `projectPath`；无索引的 worktree 用 Read/Grep，不自行索引。
- **日常测试不还原工作区、不重放队列、不重建开发 worktree。** 同基线、同队列复用开发目录、依赖和缓存，保持实时预览常驻；最终交付另用干净 worktree 重放验收，不动当前 `ZCode/`。

## 补丁交付

1. 从 gitlink 在 `/tmp/opencode/` 下建唯一 detached worktree，记录归属。严格按 `patches/series`（相对文件名，忽略空行及 `#` 注释行）重放；有补丁无清单先明确顺序。
2. 每个补丁先 `git -C <worktree> apply --check --index <补丁绝对路径>`，再 `apply --index`。失败立即报告补丁和文件，不用 `--reject` 或跳过；所有 Git 命令显式指定 worktree 的 cwd 或 `-C`。
3. 先规格、再测试与实现。以重放后的 index 为增量基准，**本次修改不暂存**；新增文件逐个 `git add -N -- <path>`，用 `git diff --binary --full-index` 导出，勿重复包含旧补丁。
4. 保存为 `patches/000N-short-description.patch` 并更新 `series`；用标准 Git diff，路径为 `a/packages/...` 而非 `a/ZCode/...`，保留新增文件、模式和二进制内容，排除依赖、产物、日志及凭据。
5. 另建同基线干净 worktree 重放整队列、验证功能；改中间补丁须复验全部后续补丁。升级上游先隔离验证，再由用户确认更新 gitlink。

- 现有 `0004` 已合并浏览器/设备码 Codex 登录，`0005` 是模型发现，`0007` 仅界面精简；勿恢复旧独立设备码 `0007`。
- 换队列勿直接叠加：备份 staged/unstaged 差异，确认所属旧版，隔离演练后按**旧补丁逆序**逐个 `apply --reverse --check` 再撤回，保留暂存分层。归属不明或冲突即停，不拿改写后的新补丁撤旧版。

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

- 开发 worktree 用 `ZCODE_DATA_BASE_DIR=<独立基目录> pnpm dev:desktop:test`；`dev:desktop` 默认生产环境。UI 热更新，Host watch 可能重启；CLI 改动需 `node scripts/build-desktop-agent-cli.mjs` 后重启，确保更新 `bundled-agents/`，不只 `cli/dist/`。
- dev 每次启动清理 `packages/desktop/out`，反复重启会重建。保留预览、依赖、`.turbo` 及构建缓存；冷 worktree 不代表每次测试必须全量编译。
- `./start-test.sh` 固定操作当前 `ZCode/`。**`--check` 非只读**：仍可能恢复版本备份、下载工具、应用补丁、安装依赖、修改沙箱权限。它不核对 gitlink，逐补丁反查不能可靠识别被后续补丁改动的版本，不作隔离开发或队列迁移入口。
- 启动脚本默认数据在外层 `.zcode-dev-data/`；Linux 临时补桌面 `package.json` 版本，退出恢复。隔离目录缺 Electron 可用 `ELECTRON_OVERRIDE_DIST_PATH=<已有 electron/dist>`，不因此改源码或关闭沙箱。

## 保留的安全与交付约束

- 不导入闭源安装包、反编译产物或来源不明代码；再分发先核对许可证。CUA 不拉整个 `trycua/cua` 子模块，优先固定官方运行时并校验 SHA-256；驱动仅观察/执行，会话、权限、停止归 ZCode。三端及 X11/Wayland 分别验证；桌面控制须授权，不记凭据/隐私。
- 不处理 CTF/靶场破解、越狱、提示词注入或绕过权限/安全围栏；不提供未授权凭据获取、规避检测、隐藏持久化或攻击第三方的实现。安全改动仅限明确授权的防御、审计、修复与合规验证，不以调试为由移除审批、沙箱、鉴权、限流或凭据保护；边界不明先问，疑似越权即停。
- 交付列出外层文件、补丁顺序/基线、行为、实际检查及未完成项；核对 `ZCode/` 与开工状态，说明经授权的工作区变化。
