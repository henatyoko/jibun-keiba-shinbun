# JRA-VANの時系列オッズ(0B41: 単複枠)を過去レース分まとめて取得し、単勝オッズの推移をCSVに書き出す。
# 「締切直前にオッズが急落した馬はよく勝つのか」をバックテストするためのデータ集め用。
#
# 使い方(ConoHa VPS上で、JvLinkToImporterの取込が終わっているときに実行):
#   JV-Link は32bit COMなので、必ず32bit版PowerShellで実行すること。
#   C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File Fetch-JikeiretsuOdds.ps1 `
#     -SupabaseUrl https://xxxx.supabase.co -AnonKey eyJ... [-Days 365] [-OutFile .\jikeiretsu_tansho.csv]
#
# 公式な提供期間は過去1年分。途中で止めても、再実行すればCSVに取得済みのレースは飛ばして続きから取る。

param(
  [Parameter(Mandatory = $true)][string]$SupabaseUrl,
  [Parameter(Mandatory = $true)][string]$AnonKey,
  [int]$Days = 365,
  [string]$OutFile = ".\jikeiretsu_tansho.csv"
)

$ErrorActionPreference = "Stop"

if ([IntPtr]::Size -ne 4) {
  Write-Error "32bit版PowerShell(C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe)で実行してください"
  exit 1
}

# --- 対象レース一覧(JRA10場のみ)をSupabaseのrace_shosaiから取得 ---
$since = (Get-Date).AddDays(-$Days).ToString("yyyyMMdd") + "00000000"
$headers = @{ apikey = $AnonKey }
$raceCodes = @()
$offset = 0
while ($true) {
  $url = "$SupabaseUrl/rest/v1/race_shosai?select=race_code&race_code=gte.$since&keibajo_code=in.(01,02,03,04,05,06,07,08,09,10)&order=race_code.asc&limit=1000&offset=$offset"
  $rows = Invoke-RestMethod -Uri $url -Headers $headers
  if (-not $rows -or $rows.Count -eq 0) { break }
  $raceCodes += $rows | ForEach-Object { $_.race_code }
  if ($rows.Count -lt 1000) { break }
  $offset += 1000
}
$today = (Get-Date).ToString("yyyyMMdd")
$raceCodes = $raceCodes | Sort-Object -Unique | Where-Object { $_.Substring(0, 8) -lt $today }
Write-Host "対象レース: $($raceCodes.Count)件"

# --- 取得済みレースはスキップ(再開用) ---
$done = @{}
if (Test-Path $OutFile) {
  Get-Content $OutFile | Select-Object -Skip 1 | ForEach-Object { $done[$_.Split(",")[0]] = $true }
} else {
  "race_code,data_kubun,happyo_mmddhhmm,umaban,odds,ninki" | Out-File -FilePath $OutFile -Encoding ascii
}
Write-Host "取得済み: $($done.Count)件"

$jv = New-Object -ComObject "JVDTLab.JVLink"
$ret = $jv.JVInit("UNKNOWN")
if ($ret -ne 0) { Write-Error "JVInit失敗: $ret"; exit 1 }

# O1(単複枠オッズ)レコードの位置(JV-Data仕様書の1始まりバイト位置 → 0始まりに変換して使う)
#   3: データ区分(1=中間 2=前日売最終 3=最終 4=確定 5=確定(月) 9=中止 0=削除)
#  28: 発表月日時分(MMDDhhmm, 8桁)
#  44: 単勝オッズ 28頭分 × 8バイト(馬番2 + オッズ4(999.9倍→9999) + 人気2)
function Parse-O1([string]$rec, [string]$raceCode) {
  $kubun = $rec.Substring(2, 1)
  $happyo = $rec.Substring(27, 8)
  $lines = @()
  for ($i = 0; $i -lt 28; $i++) {
    $p = 43 + $i * 8
    $umaban = $rec.Substring($p, 2)
    $odds = $rec.Substring($p + 2, 4)
    $ninki = $rec.Substring($p + 6, 2)
    if ($umaban -notmatch '^\d\d$' -or $umaban -eq "00") { continue }
    if ($odds -notmatch '^\d{4}$' -or $odds -eq "0000") { continue } # 取消・除外・未発売
    $lines += "$raceCode,$kubun,$happyo,$umaban,$([int]$odds / 10),$ninki"
  }
  return $lines
}

$n = 0
foreach ($rc in $raceCodes) {
  $n++
  if ($done.ContainsKey($rc)) { continue }

  $ret = $jv.JVRTOpen("0B41", $rc)
  if ($ret -ne 0) {
    # -1: 該当データなし(提供期間外など)。その他はエラー
    if ($ret -ne -1) { Write-Warning "$rc JVRTOpen=$ret" }
    $jv.JVClose() | Out-Null
    continue
  }

  $out = New-Object System.Collections.Generic.List[string]
  while ($true) {
    $buff = ""; $size = 110000; $fname = ""
    $r = $jv.JVRead([ref]$buff, [ref]$size, [ref]$fname)
    if ($r -eq 0) { break }          # 全件読了
    if ($r -eq -1) { continue }      # ファイル切り替わり
    if ($r -lt -1) { Write-Warning "$rc JVRead=$r"; break }
    if ($buff.StartsWith("O1")) { (Parse-O1 $buff $rc) | ForEach-Object { $out.Add($_) } }
  }
  $jv.JVClose() | Out-Null

  if ($out.Count -gt 0) { $out | Out-File -FilePath $OutFile -Append -Encoding ascii }
  if ($n % 50 -eq 0) { Write-Host "$n / $($raceCodes.Count)" }
  Start-Sleep -Milliseconds 200
}

Write-Host "完了: $OutFile"
