param(
  [Parameter(Mandatory = $true)]
  [string]$Repository,
  [Parameter(Mandatory = $true)]
  [string]$Tag,
  [Parameter(Mandatory = $true)]
  [string]$TargetCommit,
  [Parameter(Mandatory = $true)]
  [string]$Name,
  [Parameter(Mandatory = $true)]
  [string]$BodyPath,
  [Parameter(Mandatory = $true)]
  [string[]]$AssetPaths
)

$ErrorActionPreference = "Stop"

$credentialInput = "protocol=https`nhost=github.com`n`n"
$credentialOutput = $credentialInput | git credential fill
$token = ($credentialOutput | Where-Object { $_ -like "password=*" } | Select-Object -First 1) -replace "^password=", ""
if (-not $token) {
  throw "No GitHub token was returned by Git Credential Manager."
}

$headers = @{
  Authorization = "Bearer $token"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

$body = Get-Content -LiteralPath $BodyPath -Raw
$release = $null
try {
  $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Repository/releases/tags/$Tag" -Method Get
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 404) {
    throw
  }
}

if (-not $release) {
  $payload = @{
    tag_name = $Tag
    target_commitish = $TargetCommit
    name = $Name
    body = $body
    draft = $false
    prerelease = $false
  } | ConvertTo-Json
  $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Repository/releases" -Method Post -Body $payload -ContentType "application/json"
}

foreach ($path in $AssetPaths) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing asset: $path"
  }

  $assetName = [System.IO.Path]::GetFileName($path)
  foreach ($asset in @($release.assets | Where-Object { $_.name -eq $assetName })) {
    Invoke-RestMethod -Headers $headers -Uri $asset.url -Method Delete | Out-Null
  }

  $uploadBase = ($release.upload_url -replace "\{.*$", "")
  $uploadUri = $uploadBase + "?name=" + [System.Uri]::EscapeDataString($assetName)
  Invoke-RestMethod -Headers $headers -Uri $uploadUri -Method Post -InFile $path -ContentType "application/octet-stream" | Out-Null
}

$updated = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Repository/releases/tags/$Tag" -Method Get
[pscustomobject]@{
  html_url = $updated.html_url
  tag_name = $updated.tag_name
  asset_count = @($updated.assets).Count
} | ConvertTo-Json -Compress
