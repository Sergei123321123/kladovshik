[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$files = @("opencode.json", "AGENTS.md", "MEMORY.md", "index.html", "keygen.html", "bot/package.json", "bot/keygen.js", "bot/bot.js", "miniapp/index.html")
$errors = 0

foreach ($file in $files) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        if ($size -gt 0) {
            Write-Host "[OK] $file ($size bytes)" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] $file exists but is empty" -ForegroundColor Red
            $errors++
        }
    } else {
        Write-Host "[ERROR] $file not found" -ForegroundColor Red
        $errors++
    }
}

Write-Host ""
if ($errors -eq 0) {
    Write-Host "[STATUS] Harness system for 'kladovshik' is ready." -ForegroundColor Cyan
    Write-Host "All harness files verified successfully." -ForegroundColor Green
    exit 0
} else {
    Write-Host "[STATUS] Harness system for 'kladovshik' verification failed." -ForegroundColor Red
    Write-Host "$errors error(s) found." -ForegroundColor Red
    exit 1
}
