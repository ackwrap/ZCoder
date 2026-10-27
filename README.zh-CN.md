# ZCoder

[English](README.md) | 简体中文

本项目是 [ZCode](https://github.com/zai-org/ZCode) 的补丁式分支。`ZCode/` 子模块始终锁定官方固定提交，
我们的所有改动都以目录补丁队列的形式存放在 `patches/`。克隆本仓库并应用整套队列即可逐字节还原工作树，
且不会改写子模块历史。

## 本分支改了什么

以下内容都是相对固定基准的目录补丁队列的一部分。它是最终工作树的完整快照，而不是按提交排列的功能列表。
撰写本文件时，队列包含 13 组目录补丁、885 条已跟踪文件差异（501 个新增文件、2 个删除）；
`patches/manifest.json` 是权威清单，这些数字会随每次导出变化。

### 供应商、账号与模型发现

- **Codex（ChatGPT 登录）供应商。** 在 OpenAI API Key 模板之外新增 Codex 模板，支持浏览器 OAuth
  和显式的设备码登录；两者都使用固定的 opencode 2.1.4 Codex 客户端身份，且不存在自动回退关系。
  供应商详情提供连接、取消、重新登录、断开连接、模型编辑和连接测试。旧 Token Sharing 凭据不会迁移，
  用户需要重新登录。
- **Codex 原生搜索。** 模型请求统一走 Codex 后端，启用原生搜索，`allowed_domains` 会被校验而不是
  被静默丢弃；Responses 返回在 `output_text.annotations` 中的 URL 引用会同时提供给流式与非流式消费方。
- **保存后自动发现模型。** Codex 登录成功，或普通供应商的 Key、协议、地址、请求头发生变化并保存后，
  会触发一次模型列表读取。UI 提供“重新获取模型”操作，以及 idle/loading/ready/error/unsupported 状态；
  切换或关闭面板不会启动第二个 Host 任务。账号型来源继续沿用原有的同步链路。
- **解析优先级与兜底。** 模型设置依次采用个人覆盖、已发现数据、已核实的 Codex 离线窗口、内置推荐，
  并标注实际使用的来源。离线窗口只是兜底；不会为未知型号伪造来源。
- **Z.AI / BigModel Start Plan** 与 Coding Plan 登录/升级流程（含内嵌 webview）；Start Plan 专属入口
  在设置导航中隐藏，供应商操作保持精简集合。
- **标题生成模型**设置（默认继承会话模型），用于会话标题和 `/rename`。

### 系统提示词与上下文

- **按模型自定义系统提示词。** 高级设置按精确的 `providerId + modelId` 保存一份自定义 Agent 提示词。
  对匹配的模型启用后，它会替换其它默认 Agent 提示词段落，只保留工具、MCP 与 Skill 说明；
  权限、审批和沙箱不受影响。不支持通配或按供应商匹配。配置属于 Host 级设置，会话级开关只存在于
  renderer，提示词在弹窗中编辑。
- **上下文来源更新通知。** Skills、Agents、MCP 工具和 instructions 目录的变化会以审计通知的形式
  投影到 V4 时间线，且只使用显式白名单中的元数据。它们不是用户消息，也不会暴露已加载的 Skill 正文、
  Agent 系统提示词或 MCP 凭据。
- **指令文件观察。** 用户级与工作区级 `AGENTS.md` 由 Node adapter 持有的租约进行观察，并在模型请求
  边界刷新；释放时只释放自己的订阅。
- **会话上下文面板。** 状态面板展示模型名与解析来源、有效上下文窗口、真实自动压缩阈值，以及用量、
  缓存命中率和输出 tokens/s。它是只读投影，不会发起连接。
- **`/mcp` 诊断**（别名 `/mcps`）打开脱敏的 MCP 状态视图和复制操作，不写入任何配置。

### 上下文压缩

- **压缩模式。** 提供 `detailed`（默认）与 `compact` 两种摘要，可按会话实时切换；compact 模式沿用
  七段续接模板，最多保留十五个相关文件。
- **按 workspace 隔离的压缩策略。** 新建与冷恢复都会读取匹配 workspace 的最新策略，因此某个
  workspace 的策略更新不会泄漏到其它 workspace。
- **桌面压缩桥。** 由单一 owner 承载握手中的目标集合、持久化策略读取与转发；物理连接仍归原来的
  Source connector 所有。
- **压缩摘要详情**复用现有时间线标记；摘要正文不会进入 transcript、模型历史、分享与导出。
- **长工具轮次**会在不拆分并行调用的情况下进入摘要，因此超长工具轮次不再无限阻塞压缩。
- **`/autocompact`** 查询或设置当前会话的自动压缩上限（`80000`、`100k`、`80%`、`reset`）；
  它不会修改工作区或全局设置，且只会降低安全阈值。

### 对话界面

- **状态胶囊与 Side Pane 互斥。** 打开右侧 Side Pane 时，对话状态胶囊收起为 mini 形态；从 mini
  展开胶囊会关闭 Side Pane，但不会丢弃 tab 或未保存的草稿。
- **共享 Side Pane 查看 tab。** 只读查看器收口为三个稳定类别（文件、子代理、计划），不再为每个
  对象新建一个 tab。
- **状态面板与子代理导航。** Git、Goal、Progress、Run 区块标题使用同一顺序；标题栏快捷入口打开
  子代理目录，同一 root 下的所有 Agent 共用一个只读侧边 tab。
- **专注模式（`/force`）**按会话生效；**划词辅助对话**支持把选区加入主 Composer 或转到侧聊。
- **聊天状态面板**把 git 状态、goal 进度、终态计划、todo 和后台资源收在同一个可收起/展开的 shell 中。
- **导航入口移除。** 不再渲染电脑控制设置入口、桌面远控触发入口、页脚账号入口和侧栏营销横幅；
  底层实现仍保留以维持兼容。
- **按需登录。** 启动不再强制展示登录页；只有手动登录、连接模型供应商或会话过期时才打开。
- **本地斜杠命令：** `/model`、`/effort`、`/copy`、`/export`、`/context`、`/fork`、`/branch`、
  `/force`、`/exit`、`/autocompact`、`/rename`、`/plan`、`/mcp`（`/mcps`）。与 CLI 同名命令冲突时
  本地命令让位；只读视图不注册写操作命令；命令只作用于发起它的 SessionPane。
- **工具渲染。** 统一工具调用渲染器，支持内联 diff 预览、全文与实际 Read 范围标注、命令输出文件
  预览弹窗、后台 Bash 输出弹窗、完整任务输出复制；运行中的编辑/命令卡默认展开，用户手动收起后
  仍会保持。
- **对话细节。** 面向阅读的 Markdown 字号体系；assistant 操作区（复制/赞/踩/fork/retry/时间）
  只出现在一轮最后一段；思考与探索摘要合并；归一化的 turn 视图模型；图片预览指针可靠恢复。

### 运行时、子代理与安全

- **防御性安全提示**写入共享 Harness 段。
- **会话级 Skills/MCP 快捷开关**位于右侧状态面板。它们只改变当前会话，不修改用户或工作区配置，
  不撤销授权，也不会强停在途调用。
- **权限模式热切换**可在 Composer 中完成，包含继承型子代理。
- **TaskOutput 契约：** 阻塞与非阻塞读取、精简的 provider-visible 状态、完成通知去重，以及大输出
  持久化。
- **后台子代理**完成时通过通知唤醒父代理。子代理内部的嵌套后台 Bash 只做清理（cleanup-only），
  默认上限一小时，并在子代理被取消时一并取消。
- **Agent 复用指引**写入 Agent 与 SendMessage 的描述，后续工作优先恢复已有 Agent，而不是重复派生。
- **重要修复：** 指令观察 watcher 泄漏与读取/dispose 竞态、取消后 Codex 设备码轮询回显旧结果、
  Codex 原生搜索域名校验、跨 workspace 压缩策略串用、非法 deferred tool call 参数、无上限的工具
  输出，以及默认读取全文的 Read 范围提示。

### 改动如何接入

- 新行为放在带 `CONTRACT.md`、契约示例和定向测试的新模块中。既有文件只保留装载所需的 import、
  注册、依赖透传或一次调用，因此队列能持续重放在上游之上。
- 抽出的模块包括 Codex transport 策略、指令文件观察、按 workspace 隔离的压缩策略、桌面压缩桥、
  供应商模型解析策略、会话资源、防御性安全提示，以及 UI 兼容命令与输出复制辅助模块。
- UI 字典通过增量消息集合扩展，既有键和值保持不变。
- `patches/@opencode__ai@2.1.4.patch` 让原生搜索的 URL 引用保留在上游解析器中，而不是把 transport
  代码复制进 fork。改编自 OpenCode 的 wire helper 的许可证与来源记录在 `third-party/` 下。
- `.oxlintrc.json` 与 `architecture-policy.yaml` 的行数阈值已对齐，所有新增源码模块都登记到架构策略，
  而不是扩大 legacy 豁免。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `ZCode/` | 上游源码子模块，由 gitlink 锁定 |
| `patches/` | 生成的目录补丁，以及 `series` 和 `manifest.json` |
| `patches.config.json` | 固定基准 ref/commit、源码与输出目录、排除规则 |
| `scripts/`、`tests/` | 补丁导出/准备工具及其回归测试 |
| `.github/workflows/desktop-build.yml` | Windows/Linux 打包，产物以 Actions artifact 形式上传 |
| `start-test.sh`、`start-test.ps1` | 本地测试构建启动脚本 |
| `AGENTS.md` | 开发与交付规则 |

## 快速开始

```bash
git submodule update --init -- ZCode
./start-test.sh          # Windows: ./start-test.ps1
```

启动脚本会保持现有工作树不变。只有当子模块在固定提交上完全干净时，它才会校验并应用整套队列。
`--check` 只跳过启动步骤，首次使用时仍可能应用补丁、安装依赖或配置 Electron 沙箱。

如果只想准备源码、不安装依赖也不启动任何东西：

```bash
node scripts/prepare-patches.mjs
```

## 开发

日常开发直接在 `ZCode/` 中进行。Agent 与 IDE 应把 `AGENTS.md` 作为本仓库唯一的规则来源；
子模块自带的说明不会被加载。

日常检查保持定向——只格式化本次改动的文件，并运行覆盖它们的测试。完整类型检查、Lint 与桌面 E2E
留给交付轮次，而不是每次编辑都跑。

## 补丁队列

```bash
node scripts/export-patches.mjs            # 重新生成并校验队列
node scripts/export-patches.mjs --check    # 生成并校验候选，保留旧队列
node scripts/export-patches.mjs --source /path/to/ZCode
node --test tests/patch-workflow.test.mjs  # 工具链回归测试
```

导出器以固定基准对比最终工作树（包含已提交、已暂存、未暂存和未跟踪的改动），按 `packages/<pkg>`、
`apps/<app>` 及顶层分组拆分，然后在隔离 worktree 中逐项执行 `apply --check --index` 和
`apply --index`，再比较 tree。它不会触碰真实 index、分支或 gitlink。旧队列保留在 `.patch-backups/` 下。

目录补丁是全有或全无的：`patches/**` 标记为 `-text`，避免 checkout 时的换行转换改变
`manifest.json` 中记录的字节。

## 构建

构建在 GitHub Actions 上运行，覆盖 `windows-x64`（NSIS 安装包）与 `linux-x64`（AppImage、deb、rpm、
pacman）。任务会检出固定子模块、校验 gitlink、应用 `patches/series`、用冻结的 lockfile 安装依赖、
写入展示版本号，然后运行既有的 `pnpm bundle:desktop -- --os <win|linux> --arch x64` 流水线。

`platform` 输入接受 `all`（默认）、`windows` 或 `linux`。只选一个平台时仅创建该平台的打包任务；
不传则保持 Windows/Linux 双平台构建。

没有 tag 触发，也不创建 GitHub Release。安装包只作为 Actions artifact 上传，保留 30 天。

```bash
gh workflow run desktop-build.yml --repo ackwrap/ZCoder --ref main -f version=3.16.3 -f platform=windows
gh run list --repo ackwrap/ZCoder --workflow desktop-build.yml --event workflow_dispatch --branch main
# 选择与本次派发提交匹配的运行，然后只下载它的 Windows 安装包。
gh run download <run-id> --repo ackwrap/ZCoder -n windows-x64-nsis -D dist/<unique-run-directory>
```

版本号沿用上游版本号加 fork 后缀，因此无需另造版本线也能识别构建：`3.16.2-1`、`3.16.2-2`，以此类推。
默认值为 `3.16.2-<run number>`；传入显式的 `version` 输入可覆盖。该值只写入打包前检出的工作树，
绝不写回补丁队列。

产物未签名；未配置代码签名与公证。

## 说明

- 工具永远不会自行提交、推送或更新 gitlink。
- `ZCode/patches/` 存放上游依赖补丁，与本仓库的 `patches/` 无关。
- `export-patches` 与 `prepare-patches` 共用 `.patch-export.lock`；如果崩溃的运行留下了锁，
  先确认之前的进程已退出再删除。
- 完整工作流及其边界见 [docs/patch-workflow.md](docs/patch-workflow.md)。
