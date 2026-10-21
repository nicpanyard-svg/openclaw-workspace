param(
    [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$archivePath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $archivePath) { throw 'Output already exists. Choose a new filename.' }
$rootFiles = @('.env.example', '.gitignore', '.nvmrc', 'AGENTS.md', 'README.md', 'HANDOFF.txt',
    'FIELD-MAPPING-CHECKLIST.md', 'PDF_SIGNING_NOTES.md', 'package.json', 'package-lock.json',
    'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'postcss.config.mjs', 'eslint.config.mjs',
    'vercel.json', 'proxy.ts')
$selected = @()
foreach ($relative in $rootFiles) {
    $candidate = Join-Path $sourceRoot $relative
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Required file missing: $relative" }
    $selected += Get-Item -LiteralPath $candidate
}
foreach ($directory in @('app', 'public', 'scripts', 'docs')) {
    $selected += Get-ChildItem -LiteralPath (Join-Path $sourceRoot $directory) -File -Recurse
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
$manifest = [Collections.Generic.List[string]]::new()
try {
    foreach ($file in ($selected | Sort-Object FullName -Unique)) {
        $relative = $file.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
        if ($relative -match '(^|/)(node_modules|\.next|\.git|\.vercel|tmp)(/|$)' -or
            $relative -match '(^|/)\.env(\.|$)' -and $relative -ne '.env.example' -or
            $relative -match '\.(log|tsbuildinfo)$') { throw "Excluded file reached packaging list: $relative" }
        $entryName = "quote-tool-app/$relative"
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $manifest.Add("$hash  $entryName")
    }
    $entry = $archive.CreateEntry('MANIFEST.sha256')
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.WriteLine(($manifest -join "`n")) } finally { $writer.Dispose() }
    $entry = $archive.CreateEntry('START-HERE.txt')
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try {
        $writer.WriteLine('RapidQuote DevOps handoff - October 21, 2026')
        $writer.WriteLine('Read quote-tool-app/README.md and quote-tool-app/docs/DEVOPS-HANDOFF.md first.')
        $writer.WriteLine('Validation and remaining release requirements: quote-tool-app/docs/VALIDATION.txt')
        $writer.WriteLine('This package contains source and supporting assets, not live browser-saved customer records.')
        $writer.WriteLine('Unzip, install Node.js 24, open quote-tool-app, then run npm ci and npm run dev.')
        $writer.WriteLine('Production rollout requires the documented security, identity, storage, and hosting acceptance steps.')
    } finally { $writer.Dispose() }
} finally { $archive.Dispose() }
# Reopen and hash every payload, ensuring the archive is complete and readable.
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    foreach ($line in $manifest) {
        $expected, $name = $line -split '  ', 2
        $entry = $archive.GetEntry($name)
        if (-not $entry) { throw "Missing ZIP entry: $name" }
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose(); $stream.Dispose() }
        if ($actual -ne $expected) { throw "ZIP integrity mismatch: $name" }
    }
    Write-Output "Verified $($manifest.Count) source and documentation files."
} finally { $archive.Dispose() }
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
