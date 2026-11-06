# Creeaza fisierele secrete din .\secrets (nu suprascrie ce exista deja).
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path secrets | Out-Null
# Daca `docker compose up` a pornit inaintea acestui script, Docker a creat cate un FOLDER gol in locul fiecarui fisier lipsa
# (API-ul cade apoi cu EISDIR). Folderele goale se sterg si fisierele se creeaza normal; unul cu continut opreste scriptul.
Get-ChildItem secrets -Directory -Filter '*.txt' | ForEach-Object {
  if (Get-ChildItem $_.FullName -Force) { throw "secrets\$($_.Name) este un folder cu continut, nu un fisier. Verifica-l si sterge-l manual." }
  Remove-Item $_.FullName
  Write-Host "Folder gol creat de Docker in locul fisierului: secrets\$($_.Name) (sters, se creeaza fisierul)"
}

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
# Optional: cheia Resend pentru emailuri. Gol = emailurile sunt doar scrise in log, nu se trimit.
# Fisierul trebuie sa existe (chiar gol), altfel docker compose nu porneste.
if (Missing 'resend_api_key.txt') {
  $key = Read-Host 'Cheia Resend (optional; Enter = fara emailuri reale)'
  Write-Secret 'resend_api_key.txt' $key.Trim()
}
# Optional: Cloudinary pentru imaginile de coperta (cloudinary://<api_key>:<api_secret>@<cloud_name>).
# Gol = imaginile se salveaza local, in volumul Docker 'uploads'.
if (Missing 'cloudinary_url.txt') {
  $url = Read-Host 'CLOUDINARY_URL (optional; Enter = imagini pe disc)'
  Write-Secret 'cloudinary_url.txt' $url.Trim()
}
# Optionale: 'Continua cu Google' (secretul clientului OAuth) si Cloudflare Turnstile (cheia secreta). Gol = oprite.
if (Missing 'google_client_secret.txt') {
  $g = Read-Host 'GOOGLE_CLIENT_SECRET (optional; Enter = fara Google)'
  Write-Secret 'google_client_secret.txt' $g.Trim()
}
# Optionale: Stripe (bilete cu plata): cheia secreta si secretul webhook-ului. Ambele goale = doar evenimente gratuite.
if (Missing 'stripe_secret_key.txt') {
  $sk = Read-Host 'STRIPE_SECRET_KEY (optional; Enter = fara plati)'
  Write-Secret 'stripe_secret_key.txt' $sk.Trim()
}
if (Missing 'stripe_webhook_secret.txt') {
  $wh = Read-Host 'STRIPE_WEBHOOK_SECRET (optional; whsec_...)'
  Write-Secret 'stripe_webhook_secret.txt' $wh.Trim()
}
if (Missing 'turnstile_secret_key.txt') {
  $t = Read-Host 'TURNSTILE_SECRET_KEY (optional; Enter = fara verificare anti-robot)'
  Write-Secret 'turnstile_secret_key.txt' $t.Trim()
}
Write-Host 'Gata. Secretele sunt in .\secrets (ignorate de Git).'
