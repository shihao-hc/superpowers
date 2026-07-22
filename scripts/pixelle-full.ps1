$headers = @{Accept = "application/vnd.github.v3+json"}

Write-Host "=== releases ==="
try {
    $rels = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video/releases?per_page=5" -Headers $headers
    $rels | ForEach-Object {
        Write-Host "---"
        Write-Host "Tag:" $_.tag_name
        Write-Host "Date:" $_.published_at
        Write-Host "Body (first 500):" $_.body.Substring(0, [Math]::Min(500, $_.body.Length))
    }
} catch {
    Write-Host "Error:" $_
}

Write-Host ""
Write-Host "=== Issues (open) ==="
try {
    $issues = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video/issues?state=open&per_page=5" -Headers $headers
    Write-Host "Open issues:" $issues.Count
} catch {
    Write-Host "Error getting issues"
}