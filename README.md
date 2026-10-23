# ZCode-plus

基于 [ZCode](https://github.com/zai-org/ZCode) 的补丁式二次开发仓库。

`ZCode/` 是源码子模块，可直接在其中开发。`patches.config.json` 固定基准分支和提交 SHA；最后一键生成按目录分组的完整 Git 补丁，顺序见 `patches/series`，摘要和目标源码树见 `patches/manifest.json`。

## 日常开发与一键导出

直接修改 `ZCode/`，在该目录运行应用测试。完成后在外层执行（只需 Node 和 Git）：

```bash
node scripts/export-patches.mjs
```

脚本自动包含已暂存、未暂存和非忽略新增文件，按 `packages/<包>`、`apps/<应用>` 等目录分组，隔离重放验证后备份并替换旧队列。**不改真实 index、分支、gitlink，不提交或清理工作区。** 构建产物按配置排除，原文件保持不动。

```bash
node scripts/export-patches.mjs --check                 # 仅生成/验证，不替换队列
node scripts/export-patches.mjs --source /path/to/ZCode # 从指定开发目录导出
node --test tests/patch-workflow.test.mjs               # 外层工具回归测试
```

首次基准为本地 `main` 的 `3c5b227649371507ddc4eb46ac5133afe6db1cab`；建议开发分支与基准分支分开。基准分支移动时脚本停止，不自动采用最新提交。换基线须显式修改配置并重新验证。目录补丁应整套应用，不再按功能追加。旧队列完整保存在 `.patch-backups/`（不入 Git）。

## 快速开始

```bash
git submodule update --init -- ZCode
./start-test.sh
```

`start-test.sh` 保留已有开发改动；只有源码完全干净且 HEAD 等于固定基准时才验证并应用完整队列，然后准备依赖和 Electron 环境、启动测试版。`--check` 只跳过启动，仍可能首次应用补丁、安装依赖或修改沙箱权限，不是只读检查。

只准备源码（不安装依赖或启动应用）：

```bash
node scripts/prepare-patches.mjs
```

## 目录

- `patches/`：二开补丁与唯一应用顺序 `series`
- `patches.config.json`：固定分支基准、源码/输出目录及排除规则
- `scripts/`、`tests/`：一键导出/准备与外层工具测试
- `ZCode/`：上游源码子模块
- `AGENTS.md`：开发、补丁和验证约定
- `start-test.sh`：本地测试版启动脚本

## 说明

- 工具不自动提交源码或更新 gitlink；是否在子模块开发分支提交由用户决定。
- 工作区已应用队列或尚未导出时显示已修改是正常状态；启动不会重置它。
- 导出/准备操作共用 `.patch-export.lock`。异常退出留下锁时，先确认原进程已结束，不能直接抢锁。
- 完整规则、迁移边界和验收说明见 [目录补丁工作流](docs/patch-workflow.md)。
