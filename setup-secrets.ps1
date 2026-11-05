# Creeaza fisierele secrete din .\secrets (nu suprascrie ce exista deja).
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path secrets | Out-Null

function New-Secret {
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 40)
}
function Write-Secret($name, $value) {
  [IO.File]::WriteAllText((Join-Path (Join-Path (Get-Location) 'secrets') $name), $value)
}
function Missing($name) { -not (Test-Path (Join-Path 'secrets' $name)) }

if (Missing 'db_password.txt')  { Write-Secret 'db_password.txt' (New-Secret) }
if (Missing 'jwt_secret.txt')   { Write-Secret 'jwt_secret.txt' (New-Secret) }
if (Missing 'organizer_invite_code.txt') {
  $code = Read-Host 'Cod de invitatie pentru organizatori'
  Write-Secret 'organizer_invite_code.txt' $code.Trim()
}
Write-Host 'Gata. Secretele sunt in .\secrets (ignorate de Git).'
