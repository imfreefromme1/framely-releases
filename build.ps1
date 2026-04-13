# build.ps1
# Full Framely build pipeline — builds the app then patches the icon into the exe and installer
# Usage: .\build.ps1

$projectRoot = "C:\Users\Key\Desktop\framely"
$exe         = "$projectRoot\src-tauri\target\release\Framely.exe"
$ico         = "$projectRoot\src-tauri\icons\icon.ico"
$rh          = "C:\Program Files (x86)\Resource Hacker\ResourceHacker.exe"
$bundleDir   = "$projectRoot\src-tauri\target\release\bundle"

Write-Host "==============================" -ForegroundColor Cyan
Write-Host " Framely Build Pipeline" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# ── Step 1: Build ─────────────────────────────────────────────────
Write-Host "`n[1/4] Building Framely..." -ForegroundColor Yellow
Set-Location $projectRoot
npm run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Build complete." -ForegroundColor Green

# ── Step 2: Patch icon into .exe ──────────────────────────────────
Write-Host "`n[2/4] Patching icon into Framely.exe..." -ForegroundColor Yellow
& $rh -open $exe -save $exe -action addoverwrite -res $ico -mask ICONGROUP,1,1033
Write-Host "Exe icon patched." -ForegroundColor Green

# ── Step 3: Patch icon into MSI installer ─────────────────────────
Write-Host "`n[3/4] Patching icon into MSI installer..." -ForegroundColor Yellow
$msi = Get-ChildItem "$bundleDir\msi\*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$nsis = Get-ChildItem "$bundleDir\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($nsis) {
    & $rh -open $nsis.FullName -save $nsis.FullName -action addoverwrite -res $ico -mask ICONGROUP,1,1033
    Write-Host "NSIS installer icon patched: $($nsis.Name)" -ForegroundColor Green
} else {
    Write-Host "No NSIS installer found, skipping." -ForegroundColor DarkGray
}

if ($msi) {
    Write-Host "MSI found: $($msi.Name) (MSI format does not embed exe icons, skipping)" -ForegroundColor DarkGray
}

# ── Step 4: Clear icon cache ──────────────────────────────────────
Write-Host "`n[4/4] Clearing Windows icon cache..." -ForegroundColor Yellow
Remove-Item "$env:LOCALAPPDATA\IconCache.db" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache*" -Force -ErrorAction SilentlyContinue
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Start-Process explorer.exe

Write-Host "`n==============================" -ForegroundColor Cyan
Write-Host " Build complete!" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Exe:       $exe" -ForegroundColor White
if ($nsis) { Write-Host "Installer: $($nsis.FullName)" -ForegroundColor White }
if ($msi)  { Write-Host "MSI:       $($msi.FullName)" -ForegroundColor White }
Write-Host ""
Write-Host "Ship the installer from the bundle folder to customers." -ForegroundColor Cyan
