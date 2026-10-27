# 目录补丁最小接入审核与整理

## 范围与基准

- 官方固定基准：`3c5b227649371507ddc4eb46ac5133afe6db1cab`（`refs/heads/main`）。
- 本轮开始时源码：`fd6d412584cf3b8752b7b8799445f33187cbe1ab`，分支 `zcode-plus-dev`，工作区与暂存区均干净。
- 开始时源码 tree：`6461ee33802d5e8b6d1fb613d3001cad8aef3335`。
- 外层开始时 HEAD：`6ff72433c78de24f0872ffb831536bbe2fa3ba52`，只有 `M ZCode`；gitlink 保持官方固定基准。
- 审核整套 `patches/series` 的 13 组目录补丁、481 条文件差异；不把目录补丁拆成独立功能补丁。
- 开始时分类：180 个新增文件、299 个修改文件、2 个删除文件。已有文件（含删除）合计增加 14,272 行、删除 6,950 行；这是结构指标，不是质量或验收结论。
- 已核对开始时 13 组补丁的 SHA-256、series 顺序、manifest 文件集合与源码 HEAD tree 一致。

## 整理规格

1. 保留全部已交付行为，不扩展新功能，不改变鉴权、沙箱、审批、脱敏、会话只读态或资源开关的作用域。
2. 扩展点优先级：已有注册表或插件点、依赖注入、稳定边界的一次包装，最后才是实现内部改动。
3. 新逻辑、文案与回归测试优先放入新增文件；已有文件只承担 import、显式依赖传递、注册与一次调用等必要接入。
4. 必须触及协议字段、存储、投影、服务契约、构建依赖等边界时保留最小必要 diff；不得为了少改旧文件而复制另一条实现链路。
5. 不机械搬运未修改的上游代码，不通过运行时替换、原型修改、全局拦截或生成代码掩盖实际耦合。
6. 不重新设计 UI；只重组实现。既有菜单、键盘行为、状态来源、错误处理与平台门禁保持不变。
7. 测试优先证明重构前后的可观察行为一致，再验证旧文件的接入收敛；不能仅以源码字符串匹配或补丁行数代替行为测试。
8. 所有并行修改结束、必要检查通过后再串行提交和导出。不得混入原有或其他会话未验收改动。

## 审核分区

| 分区 | 补丁范围 | 主要关注点 |
| --- | --- | --- |
| CLI 核心、契约、bootstrap | `0002` 的相关目录 | 动态上下文、MCP、压缩与 fork、工具和协议投影 |
| CLI 适配器 | `0002` 的 adapters 及剩余目录 | Codex transport、runner、文件搜索、指令与插件来源 |
| UI | `0010` | 设置、国际化、侧栏、上下文面板、诊断、资源开关、斜杠命令 |
| 其他目录 | `0001`、`0003`–`0009`、`0011`–`0013` | 服务注册、共享协议、供应商、桌面接入、依赖与交付 |

`ZCode/third-party/SPEC.md` 与子仓库各级 `AGENTS.md` 不参与阅读或执行。本轮只采用外层 `AGENTS.md` 的规则。

## 必要旧文件修改与回滚边界

- 修改原因：已有文件是服务装配、协议创建、渲染及字典装载的稳定边界；完全不改它们无法挂载新模块或修复已确认门禁问题。
- 影响面：保持原 owner 和公开接口，只改对应 import、一次注册/调用、必要字段及门禁；不改路由、审批、沙箱、凭据存储或官方固定基准。
- 结构整理可按新增模块及其最小接入成对回滚，保留兼容导出；功能修复与其回归测试成对追溯，不能单独撤掉安全验证来恢复旧行为。

## 验收边界

- 使用现有工作区、依赖和缓存，以及 Node 24.14.0、pnpm 10.33.2；不执行全量构建或全量测试。
- 对实际整理文件跑定向类型、Lint、架构和受影响测试；涉及可观察交互变化时补充浏览器或桌面交互验证。
- 单测、类型或交互验证的历史阻塞须单独列出；Git 重放成功不等于功能验证通过。
- 整套目录补丁由外层导出工具生成并隔离重放；不手工修改补丁顺序、manifest 或官方基准。

