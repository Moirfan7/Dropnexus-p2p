# DropNexus Desktop Shortcut Creator
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $projectRoot -or -not (Test-Path "$projectRoot\launch.vbs")) {
    $projectRoot = "c:\Users\mi567\OneDrive\Desktop\p2p-file-share"
}

$iconPath = Join-Path $projectRoot "assets\dropnexus.ico"
$vbsPath = Join-Path $projectRoot "launch.vbs"

# Get user Desktop paths (Active Desktop + UserProfile Desktop)
$desktopFolders = @()
$specialDesktop = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
if ($specialDesktop -and (Test-Path $specialDesktop)) {
    $desktopFolders += $specialDesktop
}
$userDesktop = Join-Path $env:USERPROFILE "Desktop"
if ($userDesktop -and (Test-Path $userDesktop) -and ($userDesktop -notin $desktopFolders)) {
    $desktopFolders += $userDesktop
}

$wshShell = New-Object -ComObject WScript.Shell

foreach ($folder in $desktopFolders) {
    $shortcutPath = Join-Path $folder "DropNexus.lnk"
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "wscript.exe"
    $shortcut.Arguments = "`"$vbsPath`""
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.IconLocation = "$iconPath, 0"
    $shortcut.Description = "DropNexus - P2P Unlimited File Sharing"
    $shortcut.Save()
    Write-Host "Created Desktop Shortcut: $shortcutPath"
}
