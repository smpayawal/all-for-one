$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repository = if ($env:AFO_REPOSITORY) { $env:AFO_REPOSITORY } else { "smpayawal/all-for-one" }
$ApiUrl = if ($env:AFO_RELEASE_API_URL) { $env:AFO_RELEASE_API_URL } else { "https://api.github.com/repos/$Repository/releases?per_page=20" }
$DownloadBase = if ($env:AFO_RELEASE_DOWNLOAD_BASE) { $env:AFO_RELEASE_DOWNLOAD_BASE } else { "https://github.com/$Repository/releases/download" }
$InstallDir = if ($env:AFO_INSTALL_DIR) { $env:AFO_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\All-For-One" }
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)

function Fail([string]$Message) {
	throw "All-For-One install failed: $Message"
}

function Resolve-Tag {
	if ($env:AFO_VERSION) {
		if ($env:AFO_VERSION.StartsWith("afo-v")) { return $env:AFO_VERSION }
		return "afo-v$($env:AFO_VERSION)"
	}

	$headers = @{ "User-Agent" = "All-For-One-Installer" }
	$releases = Invoke-RestMethod -Uri $ApiUrl -Headers $headers
	$release = $releases | Where-Object { -not $_.draft } | Select-Object -First 1
	if (-not $release -or -not $release.tag_name) { Fail "no published All-For-One release was found" }
	return [string]$release.tag_name
}

$architecture = switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) {
	"X64" { "x64" }
	"Arm64" { "arm64" }
	default { Fail "unsupported architecture: $([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture)" }
}

$tag = Resolve-Tag
if ($tag -notmatch "^afo-v[0-9A-Za-z.-]+$") { Fail "invalid release version: $tag" }
$asset = "all-for-one-windows-$architecture.zip"
$releaseUrl = "$DownloadBase/$tag"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "all-for-one-$([guid]::NewGuid().ToString('N'))"
$archive = Join-Path $tempDir $asset
$checksums = Join-Path $tempDir "SHA256SUMS"
$extracted = Join-Path $tempDir "extracted"

try {
	New-Item -ItemType Directory -Force -Path $tempDir, $extracted | Out-Null
	Invoke-WebRequest -Uri "$releaseUrl/$asset" -OutFile $archive
	Invoke-WebRequest -Uri "$releaseUrl/SHA256SUMS" -OutFile $checksums

	$checksumLine = Get-Content $checksums | Where-Object { $_ -match "\s\*?$([regex]::Escape($asset))$" } | Select-Object -First 1
	if (-not $checksumLine) { Fail "checksum for $asset was not found" }
	$expected = ($checksumLine -split "\s+")[0].ToLowerInvariant()
	$actual = (Get-FileHash -Algorithm SHA256 -Path $archive).Hash.ToLowerInvariant()
	if ($actual -ne $expected) { Fail "checksum verification failed for $asset" }

	Expand-Archive -LiteralPath $archive -DestinationPath $extracted -Force
	if (-not (Test-Path (Join-Path $extracted "allforone.exe"))) {
		Fail "release archive does not contain allforone.exe"
	}

	$parent = Split-Path -Parent $InstallDir
	New-Item -ItemType Directory -Force -Path $parent | Out-Null
	if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
	Move-Item -Path $extracted -Destination $InstallDir

	if ($env:AFO_SKIP_PATH -ne "1") {
		$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
		$pathEntries = @($userPath -split ";" | Where-Object { $_ })
		if (-not ($pathEntries | Where-Object { $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\') })) {
			$newPath = if ($userPath) { "$userPath;$InstallDir" } else { $InstallDir }
			[Environment]::SetEnvironmentVariable("Path", $newPath, "User")
		}
		if (-not (($env:Path -split ";") | Where-Object { $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\') })) {
			$env:Path = "$env:Path;$InstallDir"
		}
	}

	Write-Host "Installed All-For-One $($tag.Substring(5))"
	Write-Host "Run: allforone"
}
finally {
	if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
}
