param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'

$package = Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json
if ($env:WOSLICER_BUILD_PROFILE -notin @('debug', 'release')) { throw 'Invalid build profile' }
$targetRoot = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { 'src-tauri/target' }
$executable = Join-Path $targetRoot "$env:RUST_TARGET/$env:WOSLICER_BUILD_PROFILE/$($package.name).exe"
if ((Get-Item -LiteralPath $executable).Length -eq 0) { throw "Empty executable: $executable" }

$destination = if ($OutputDirectory) { $OutputDirectory } else { "release/$env:RELEASE_PLATFORM" }
$archive = "$destination/$($package.name)-$($package.version)-$env:RELEASE_PLATFORM-portable.zip"
$stage = Join-Path 'test-artifacts' ("portable-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -LiteralPath $executable -Destination $stage
foreach ($name in @('LICENSE', 'NOTICE', 'build-info.json')) {
  Copy-Item -LiteralPath "dist/app-tauri/$name" -Destination $stage -Recurse
}
$files = @(Get-ChildItem -LiteralPath $stage -Recurse -File)
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Compress-Archive -Path "$stage/*" -DestinationPath $archive -Force

$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $archive).Path)
try {
  $fileEntries = @($zip.Entries | Where-Object { $_.Name })
  if ($fileEntries.Count -ne $files.Count) { throw "Unexpected entry count in $archive" }
  foreach ($file in $files) {
    $name = [IO.Path]::GetRelativePath((Resolve-Path -LiteralPath $stage).Path, $file.FullName).Replace('\', '/')
    $entry = $zip.GetEntry($name)
    if ($null -eq $entry) { throw "Missing $name in $archive" }
    $stream = $entry.Open()
    try {
      $expected = (Get-FileHash -LiteralPath $file.FullName).Hash
      $actual = (Get-FileHash -InputStream $stream).Hash
      if ($actual -ne $expected) { throw "Archive entry differs from source: $name" }
    } finally {
      $stream.Dispose()
    }
  }
} finally {
  $zip.Dispose()
}
Write-Output "Verified $archive"
