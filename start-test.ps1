<#
.SYNOPSIS
  ZCode-plus 测试版一键启动（Windows）。

.DESCRIPTION
  对应 start-test.sh 的 Windows 版本：定位 Node 24 / pnpm、复用外层补丁工具，
  然后以测试数据目录启动桌面端（pnpm dev:desktop:test）。

.PARAMETER Check
  只检查环境、补丁与依赖，不启动。

.PARAMETER Production
  以生产模式启动（ZCODE_ENV=production），数据仍走 .zcode-dev-data。

.PARAMETER DataDir
  指定测试数据目录，默认 <仓库根>\.zcode-dev-data。

.PARAMETER ToolsDir
  指定工具链缓存目录，默认 %USERPROFILE%\.cache\zcode-plus。

.EXAMPLE
  .\start-test.ps1
.EXAMPLE
  .\start-test.ps1 -Check
#>
[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$Production,
  [string]$DataDir,
  [string]$ToolsDir
)

$ErrorActionPreference = 'Stop'

# 脚本以 UTF-8(BOM) 保存；Windows PowerShell 5.1 的控制台默认不是 UTF-8，
# 不显式设置会把中文提示输出成乱码。
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
  # 非交互重定向场景下可能不可用，忽略即可。
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ZCode = Join-Path $Root 'ZCode'
$Tools = if ($ToolsDir) { $ToolsDir } else { Join-Path $env:USERPROFILE '.cache\zcode-plus' }
$NodeVersion = '24.14.0'
$PnpmVersion = '10.33.2'

function Write-Step([string]$Message) { Write-Host "[start-test] $Message" -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Host "[start-test] $Message" -ForegroundColor Yellow }
function Stop-Run([string]$Message) { Write-Host "[start-test] $Message" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $ZCode)) {
  Stop-Run "找不到 ZCode 子模块，请先执行：git submodule update --init -- ZCode"
}
New-Item -ItemType Directory -Force -Path $Tools | Out-Null

# ---------- Node 24 ----------
$NodeDir = Join-Path $Tools "node\node-v$NodeVersion-win-x64"
if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) {
  $found = Get-Command node -ErrorAction SilentlyContinue
  if ($found) {
    $major = & node -p "process.versions.node.split('.')[0]"
    if ([int]$major -ge 24) { $NodeDir = Split-Path -Parent $found.Source }
  }
}
if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) {
  Stop-Run "未找到 Node >= 24。请安装 Node $NodeVersion，或把解压目录放进 $Tools\node\node-v$NodeVersion-win-x64"
}

# ---------- pnpm ----------
$PnpmDir = Join-Path $Tools 'pnpm-bin'
if (-not (Test-Path (Join-Path $PnpmDir 'pnpm.cmd'))) {
  Stop-Run "未找到 pnpm。请把 pnpm $PnpmVersion 解压到 $PnpmDir（需包含 pnpm.cmd）"
}

# 只在本进程内拼 PATH，不改用户环境。
$env:PATH = "$NodeDir;$PnpmDir;$env:PATH"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
Write-Step "Node: $(& node --version)"
Write-Step "pnpm: $(& pnpm --version)"

# ---------- 补丁队列 ----------
# 复用外层工具的基准/完整性检查；日常开发不改真实 index。
& node (Join-Path $Root 'scripts\prepare-patches.mjs') --source $ZCode
if ($LASTEXITCODE -ne 0) { Stop-Run '补丁准备失败' }

# ---------- 依赖 ----------
if (-not (Test-Path (Join-Path $ZCode 'node_modules'))) {
  Write-Step '安装依赖（首次可能较久）...'
  Push-Location $ZCode
  try {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { Stop-Run '依赖安装失败' }
  } finally { Pop-Location }
} else {
  Write-Step '依赖已安装'
}

if ($Check) {
  Write-Step '检查通过。运行 .\start-test.ps1 启动测试版。'
  exit 0
}

# ---------- 启动 ----------
if (-not $DataDir) { $DataDir = Join-Path $Root '.zcode-dev-data' }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$env:ZCODE_DATA_BASE_DIR = $DataDir
Write-Step "数据目录：$DataDir"

$script = if ($Production) { 'dev:desktop' } else { 'dev:desktop:test' }
Write-Step "启动$(if ($Production) { '生产' } else { '测试' })版..."
Push-Location $ZCode
try {
  & pnpm $script
} finally { Pop-Location }
