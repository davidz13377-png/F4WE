param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$toolsDir = Join-Path $ProjectRoot "tools"

if (-not (Test-Path $toolsDir)) {
    throw "Missing tools directory: $toolsDir"
}

$ytDlp = Get-ChildItem -Path $toolsDir -Recurse -File -Filter "yt-dlp.exe" | Select-Object -First 1
if (-not $ytDlp) {
    $ytCommand = Get-Command "yt-dlp" -ErrorAction SilentlyContinue
    if ($ytCommand) { $ytDlp = Get-Item $ytCommand.Source }
}
if (-not $ytDlp) {
    throw "yt-dlp was not found. Put yt-dlp.exe in $toolsDir"
}

$ffmpeg = Get-ChildItem -Path $toolsDir -Recurse -File -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $ffmpeg) {
    $archive = Get-ChildItem -Path $toolsDir -File -Filter "ffmpeg*.zip" | Select-Object -First 1
    if ($archive) {
        $destination = Join-Path $toolsDir "ffmpeg"
        Write-Host "Extracting $($archive.Name)..."
        Expand-Archive -LiteralPath $archive.FullName -DestinationPath $destination -Force
        $ffmpeg = Get-ChildItem -Path $destination -Recurse -File -Filter "ffmpeg.exe" | Select-Object -First 1
    }
}
if (-not $ffmpeg) {
    $ffmpegCommand = Get-Command "ffmpeg" -ErrorAction SilentlyContinue
    if ($ffmpegCommand) { $ffmpeg = Get-Item $ffmpegCommand.Source }
}
if (-not $ffmpeg) {
    throw "FFmpeg was not found. Extract an FFmpeg build under $toolsDir"
}

Write-Host "yt-dlp: $($ytDlp.FullName)"
& $ytDlp.FullName -U
if ($LASTEXITCODE -ne 0) { throw "yt-dlp update failed." }
& $ytDlp.FullName --version
if ($LASTEXITCODE -ne 0) { throw "yt-dlp version check failed." }

Write-Host "FFmpeg: $($ffmpeg.FullName)"
& $ffmpeg.FullName -version
if ($LASTEXITCODE -ne 0) { throw "FFmpeg version check failed." }

Write-Host "F4WE YouTube import tools are ready."
