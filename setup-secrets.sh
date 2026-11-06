#!/usr/bin/env sh
# Creează fișierele secrete din ./secrets (nu suprascrie ce există deja).
set -e
mkdir -p secrets
gen() { head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-48; }
[ -f secrets/db_password.txt ] || gen > secrets/db_password.txt
[ -f secrets/jwt_secret.txt ] || gen > secrets/jwt_secret.txt
if [ ! -f secrets/organizer_invite_code.txt ]; then
  printf 'Cod de invitatie pentru organizatori: '
  read code
  printf '%s' "$code" > secrets/organizer_invite_code.txt
fi
# Opțional: cheia Resend pentru emailuri. Gol = emailurile sunt doar scrise în log, nu se trimit.
# Fișierul trebuie să existe (chiar gol), altfel docker compose nu pornește.
if [ ! -f secrets/resend_api_key.txt ]; then
  printf 'Cheia Resend (optional; Enter = fara emailuri reale): '
  read key
  printf '%s' "$key" > secrets/resend_api_key.txt
fi
# Opțional: Cloudinary pentru imaginile de copertă (cloudinary://<api_key>:<api_secret>@<cloud_name>).
# Gol = imaginile se salvează local, în volumul Docker „uploads”.
if [ ! -f secrets/cloudinary_url.txt ]; then
  printf 'CLOUDINARY_URL (optional; Enter = imagini pe disc): '
  read url
  printf '%s' "$url" > secrets/cloudinary_url.txt
fi
# Opționale: „Continuă cu Google” (secretul clientului OAuth) și Cloudflare Turnstile (cheia secretă). Gol = oprite.
if [ ! -f secrets/google_client_secret.txt ]; then
  printf 'GOOGLE_CLIENT_SECRET (optional; Enter = fara Google): '
  read gsecret
  printf '%s' "$gsecret" > secrets/google_client_secret.txt
fi
if [ ! -f secrets/turnstile_secret_key.txt ]; then
  printf 'TURNSTILE_SECRET_KEY (optional; Enter = fara verificare anti-robot): '
  read tsecret
  printf '%s' "$tsecret" > secrets/turnstile_secret_key.txt
fi
chmod 644 secrets/*.txt   # imaginea postgres citește fișierul ca alt utilizator
echo "Gata. Secretele sunt in ./secrets (ignorate de Git)."
