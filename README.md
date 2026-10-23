# ZCode-plus

基于 [ZCode](https://github.com/zai-org/ZCode) 的补丁式二次开发仓库。

`ZCode/` 是上游 Git 子模块，基线由外层 gitlink 固定；二开代码、测试、配置和规格以 `patches/` 中的标准 Git 补丁交付，顺序见 `patches/series`。

## 快速开始

```bash
git submodule update --init -- ZCode
./start-test.sh
```

`start-test.sh` 会按 `patches/series` 逐个检查并应用补丁、准备依赖和 Electron 环境，然后启动测试版。`--check` 只跳过启动，仍可能应用补丁、安装依赖或修改沙箱权限。

手动应用补丁：

```bash
while IFS= read -r name; do
  case "$name" in ""|\#*) continue ;; esac
  git -C ZCode apply --check --index "patches/$name"
  git -C ZCode apply --index "patches/$name"
done < patches/series
```

## 目录

- `patches/`：二开补丁与唯一应用顺序 `series`
- `ZCode/`：上游源码子模块
- `AGENTS.md`：开发、补丁和验证约定
- `start-test.sh`：本地测试版启动脚本

## 说明

- 不提交 `ZCode/` 中的补丁改动；补丁只在 `patches/` 中维护。
- 当前 gitlink 指向的上游提交是补丁基线，补丁应用后子模块工作区会显示为已修改，这是预期状态。
