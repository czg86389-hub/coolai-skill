# COOL AI skill installer (Windows PowerShell).
#   powershell -ExecutionPolicy Bypass -File install.ps1            every supported tool found on this PC
#   powershell -ExecutionPolicy Bypass -File install.ps1 claude     only one: claude | codex | workbuddy | dsh | agents
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'skills\coolai'
if (-not (Test-Path (Join-Path $src 'SKILL.md'))) { Write-Host 'skills\coolai\SKILL.md not found next to install.ps1'; exit 1 }
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$dirs = [ordered]@{
  claude    = Join-Path $HOME '.claude\skills'
  codex     = Join-Path $codexHome 'skills'
  workbuddy = Join-Path $HOME '.workbuddy\skills'
  dsh       = Join-Path $dshHome 'skills'
  agents    = Join-Path $HOME '.agents\skills'
}
function Install-One($tool) {
  $dst = Join-Path $dirs[$tool] 'coolai'
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Copy-Item (Join-Path $src '*') $dst -Recurse -Force
  Write-Host "已安装 / installed: $dst"
}
if ($args.Count -gt 0) {
  foreach ($t in $args) {
    if (-not $dirs.Contains($t)) { Write-Host "unknown tool: $t (use claude | codex | workbuddy | dsh | agents)"; exit 1 }
    Install-One $t
  }
} else {
  $n = 0
  foreach ($t in @('claude', 'codex', 'workbuddy', 'dsh')) {
    if (Test-Path (Split-Path $dirs[$t] -Parent)) { Install-One $t; $n++ }
  }
  if ($n -eq 0) { Write-Host '没找到支持的工具，请指定一个 / No supported tool found, name one: install.ps1 claude   (codex / workbuddy / dsh)'; exit 1 }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host '注意：需要 Node.js 18 或以上 / Note: Node.js 18+ is required: https://nodejs.org' }
Write-Host '安装完成。重启工具后说：「用 COOL AI 做一条产品视频」'
Write-Host 'Done. Restart the tool, then say: "use COOL AI to make a product video"'