## 全量审核结论

以下是对开工快照的审核结论；不表示其中所有既有功能均已在本机重新验收。

| 补丁 | 文件数 | 判断及必要保留的边界 |
| --- | ---: | --- |
| `0001-root` | 4 | 依赖、依赖补丁、锁文件与模块策略保持一致；不借整理调整行数阈值或官方基准。 |
| `0002-apps-zcode-cli` | 187 | 适配器 36 文件，核心/契约/bootstrap/规格 151 文件；保留 transport、投影、存储、运行时和工具协议的必要接入。 |
| `0003-docs` | 22 | 保留功能规格、安全约束与来源记录；修正模型发现和运行中工具卡默认展开的冲突描述。 |
| `0004-packages-client` | 1 | 远端服务访问类型与代理接入不可省略。 |
| `0005-packages-desktop` | 29 | 保留远端 Codex 服务不回落本地、策略握手/重读与目标过滤；策略桥接适合单 owner 模块。旧账号菜单 E2E 路径存在回归，不能视为已验收。 |
| `0006-packages-provider` | 12 | schema、发现来源隔离、事务校验和优先级必须保留；Codex 窗口与模型解析纯策略适合新增模块。 |
| `0007-packages-provider-node` | 1 | 编解码回归测试，保留。 |
| `0008-packages-services` | 40 | Codex/模型发现已有独立 owner；凭据、锁、固定路由、RPC 白名单、精确 scope 与现有实例广播保护均保留。 |
| `0009-packages-shared` | 28 | 压缩摘要身份/边界、来源更新白名单、公开副本剥离、strict RPC 和会话资源字段属于必要协议变化。 |
| `0010-packages-ui` | 152 | 99 个源码文件、53 个测试文件；设置、增量文案、完整输出操作、兼容命令可收敛。摘要读取、transport、能力传递和错误路径不能移除。 |
| `0011-patches` | 1 | 原生搜索及引用能力的上游依赖补丁保留，不把生成的依赖实现复制进应用。 |
| `0012-scripts` | 1 | 动态行数阈值回归测试保留；不更改其约束语义。 |
| `0013-third-party` | 3 | 保留官方来源、许可证和快照摘要；没有读取 `third-party/SPEC.md`，没有运行许可生成。 |

### 已确认需要修复的问题

- 压缩策略原为进程单值缓存，但更新活跃实例按 workspace 过滤；新建与冷恢复可能读取其他 workspace 的策略。
- 指令观察初始化失败可能遗留 watcher，异步读取与 dispose 存在竞态。
- Codex 原生搜索对非法 `allowed_domains` 静默过滤，可能把受限搜索变成无限制搜索。
- `/mcp` 诊断面板的开关写入全局配置，不符合只读诊断/会话作用域约束；手输命令也需要遵循 CLI 同名优先。
- 运行中单编辑/单命令卡的折叠实现及部分测试，与外层明确保留的默认展开要求相反；手工收起必须继续优先。
- Codex 同一 provider 的状态轮询响应乱序可能在取消后重新显示旧设备码。
- 桌面旧账号菜单 helper 无条件抛错，仍有多处测试调用；会话资源 E2E 也未展开默认折叠的内层分组。
- 安全提示删除需按当前外层防御/审计/合规边界补回，不恢复宽泛的 CTF 授权文案。

### 不进行的机械迁移

- 文件搜索与 runner stream 已为行数限制拆分；不再次搬运大段未修改上游代码。
- fork 边界已有独立 helper，无更好的注册点时保留必要核心改动。
- 上下文面板较大的分区渲染不整体搬家；仅搬文件并不能降低调用或升级耦合。
- 协议、服务、存储、能力传递和构建依赖的改动，不用运行时拦截或重复实现来规避。

