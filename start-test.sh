#!/usr/bin/env bash
# ZCode-plus 测试版一键启动
#
# 用法：
#   ./start-test.sh          启动测试版（pnpm dev:desktop:test）
#   ./start-test.sh --check  只检查环境、补丁和依赖，不启动
#   ./start-test.sh --help   显示帮助
#
# 可用环境变量：
#   ZCODE_NODE_BIN=/path/to/node/bin   指定 Node >= 24 的 bin 目录
#   ZCODE_DATA_BASE_DIR=/path          指定测试数据目录
#   ZCODE_PLUS_TOOLS_DIR=/path         指定工具链缓存目录（默认 ~/.cache/zcode-plus）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZCODE="$ROOT/ZCode"
PATCHES="$ROOT/patches"
SERIES="$PATCHES/series"
TOOLS="${ZCODE_PLUS_TOOLS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/zcode-plus}"
NODE_VERSION="24.14.0"
DESKTOP_PKG="$ZCODE/packages/desktop/package.json"
BACKUP="$TOOLS/desktop-package.json.bak"
CHECK_ONLY=0
case "${1:-}" in
  --check) CHECK_ONLY=1 ;;
  -h|--help)
    sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *) printf '未知参数：%s\n' "$1" >&2; exit 2 ;;
esac

log() { printf '\033[1;34m[start-test]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start-test]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[start-test]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -d "$ZCODE" ]] || die "找不到 ZCode 子模块，请先执行：git submodule update --init -- ZCode"
mkdir -p "$TOOLS"

# 上次异常退出可能留下临时版本号，先恢复。
if [[ -f "$BACKUP" ]]; then
  cp "$BACKUP" "$DESKTOP_PKG"
  rm -f "$BACKUP"
fi

# ---------- Node 24 ----------
find_node() {
  if [[ -n "${ZCODE_NODE_BIN:-}" && -x "${ZCODE_NODE_BIN}/node" ]]; then
    printf '%s\n' "$ZCODE_NODE_BIN"
    return 0
  fi
  if [[ -x "$TOOLS/node/bin/node" ]]; then
    printf '%s\n' "$TOOLS/node/bin"
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [[ "$major" -ge 24 ]]; then
      dirname "$(command -v node)"
      return 0
    fi
  fi
  return 1
}

NODE_BIN_DIR="$(find_node || true)"
if [[ -z "$NODE_BIN_DIR" ]]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) NODE_ARCH="linux-x64" ;;
    Linux-aarch64|Linux-arm64) NODE_ARCH="linux-arm64" ;;
    Darwin-x86_64) NODE_ARCH="darwin-x64" ;;
    Darwin-arm64) NODE_ARCH="darwin-arm64" ;;
    *) die "暂不支持自动安装当前平台：$(uname -s) $(uname -m)，请设置 ZCODE_NODE_BIN" ;;
  esac
  log "未找到 Node >= 24，下载 Node ${NODE_VERSION} 到 ${TOOLS}/node ..."
  mkdir -p "$TOOLS/node"
  NODE_ARCHIVE="$TOOLS/node.tar.gz"
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$NODE_URL" -o "$NODE_ARCHIVE"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$NODE_ARCHIVE" "$NODE_URL"
  else
    die "需要 curl 或 wget 下载 Node"
  fi
  tar -xzf "$NODE_ARCHIVE" -C "$TOOLS/node" --strip-components=1
  rm -f "$NODE_ARCHIVE"
  NODE_BIN_DIR="$TOOLS/node/bin"
fi

mkdir -p "$TOOLS/bin"
export PATH="$NODE_BIN_DIR:$TOOLS/bin:$PATH"
log "Node: $(node --version)"

# ---------- pnpm ----------
export COREPACK_HOME="$TOOLS/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable --install-directory "$TOOLS/bin"
fi
corepack prepare pnpm@10.33.2 --activate >/dev/null
command -v pnpm >/dev/null 2>&1 || die "pnpm 不可用"
log "pnpm: $(pnpm --version)"

# ---------- 补丁队列 ----------
if [[ -f "$SERIES" ]]; then
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    line="${raw%%#*}"
    name="$(printf '%s' "$line" | xargs)"
    [[ -z "$name" ]] && continue
    patch="$PATCHES/$name"
    [[ -f "$patch" ]] || die "补丁不存在：$patch"
    if (cd "$ZCODE" && git apply --reverse --check "$patch" >/dev/null 2>&1); then
      log "已应用：$name"
      continue
    fi
    (cd "$ZCODE" && git apply --check "$patch") || die "补丁无法应用（可能有冲突）：$name"
    (cd "$ZCODE" && git apply --index "$patch")
    log "已应用：$name"
  done < "$SERIES"
else
  log "没有 patches/series，跳过补丁"
fi

# ---------- 依赖 ----------
if [[ ! -d "$ZCODE/node_modules" ]]; then
  log "安装依赖（首次可能较久）..."
  (cd "$ZCODE" && pnpm install --frozen-lockfile)
else
  log "依赖已安装"
fi

# ---------- Linux Electron 沙箱 ----------
if [[ "$(uname -s)" == "Linux" ]]; then
  SANDBOX="$ZCODE/node_modules/electron/dist/chrome-sandbox"
  if [[ -f "$SANDBOX" ]]; then
    state="$(stat -c '%u %a' "$SANDBOX" 2>/dev/null || true)"
    if [[ "$state" != "0 4755" ]]; then
      if sudo -n true 2>/dev/null; then
        sudo -n chown root:root "$SANDBOX"
        sudo -n chmod 4755 "$SANDBOX"
        log "已配置 Electron chrome-sandbox"
      else
        warn "chrome-sandbox 未配置 setuid，Electron 可能无法启动；可手动执行："
        warn "  sudo chown root:root '$SANDBOX' && sudo chmod 4755 '$SANDBOX'"
      fi
    fi
  fi
fi

if [[ "$CHECK_ONLY" == "1" ]]; then
  log "检查通过。运行 ./start-test.sh 启动测试版。"
  exit 0
fi

# ---------- Linux 开发态应用版本 ----------
# 原生 Electron 从 package.json 读取版本；开发目录没有版本号时会被解析成 0.0，
# electron-updater 会拒绝启动。仅在运行期间补上，退出时恢复。
restore_desktop_pkg() {
  if [[ -f "$BACKUP" ]]; then
    cp "$BACKUP" "$DESKTOP_PKG"
    rm -f "$BACKUP"
  fi
}
trap restore_desktop_pkg EXIT INT TERM
if [[ "$(uname -s)" == "Linux" ]]; then
  cp "$DESKTOP_PKG" "$BACKUP"
  node - "$DESKTOP_PKG" "$ZCODE/package.json" <<'NODE'
const fs = require("node:fs");
const [desktopPath, rootPath] = process.argv.slice(2);
const desktop = JSON.parse(fs.readFileSync(desktopPath, "utf8"));
const root = JSON.parse(fs.readFileSync(rootPath, "utf8"));
desktop.version = root.version;
fs.writeFileSync(desktopPath, `${JSON.stringify(desktop, null, 2)}\n`);
NODE
fi

# ---------- 启动 ----------
export ZCODE_DATA_BASE_DIR="${ZCODE_DATA_BASE_DIR:-$ROOT/.zcode-dev-data}"
mkdir -p "$ZCODE_DATA_BASE_DIR"
log "数据目录：$ZCODE_DATA_BASE_DIR"
log "启动测试版..."
cd "$ZCODE"
pnpm dev:desktop:test
