$headers = @{Accept = "application/vnd.github.v3+json"}

Write-Host "=== Dependencies ==="
try {
    $deps = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video/contents/requirements.txt" -Headers $headers
    if ($deps) {
        $depContent = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($deps.content))
        Write-Host $depContent
    }
} catch {
    Write-Host "Not found"
}

Write-Host ""
Write-Host "=== Project Structure ==="
$tree = Invoke-RestMethod -Uri "https://api.github.com/repos/AIDC-AI/Pixelle-Video/git/trees/main?recursive=1" -Headers $headers
$tree.tree | Where-Object { $_.type -eq "blob" -and $_.path -notmatch "/" } | Select-Object -First 20 path, type

Write-Host ""
Write-Host "=== Key Directories ==="
$tree.tree | Where-Object { $_.type -eq "tree" } | Select-Object -First 20 path