$headers = @{Accept = "application/vnd.github.v3+json"}
$response = Invoke-RestMethod -Uri "https://api.github.com/search/repositories?q=pixelle+video+in:name&per_page=10" -Headers $headers
Write-Host "Total results:" $response.total_count
Write-Host ""
$response.items | ForEach-Object {
    Write-Host "Name:" $_.full_name
    Write-Host "  Stars:" $_.stargazers_count
    Write-Host "  Desc:" $_.description
    Write-Host ""
}