## 实施与验收结果

### 已实施的结构调整

- 指令观察：新增 `adapters/src/context/instruction-observation/`，原 adapter 保留解析器回调注入和观察委托。
- Codex 策略：可信身份、runtime-only 能力与原生搜索限制校验集中到既有 `codex-transport/` 管理模块，不复制授权或执行链路。
- CLI 压缩策略：新增 workspace-keyed 策略模块，共用原 server context，创建及冷恢复均在异步发布边界重读。
- 会话资源：新增 `runtime/methods/session-resource-methods.ts`，用原 runtime 方法注册表挂载；通用 `config.ts` 恢复官方基准实现。
- 防御安全提示：新增纯常量模块，在共享 Harness 拼接一次，不修改执行层权限机制。
- 供应商模型：新增纯模型解析策略模块，resolver 保留兼容导出、facades 复用同一实现。
- 桌面压缩策略桥接：新增单 owner bridge，保留 connector 握手、重读、关闭释放及 standalone 过滤；不新增策略缓存。
- UI 设置与文案：压缩设置放入独立组件，两个 locale 只接入增量文案集合，全部原有键值保留。
- UI 命令与完整输出：新增兼容命令 hook 与输出复制模块，通过原 SessionPane 和 capability 边界接入。
- UI 诊断与状态：移除诊断面板全局配置开关；单编辑/命令卡以纯策略 opt-in 运行展开；Codex 轮询加同 scope 请求顺序保护。
- 各新增源码模块精确登记到架构策略；不扩大 legacy 豁免，不调整官方固定基准或现有行数上限。

### 已有文件接入收敛示例

下面均是相对官方固定基准的新增/删除行数，而非本轮提交规模。

| 文件 | 整理前 | 整理后 |
| --- | --- | --- |
| `packages/ui/src/settingsPageHelpers.tsx` | +272/-1 | +2/-1 |
| `packages/ui/src/i18n/locales/en-US.ts` | +153/-2 | +2/-2 |
| `packages/ui/src/i18n/locales/zh-CN.ts` | +143/-2 | +2/-2 |
| `packages/ui/src/ToolCallBlocks/renderers/task-output.tsx` | +153/-2 | +16/-0 |
| `apps/zcode-cli/packages/adapters/src/context/index.ts` | +206/-2 | +12/-0 |
| `apps/zcode-cli/packages/core/src/runtime/methods/config.ts` | +106/-0 | 0 |
| `apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts` | +18/-5 | 0 |

缩减后的逻辑并未删除，而是转移到有契约、测试和明确依赖的新模块。协议、存储和能力透传的必要修改不适用“一行接入”的简单指标。

本轮相对开工 HEAD 修改 42 个既有文件（+301/-1507），新增 82 个文件；其中新增 CLI 24、UI 41、provider 7、desktop 7、设计规格 3。没有删除开工快照中的源码文件，没有将缓存、凭据或测试截图加入改动。该统计不包含外层本说明，也不是最终目录补丁文件总量。

### 已完成验证

