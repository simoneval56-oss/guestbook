param(
  [string]$BaseUrl = "https://www.guesthomebook.it",
  [string]$OutputJson = "ops/seo/live-seo-latest.json"
)

$ErrorActionPreference = "Stop"

function Get-StatusAndContent {
  param(
    [Parameter(Mandatory = $true)][string]$Url
  )

  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
    return [pscustomobject]@{
      status = [int]$resp.StatusCode
      content = [string]$resp.Content
      error = $null
    }
  } catch {
    if ($_.Exception.Response) {
      $response = $_.Exception.Response
      $body = ""
      try {
        $sr = New-Object System.IO.StreamReader($response.GetResponseStream())
        $body = $sr.ReadToEnd()
        $sr.Close()
      } catch {
        $body = ""
      }
      return [pscustomobject]@{
        status = [int]$response.StatusCode
        content = [string]$body
        error = $_.Exception.Message
      }
    }
    return [pscustomobject]@{
      status = 0
      content = ""
      error = $_.Exception.Message
    }
  }
}

function Match-First {
  param(
    [string]$Text,
    [string]$Pattern
  )
  $m = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success -and $m.Groups.Count -gt 1) {
    return $m.Groups[1].Value.Trim()
  }
  return ""
}

$homeUrl = "$BaseUrl/"
$robotsUrl = "$BaseUrl/robots.txt"
$sitemapUrl = "$BaseUrl/sitemap.xml"

$homeResponse = Get-StatusAndContent -Url $homeUrl
$robotsResponse = Get-StatusAndContent -Url $robotsUrl
$sitemapResponse = Get-StatusAndContent -Url $sitemapUrl

$sitemapUrlCount = $null
try {
  [xml]$sx = $sitemapResponse.content
  $sitemapUrlCount = @($sx.urlset.url).Count
} catch {
  $sitemapUrlCount = $null
}

$title = Match-First -Text $homeResponse.content -Pattern "<title>(.*?)</title>"
$metaDescription = Match-First -Text $homeResponse.content -Pattern "<meta[^>]*name=['""]description['""][^>]*content=['""]([^'""]*)['""]"
$canonical = Match-First -Text $homeResponse.content -Pattern "<link[^>]*rel=['""]canonical['""][^>]*href=['""]([^'""]*)['""]"
$robotsHasSitemap = [bool]($robotsResponse.content -match "Sitemap:\s+$([regex]::Escape($sitemapUrl))")

$report = [pscustomobject]@{
  checked_at_utc = (Get-Date).ToUniversalTime().ToString("s") + "Z"
  base_url = $BaseUrl
  home_status = $homeResponse.status
  robots_status = $robotsResponse.status
  sitemap_status = $sitemapResponse.status
  robots_has_sitemap = $robotsHasSitemap
  sitemap_url_count = $sitemapUrlCount
  homepage_title = $title
  homepage_meta_description = $metaDescription
  homepage_canonical = $canonical
  errors = [pscustomobject]@{
    home = $homeResponse.error
    robots = $robotsResponse.error
    sitemap = $sitemapResponse.error
  }
}

$json = $report | ConvertTo-Json -Depth 6
$outDir = Split-Path -Parent $OutputJson
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}
$json | Set-Content -Path $OutputJson -Encoding UTF8

Write-Output $json
