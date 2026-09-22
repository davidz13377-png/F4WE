param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path (Join-Path $ProjectRoot "apps/mobile/app.json"))) { throw "Run this script from your F4WE project (for example C:\mb)." }

# Expo's CLI resolves expo-router from the workspace root during typed-route
# generation. npm install can remove a manually created node_modules junction.
# Restore it before every Android launch while leaving an existing real package
# or an existing valid junction untouched.
$rootRouter = Join-Path $ProjectRoot "node_modules/expo-router"
$mobileRouter = Join-Path $ProjectRoot "apps/mobile/node_modules/expo-router"
if (-not (Test-Path (Join-Path $rootRouter "_ctx-shared.js"))) {
    if ((Test-Path (Join-Path $mobileRouter "_ctx-shared.js")) -and -not (Test-Path -LiteralPath $rootRouter)) {
        New-Item -ItemType Junction -Path $rootRouter -Target $mobileRouter -ErrorAction Stop | Out-Null
        Write-Host "Expo Router workspace junction restored"
    } else {
        throw "Expo Router is missing or incompatible. Ensure apps/mobile/node_modules/expo-router is installed and the root node_modules/expo-router path is free."
    }
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$backupRoot = Join-Path $ProjectRoot (".f4we-backups\" + $stamp)
function Backup-File([string]$target) {
    $relative = $target.Substring($ProjectRoot.Length).TrimStart('\', '/')
    $backup = Join-Path $backupRoot $relative
    $backupFolder = Split-Path -Parent $backup
    if (-not (Test-Path $backupFolder)) { New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null }
    Copy-Item -LiteralPath $target -Destination $backup -Force
}
function Replace-BrandText([string]$relativePath) {
    $target = Join-Path $ProjectRoot $relativePath
    if (-not (Test-Path $target)) { return }
    $old = [IO.File]::ReadAllText($target)
    $updated = $old.Replace("Music Box", "F4WE").Replace("MUSIC BOX", "F4WE")
    if ($updated -ne $old) {
        Backup-File $target
        [IO.File]::WriteAllText($target, $updated, $utf8)
        Write-Host ("Updated: " + $relativePath)
    }
}
# Edit the existing native name only; preserve every other Android resource.
$stringsPath = Join-Path $ProjectRoot "apps/mobile/android/app/src/main/res/values/strings.xml"
if (Test-Path $stringsPath) {
    $old = [IO.File]::ReadAllText($stringsPath)
    $updated = [regex]::Replace($old, '(<string\s+name="app_name"[^>]*>)[^<]*(</string>)', '${1}F4WE${2}')
    if ($updated -ne $old) {
        Backup-File $stringsPath
        [IO.File]::WriteAllText($stringsPath, $updated, $utf8)
        Write-Host "Android launcher name: F4WE"
    } elseif ($old -notmatch '<string\s+name="app_name"') { Write-Warning "app_name resource not found. Update the app label in Android Studio." }
} else { Write-Host "No existing Android project: the first Expo build will use the F4WE app.json name." }

# Update the already-generated Android launcher icons without running Expo prebuild.
$nativeIconSource = Join-Path $ProjectRoot "apps/mobile/assets/android"
$nativeRes = Join-Path $ProjectRoot "apps/mobile/android/app/src/main/res"
if ((Test-Path $nativeIconSource) -and (Test-Path $nativeRes)) {
    Get-ChildItem -Path $nativeIconSource -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($nativeIconSource.Length).TrimStart('\', '/')
        $destination = Join-Path $nativeRes $relative
        $destinationFolder = Split-Path -Parent $destination
        if (-not (Test-Path $destinationFolder)) { New-Item -ItemType Directory -Path $destinationFolder | Out-Null }
        if (Test-Path $destination) { Backup-File $destination }
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }
    $colorsPath = Join-Path $nativeRes "values/colors.xml"
    if (Test-Path $colorsPath) {
        $oldColors = [IO.File]::ReadAllText($colorsPath)
        $newColors = [regex]::Replace($oldColors, '(<color\s+name="(?:iconBackground|splashscreen_background)"[^>]*>)[^<]*(</color>)', '${1}#000000${2}')
        if ($newColors -ne $oldColors) { [IO.File]::WriteAllText($colorsPath, $newColors, $utf8) }
    }
    Write-Host "Android launcher icon: F4WE"
}
Replace-BrandText "apps/mobile/android/settings.gradle"

# Android SystemUI owns the media-card layout and does not expose a supported
# app-name text slot on every Android version. Use a real F4WE small icon, which
# is the branding element SystemUI consistently displays in the top-left corner.
$musicServicePath = Join-Path $ProjectRoot "node_modules/react-native-track-player/android/src/main/java/com/doublesymmetry/trackplayer/service/MusicService.kt"
if (Test-Path $musicServicePath) {
    $oldService = [IO.File]::ReadAllText($musicServicePath)
    # Remove older attempts that changed a hidden notification extra. Android
    # ignores that field for this SystemUI card and it should not be re-posted.
    $oldService = [regex]::Replace($oldService, '(?m)^[ \t]*// Android SystemUI reads this field for the app name shown in\r?\n[ \t]*// the top-left of the media controls card\.\r?\n[ \t]*it\.notification\.extras\.putString\("android\.substName", "F4WE"\)\r?\n[ \t]*\(getSystemService\(Context\.NOTIFICATION_SERVICE\) as NotificationManager\)\r?\n[ \t]*\.notify\(it\.notificationId, it\.notification\)\r?\n', '')
    $oldService = [regex]::Replace($oldService, '(?m)^[ \t]*// F4WE name in Android media controls\.\r?\n[ \t]*it\.notification\.extras\.putString\("android\.substName", "F4WE"\)\r?\n[ \t]*\(getSystemService\(Context\.NOTIFICATION_SERVICE\) as NotificationManager\)\r?\n[ \t]*\.notify\(it\.notificationId, it\.notification\)\r?\n', '')
    $iconMarker = 'val f4weNotificationIcon = resources.getIdentifier("f4we_notification", "drawable", packageName)'
    if (-not $oldService.Contains($iconMarker)) {
        $smallIconLine = '        val smallIcon = BundleUtils.getIconOrNull(this, options, "icon")'
        $smallIconReplacement = '        val f4weNotificationIcon = resources.getIdentifier("f4we_notification", "drawable", packageName)' + [Environment]::NewLine +
            '        val smallIcon = BundleUtils.getIconOrNull(this, options, "icon")' + [Environment]::NewLine +
            '            ?: f4weNotificationIcon.takeIf { it != 0 }'
        $newService = $oldService.Replace($smallIconLine, $smallIconReplacement)
        if ($newService -eq $oldService) { throw "Could not find the Track Player small-icon hook in MusicService.kt." }
        $oldService = $newService
    }
    if ([IO.File]::ReadAllText($musicServicePath) -ne $oldService) {
        Backup-File $musicServicePath
        [IO.File]::WriteAllText($musicServicePath, $oldService, $utf8)
        Write-Host "Android media notification icon: F4WE"
    }
}
# Preserve the user's working bot interaction/env fixes: replace wording, not the whole bot.
Replace-BrandText "apps/bot/src/index.ts"
Replace-BrandText "apps/api/src/server.ts"
Write-Host "Done. Existing sessions, music, database and native player patches are preserved."
