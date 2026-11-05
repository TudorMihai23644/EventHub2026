# EventHub

Aplicație web pentru organizarea evenimentelor și gestionarea înscrierilor.
**Stack:** React (Vite, TypeScript) · NestJS (TypeScript, REST) · PostgreSQL · TypeORM · JWT.

## Pornire rapidă

```bash
# 0. Secretele (o singură dată): generează parolele și cere codul de invitație
#    Windows:  powershell -ExecutionPolicy Bypass -File .\setup-secrets.ps1
#    Mac/Linux: sh setup-secrets.sh

# 1. Backend + PostgreSQL (Docker)
docker compose up --build        # API pe http://localhost:3000/api

# 2. Frontend
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

Fără Docker pentru backend: pornește doar `docker compose up db`, apoi
`cd backend && cp .env.example .env`, completează în `.env` aceleași valori ca în `secrets/*.txt` și rulează `npm install && npm run start:dev`.

Datele sunt păstrate în volumul Docker `pgdata` și rămân după repornire.
Tabelele se creează prin migrări, rulate automat la pornirea API-ului (vezi [Migrări](#migrări)). O bază creată înainte de migrări este recunoscută și păstrată.

## Configurare

- **Adresa API-ului (frontend):** `VITE_API_URL` în `frontend/.env` (implicit `http://localhost:3000/api`, din `.env.development`).
  Toate cererile trec prin `src/api.ts`, care folosește `API_URL` din `src/config.ts`; nu există adrese scrise direct în pagini.
- **Conturi de organizator:** se creează doar cu codul de invitație din `secrets/organizer_invite_code.txt`.
  Dacă lipsește, nimeni nu se poate înregistra ca organizator.
  Participanții se înregistrează liber. Codul se dă doar persoanelor de încredere.

## Secrete

Nicio valoare secretă nu este în cod sau în `docker-compose.yml`. Sunt în `secrets/`
(`db_password.txt`, `jwt_secret.txt`, `organizer_invite_code.txt`), ignorat de Git. Docker Compose le
Lrdeclară în secțiunea `secrets:` și le montează în containere ca fișiere în `/run/secrets`,
deci nu apar în `docker inspect`, în imagini sau în `docker compose config`. Backend-ul le citește prin
Lr`NUME_FILE` (vezi `backend/src/common/secrets.ts`) și nu pornește dacă lipsește `JWT_SECRET` sau parola bazei de date.
PostgreSQL este expus doar pe `127.0.0.1`. Frontend-ul nu conține secrete: variabilele `VITE_*` ajung în browser, deci acolo se pune doar adresa publică a API-ului.

Dacă schimbi `db_password.txt` după ce baza a fost creată, rulează `docker compose down -v` (șterge datele locale), altfel parola din volum rămâne cea veche.

## Teste

```bash
cd backend && npm test
```
Teste unitare pentru regulile de înscriere (duplicat, capacitate, eveniment trecut, succes, eveniment inexistent), anulare (după începere, neînscris, lock), modificarea capacității (sub numărul de înscriși, alt organizator, lock), înregistrarea organizatorilor (cod lipsă, greșit, neconfigurat, corect), limitarea cererilor (429 după limită, IP + email, rute nelimitate, comutatorul Swagger) , setările bazei de date (fără `synchronize`, migrări, `DB_MIGRATIONS_RUN`), validarea parametrilor de listare și `escapeLike`.

**Teste de integrare** (pe un PostgreSQL real, cu schema creată de migrări; au nevoie de Docker):

```bash
cd backend
npm run test:db:up     # pornește un PostgreSQL temporar pe 127.0.0.1:55432 (baza eventhub_test)
npm run test:int       # paginare, filtrul de locuri libere, căutare cu % și _, rezumatul organizatorului
npm run test:db:down   # oprește și șterge containerul
```

Testele de integrare șterg toate tabelele din baza de test și refuză să ruleze pe o bază al cărei nume nu conține „test”.
Altă bază: `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`.

## API

Documentație interactivă (poți trimite orice cerere din browser): `http://localhost:3000/api/docs`.
Este pornită implicit în afara producției și în `docker compose` local (`SWAGGER_ENABLED=true`); într-o instalare de producție lipsește, dacă nu setezi `SWAGGER_ENABLED=true`.
Toate rutele au prefixul `/api` (ex. `POST /api/auth/login`). URI-urile sunt definite într-un singur loc:
`backend/src/common/routes.ts` (backend) și `frontend/src/endpoints.ts` (frontend).

| Metodă | Rută | Acces | Note |
|---|---|---|---|
| GET | `/health` | public | verifică API-ul și conexiunea la PostgreSQL (200 / 503) |
| POST | `/auth/register` | public | 201, `{accessToken, user}`; rolul `ORGANIZER` cere `inviteCode` valid, altfel 403; 429 după 10 conturi/oră de pe același IP |
| POST | `/auth/login` | public | 200 / 401 / 429 (5/min per cont + IP, 30/min per IP) |
| POST | `/auth/logout` | autentificat | 204; JWT este stateless, clientul șterge token-ul |
| GET | `/auth/me` | autentificat | |
| GET | `/events?search=&sort=asc\|desc&available=true&page=1&limit=20` | public | doar evenimente viitoare; răspuns paginat `{ items, total, page, limit, totalPages }`; `limit` maxim 50, `search` maxim 100 de caractere (`%` și `_` se caută literal); 400 pentru valori invalide |
| GET | `/events/:id/registrations` | organizator proprietar | lista participanților înscriși |
| GET | `/events/:id` | public | include `registeredCount`, `availableSeats` |
| GET | `/events/mine` | organizator | dashboard cu numărul de înscrieri |
| GET | `/events/mine/summary` | organizator | `{eventsCount, upcomingCount, totalRegistrations}` |
| POST | `/events` | organizator | 201 / 400 |
| PATCH | `/events/:id` | organizator proprietar | 403 dacă nu este proprietar |
| DELETE | `/events/:id` | organizator proprietar | 204 |
| POST | `/events/:id/registrations` | participant | 201 / 400 (trecut) / 409 (duplicat, plin) |
| DELETE | `/events/:id/registrations` | participant | 204 / 400 (început) / 404 |
| GET | `/registrations/me` | participant | |

**Toată logica este în API.** Frontend-ul doar afișează răspunsurile. Evenimentele vin cu starea calculată pe server
(`status`: OPEN/FULL/PAST, `isRegistered`, `canRegister`, `canCancel`, `canEdit`, `occupancyPercent`), iar erorile de validare
vin ca `{ message, fields: { câmp: mesaj } }` și se afișează lângă fiecare câmp. Rutele `GET /events` și `GET /events/:id`
sunt publice, dar adaptează răspunsul dacă cererea are token.

Logout se face pe client prin ștergerea token-ului JWT.

## Migrări

Schema bazei de date se schimbă **doar prin migrări** (`backend/src/database/migrations`), niciodată automat (`synchronize` este oprit).
Setările conexiunii sunt într-un singur loc: `backend/src/database/data-source.ts`, folosit și de aplicație, și de CLI-ul TypeORM.

- La pornire, API-ul rulează migrările noi (`DB_MIGRATIONS_RUN`, implicit `true`).
- Prima migrare (`InitialSchema`) recunoaște o bază creată înainte de migrări: nu creează nimic, doar se marchează ca aplicată. Datele rămân.

**Cum schimbi schema** (din `backend/`, cu baza pornită):

```bash
# 1. modifici entitatea (ex. events/event.entity.ts)
npm run migration:generate -- src/database/migrations/NumeSchimbare   # 2. generează migrarea
# 3. citești fișierul generat, apoi îl adaugi în git
npm run migration:run      # 4. aplică (sau repornește API-ul)
```

| Comandă | Ce face |
|---|---|
| `npm run migration:show` | lista migrărilor și care sunt aplicate (`[X]`) |
| `npm run migration:check` | eșuează dacă entitățile și migrările diferă (o migrare uitată) |
| `npm run migration:revert` | anulează ultima migrare (atenție: `InitialSchema` șterge toate tabelele) |
| `npm run migration:run:prod` | rulează migrările compilate, în imaginea Docker |

Cu mai multe instanțe ale API-ului pornite simultan: setează `DB_MIGRATIONS_RUN=false` și rulează `migration:run:prod` o singură dată, ca pas separat de deploy.

## Securitate

- **Limitarea cererilor** (`@nestjs/throttler`, global). Limitele sunt într-un singur loc: `backend/src/common/security.ts`.
  - `POST /auth/login`: 5 încercări/minut per IP + email (ghicirea parolei unui cont) și 30/minut per IP (multe conturi). Utilizatorii din aceeași rețea nu se blochează între ei.
  - `POST /auth/register`: 10/oră per IP. Celelalte rute: 120/minut per IP. `GET /health` nu este limitat.
  - Peste limită: `429` cu `{ message: "Prea multe încercări..." }` și antetul `Retry-After`.
  - Contoarele sunt în memorie: se resetează la repornire și nu sunt partajate între mai multe instanțe (pentru asta: stocare Redis).
  - În spatele unui reverse proxy setează `TRUST_PROXY` (ex. `1`), altfel toți utilizatorii ar avea IP-ul proxy-ului.
- **Antete de securitate** cu `helmet` (fără `X-Powered-By`, cu HSTS, `nosniff`, `X-Frame-Options` etc.). Content-Security-Policy este oprit doar cât timp Swagger este pornit.
- **Swagger** (`/api/docs`) doar când `SWAGGER_ENABLED=true` sau în afara producției.

## Reguli de business (în backend)

- Fără înscrieri duplicate: verificare în serviciu + constrângere `UNIQUE(userId, eventId)` în PostgreSQL.
- Capacitatea nu se depășește: înscrierea rulează într-o tranzacție cu `pessimistic_write` pe rândul evenimentului, deci cererile simultane nu pot trece de limită.
- Nu există înscriere la evenimente trecute; evenimentele noi trebuie să fie în viitor.
- Înscrierea nu se mai poate anula după începerea evenimentului (400). Anularea rulează în aceeași tranzacție cu lock pe eveniment ca înscrierea.
- Doar organizatorul proprietar poate edita sau șterge (guard de rol + verificare de proprietate → 403).
- Capacitatea unui eveniment nu poate fi redusă sub numărul de înscriși. Modificarea rulează într-o tranzacție cu același lock, deci o înscriere simultană nu poate depăși noua capacitate.
- Validare cu `class-validator` (`whitelist` + `forbidNonWhitelisted`), parole hash-uite cu bcrypt.

## Structura

```
backend/src/{auth,users,events,registrations,common}   # module NestJS cu responsabilități separate
backend/src/database/{data-source.ts,migrations/}      # setările bazei de date și migrările
frontend/src/{pages,auth.tsx,api.ts,ui.tsx}     # pagini, context de autentificare, client HTTP
```

## Bonus incluse

Sortare după dată, filtrare după locuri libere, dashboard organizator cu număr de înscrieri, teste automate, Docker Compose.
