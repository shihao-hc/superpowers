$headers = @{Accept = "application/vnd.github.v3+json"}

Write-Host "=== Readme ==="
$readme = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video/readme" -Headers $headers
$content = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($readme.content))
Write-Host $content.Substring(0, [Math]::Min(3000, $content.Length))

Write-Host ""
Write-Host "=== Topics ==="
$r = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video" -Headers $headers
Write-Host $r.topics -join ", "

Write-Host ""
Write-Host "=== Dependencies ==="
$deps = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video/contents/requirements.txt" -Headers $headers
if ($deps) {
    $depContent = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($deps.content))
    Write-Host $depContent.Substring(0, 1000)
}