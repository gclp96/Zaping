# ZFILES-R2-02A: create one synthetic object locally; NO network or credentials.
param([string]$OutputDirectory = [System.IO.Path]::GetTempPath())

$ErrorActionPreference = 'Stop'
$companyId = [guid]::NewGuid().ToString('D')
$documentId = [guid]::NewGuid().ToString('D')
$attachmentId = [guid]::NewGuid().ToString('D')
$objectKey = "private/$companyId/$documentId/$attachmentId"
$localPath = Join-Path $OutputDirectory $attachmentId

if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) {
    throw 'Output directory must already exist'
}
if (Test-Path -LiteralPath $localPath) {
    throw 'Refusing to overwrite an existing fixture'
}

$payload = "ZAPING-R2-QA-SYNTHETIC-ONLY`n$([guid]::NewGuid())`n"
[System.IO.File]::WriteAllBytes(
    $localPath,
    [System.Text.Encoding]::UTF8.GetBytes($payload)
)

Write-Output 'Synthetic QA file created locally; NOT a fiscal or medical document.'
Write-Output "Local file: $localPath"
Write-Output "Private QA object key: $objectKey"
Write-Output "R2_QA_FIXTURE_COMPANY_ID=$companyId"
Write-Output "R2_QA_FIXTURE_OBJECT_KEY=$objectKey"
Write-Output "R2_QA_FIXTURE_SHA256=$((Get-FileHash -LiteralPath $localPath -Algorithm SHA256).Hash.ToLowerInvariant())"
Write-Output "R2_QA_FIXTURE_SIZE_BYTES=$((Get-Item -LiteralPath $localPath).Length)"
Write-Output 'This script does not upload data or contact Cloudflare.'