- 工具链：Node 24.14.0、pnpm 10.33.2。
- CLI 核心/bootstrap：145 个不同定向用例通过；两个包的类型检查通过；定向 Lint 无错误，3 个既有 unused 警告。
- CLI adapters：97 个不同定向用例通过；包级类型检查通过；定向 Lint 无错误，1 个既有 sqlite 警告。已实际覆盖初始化失败清理、dispose/read、完整 sizeBytes 更新及畸形搜索限制。
- provider/desktop 单测：97 + 25 个定向用例通过；纯策略与 bridge 契约回归在消除声明循环后重跑通过（不重复累计用例数）。
- shared/provider/services 声明：分别定向刷新，未运行全仓构建；修复旧声明缓存后 UI 包 `tsc --noEmit` 通过。
- desktop host、E2E 定向类型检查通过；补齐 Bot 测试 fixture 缺失的新增服务方法，不改生产服务或权限。
- UI 压缩设置/文案：28 个不同定向用例通过；新字典测试类型索引问题已修正，契约测试 2/2 重跑通过。
- UI 兼容命令/完整输出：6 文件 93 个定向用例通过（与其他 UI 运行中可能重复，不能跨分区直接累加）；26 文件定向 Lint 为 0 警告、0 错误。
- 复制/导出浏览器：新增 `compat-slash.test.mjs` 正式 exit 0、1 pass，实际验证剪贴板内容、Markdown 下载正文、文件名及更早历史提示，无 pageerror。初次并发缓存/句柄清理超时不算通过；改为独立临时缓存并关闭本轮句柄后解决。
- 独立字典比较：英文 7,114 项、中文 7,110 项相对开工快照均无键缺失、无值改变。
- 运行卡片浏览器：`tool-live-expansion.test.mjs` 正常退出，4/4 通过（390/1200、浅色/深色），验证单编辑/命令运行展开、手工收起跨 streaming/completion 保持及完成后手动展开。
- 诊断浏览器：`session-diagnostics.test.mjs` 正常退出，8/8 通过（320/1200、中英文、浅色/深色），验证无 switch/checkbox、脱敏复制及窄屏布局。初次加载和句柄超时通过串行运行与显式清理解决，未放宽断言。
- 新架构边界和整套累计补丁：分别以开工 HEAD、官方固定基准为显式比较点检查，均为 0 违规、0 基线、0 新违规；初次发现的声明循环均通过拆分类型叶子解决，没有加循环豁免。
- 四个分区独立静态复审均未发现本轮新增阻塞；复审没有重复声称运行实现者的测试。
- `git diff --check` 及架构策略格式检查通过。

### 检查命令索引

以下命令均在源码根执行，包路径与测试文件均已实际存在。只列本轮范围，不代表全量检查。

```sh
pnpm --dir apps/zcode-cli/packages/adapters typecheck
pnpm --dir apps/zcode-cli/packages/core typecheck
pnpm --dir apps/zcode-cli/packages/bootstrap typecheck
pnpm exec tsc -b packages/shared/tsconfig.json packages/provider/tsconfig.json
pnpm exec tsc -b packages/services/tsconfig.json
pnpm exec tsc -p packages/ui/tsconfig.json --noEmit
pnpm exec tsc -p packages/desktop/tsconfig.host.json --noEmit
pnpm exec tsc -p packages/desktop/tsconfig.e2e.json --noEmit
node scripts/architecture/architecture-check.mjs check --changed --base 3c5b227649371507ddc4eb46ac5133afe6db1cab
node --test packages/ui/test/browser/manual-review/pending/compat-slash.test.mjs
node --test packages/ui/test/browser/manual-review/pending/tool-live-expansion.test.mjs
node --test packages/ui/test/browser/manual-review/pending/session-diagnostics.test.mjs
```

CLI 定向 Vitest 使用各包自己的配置：

```sh
pnpm --dir apps/zcode-cli/packages/adapters exec vitest run tests/adapter-extraction-contracts.test.ts tests/instruction-file-watch.test.ts tests/instruction-observation-regression.test.ts tests/codex-web-search-validation.test.ts tests/codex-opencode.test.ts tests/model-execution.test.ts tests/runner-admission.test.ts tests/tool-transform.test.ts
pnpm --dir apps/zcode-cli/packages/bootstrap exec vitest run tests/compaction-policy.test.ts tests/compaction-policy/contract.test.ts tests/compaction-policy/workspace-isolation.test.ts tests/session-facade.test.ts tests/v4-native-commands.test.ts
pnpm --dir apps/zcode-cli/packages/core exec vitest run tests/session-resources/contract.test.ts tests/session-resources/runtime.test.ts tests/defensive-security.test.ts tests/defensive-security/contract.test.ts tests/context-builder.test.ts
```

桌面资源 E2E 使用 `E2E_PROVIDER_HTTP_MODE=replay` 与 `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json`：

