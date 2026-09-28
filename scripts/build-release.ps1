param(
    [string]$SigningKeyPath = (Join-Path $HOME '.tauri\sheetview.key'),
    [switch]$UseEnvironmentKey
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $repoRoot 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$cargoManifest = Get-Content -LiteralPath (Join-Path $repoRoot 'src-tauri\Cargo.toml') -Raw
$version = $config.version
$expectedKeyHash = 'eaecbb31a8e833c589fc4c32ba922b5e8627a8ff182ff0228b2c9a1dcb595507'

if ($package.version -ne $version -or $cargoManifest -notmatch "(?m)^version = `"$([regex]::Escape($version))`"\r?$") {
    throw 'The Tauri, npm, and Cargo versions must match.'
}
$oldSigningKey = $env:TAURI_SIGNING_PRIVATE_KEY
$oldSigningPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
try {
    if ($UseEnvironmentKey) {
        if ([string]::IsNullOrWhiteSpace($oldSigningKey)) {
            throw 'TAURI_SIGNING_PRIVATE_KEY is empty.'
        }
        $keyContent = $oldSigningKey.Trim()
        $env:TAURI_SIGNING_PRIVATE_KEY = $keyContent
    } else {
        if (-not (Test-Path -LiteralPath $SigningKeyPath -PathType Leaf)) {
            throw "Signing key was not found at $SigningKeyPath"
        }
        $publicKeyPath = "$SigningKeyPath.pub"
        if (-not (Test-Path -LiteralPath $publicKeyPath -PathType Leaf)) {
            throw "Public key was not found at $publicKeyPath"
        }
        $publicKey = (Get-Content -LiteralPath $publicKeyPath -Raw).Trim()
        if ($config.plugins.updater.pubkey -ne $publicKey) {
            throw 'The signing key does not match the updater public key in tauri.conf.json.'
        }
        $keyContent = (Get-Content -LiteralPath $SigningKeyPath -Raw).Trim()
        $env:TAURI_SIGNING_PRIVATE_KEY = (Resolve-Path -LiteralPath $SigningKeyPath).Path
    }
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $keyHash = [Convert]::ToHexString($sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($keyContent))).ToLowerInvariant()
    } finally {
        $sha256.Dispose()
    }
    if ($keyHash -ne $expectedKeyHash) {
        throw 'The signing key does not match the key used by existing app releases.'
    }
    if ($null -eq $oldSigningPassword) {
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
    }
    Push-Location $repoRoot
    try {
        & npm run desktop:build:release
        if ($LASTEXITCODE -ne 0) {
            throw 'Tauri build failed.'
        }
    } finally {
        Pop-Location
    }
} finally {
    $env:TAURI_SIGNING_PRIVATE_KEY = $oldSigningKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $oldSigningPassword
}

$bundleDirectory = Join-Path $repoRoot 'src-tauri\target\release\bundle\nsis'
$installers = @(Get-ChildItem -LiteralPath $bundleDirectory -Filter "*_${version}_x64-setup.exe" -File)
if ($installers.Count -ne 1) {
    throw "Expected one x64 NSIS installer for version $version; found $($installers.Count)."
}
$installer = $installers[0]
$signaturePath = "$($installer.FullName).sig"
if (-not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
    throw "Tauri did not create the update signature at $signaturePath"
}

$stageDirectory = Join-Path $repoRoot ".release\v$version"
New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null
$assetName = "Sheetview_${version}_x64-setup.exe"
$assetPath = Join-Path $stageDirectory $assetName
Copy-Item -LiteralPath $installer.FullName -Destination $assetPath -Force
Copy-Item -LiteralPath $signaturePath -Destination "$assetPath.sig" -Force
$signature = (Get-Content -LiteralPath $signaturePath -Raw).Trim()

$release = [ordered]@{
    version = $version
    notes = 'See the release notes on GitHub.'
    platforms = [ordered]@{
        'windows-x86_64' = [ordered]@{
            url = "https://github.com/jwjp/sheetviewer/releases/download/v$version/$assetName"
            signature = $signature
        }
    }
}
$json = $release | ConvertTo-Json -Depth 5
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $stageDirectory 'latest.json'), "$json`n", $utf8)
$hash = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText((Join-Path $stageDirectory 'SHA256SUMS.txt'), "$hash  $assetName`n", $utf8)

Write-Host "Release assets are ready in $stageDirectory"
Write-Host 'Upload the installer, .sig, latest.json, and SHA256SUMS.txt to the matching GitHub release.'
