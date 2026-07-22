$headers = @{Accept = "application/vnd.github.v3+json"}

$r = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video" -Headers $headers
Write-Host "=== AIDC-AI/Pixelle-Video ==="
Write-Host "Stars:" $r.stargazers_count
Write-Host "Forks:" $r.forks_count
Write-Host "Language:" $r.language
Write-Host "License:" $r.license.name
Write-Host "Created:" $r.created_at
Write-Host "Updated:" $r.updated_at
Write-Host ""
Write-Host "Description:"
Write-Host $r.description
Write-Host ""
Write-Host "Topics:" ($r.topics -join ", ")

Write-Host ""
Write-Host "=== Latest Release ==="
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video/releases/latest" -Headers $headers
Write-Host "Tag:" $rel.tag_name
Write-Host "Date:" $rel.published_at