```sh
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/settings/manual-review/pending/session-resources.test.ts
```

### 桌面 E2E 过程与已知限制

- 桌面资源 E2E 首次实际运行 exit 1：prepare 与 before-session 通过，但创建 WebDriver 会话的 `POST /session` 在 30 秒后超时，0 个用例执行；不能视为资源 UI 通过，也不能据此判断其代码失败。runner 自动重建过桌面 `out` 和 bundled CLI 等忽略产物，不是手动全仓构建。
- 首次证据：`packages/desktop/.e2e-artifacts/desktop-e2e-20261025113424881-p34452-6af6f3ff005214f9/summary.json`、`lifecycle-events.ndjson`。未绕过审批/沙箱或修改等待阈值。
- 核实既有 `ZCODE_E2E_SKIP_BUILD=1` 与 `ZCODE_E2E_SKIP_AGENT_BUILD=1` 入口后，在其他并发验证结束的条件下，仅复用产物重跑同 spec 一次：exit 0，1/1 用例通过、0 skipped、无用例重试；after、after-session、worker、complete 均通过。用例实际验证当前会话 MCP/Skills 开关不改变共享配置。
- 通过证据：`packages/desktop/.e2e-artifacts/desktop-e2e-20261025114532497-p51480-08c22699ecf30e86/summary.json`、`lifecycle-events.ndjson`。首次超时未复现，不据此声称并发争用是唯一根因；未第三次运行。
- UI 诊断/卡片/Codex 定向用例最终 43/43 通过；既有 Codex 授权夹具只修正旧 URL，未放宽生产 URL 白名单。既有 tool-presentation 浏览器夹具未完成，不能计为通过。
- 旧账号菜单 helper 仍对应已移除的账号入口：当前不存在合法可见路径。未恢复被移除产品入口，也未跳过安全场景伪造通过；相关旧 E2E 仍是已知阻塞。
- 未运行 macOS/Linux、真实 Codex 登录与真实远端连接；mock/fixture 不证明真实授权完成。

## 本轮交付状态

- 已在本地 `zcode-plus-dev` 提交源码：`1d7868973ec30e3906b098279ef4e7bafd70c4b7`，`refactor(integration): isolate edition modules behind stable hooks`。
- 子模块最终工作区与暂存区干净；所有并行写入结束后才提交及导出。没有推送、改远程配置或移动 `refs/heads/main`。
- 外层运行 `node scripts/export-patches.mjs`，重建 13 个目录补丁、562 个文件差异。`series` 顺序不变，仍需整套使用。
- 官方固定基准保持 `3c5b227649371507ddc4eb46ac5133afe6db1cab`；源码目标 tree 为 `145151721a6db08ed72e3bc5e8933673f0f72eb3`。
- 每项隔离 `apply --check --index`、`apply --index` 重放通过，最终 tree 相同；manifest 的源码 HEAD、tree、13 个 SHA-256 与 series 顺序再次核对一致。
- 旧队列整体备份：`.patch-backups/2026-10-25T11-51-25-767Z-5b09b2a3-548d-4850-bde4-bd58cc25e65e/patches`。
- 外层本轮变更：本说明、`patches/0001-root.patch`、`0002-apps-zcode-cli.patch`、`0003-docs.patch`、`0005-packages-desktop.patch`、`0006-packages-provider.patch`、`0010-packages-ui.patch`、`manifest.json`。其他目录补丁及 `series` 未改。
- 外层 gitlink 保持官方固定 SHA，暂存区没有 `ZCode`；外层仍显示 `M ZCode` 属预期。外层本轮补丁与说明未提交，遵循外层提交需另获明确授权的规则。
- 最终源码 `git diff --check` 通过。外层直接检查嵌套 `.patch` 时报告 21 个空白警告，逐项核实都是标准 unified diff 空上下文行所需的单个空格（不是源码行尾空格）；不手工删除补丁上下文。排除 `.patch` 的外层差异检查通过。
