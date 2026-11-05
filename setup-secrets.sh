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
chmod 644 secrets/*.txt   # imaginea postgres citește fișierul ca alt utilizator
echo "Gata. Secretele sunt in ./secrets (ignorate de Git)."
