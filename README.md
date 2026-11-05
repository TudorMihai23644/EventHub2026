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
(`db_password.txt`, `jwt_secret.txt`, `organizer_invite_code.txt`, `resend_api_key.txt`), ignorat de Git. Docker Compose le
declară în secțiunea `secrets:` și le montează în containere ca fișiere în `/run/secrets`,
deci nu apar în `docker inspect`, în imagini sau în `docker compose config`. Backend-ul le citește prin
`NUME_FILE` (vezi `backend/src/common/secrets.ts`) și nu pornește dacă lipsește `JWT_SECRET` sau parola bazei de date.
PostgreSQL este expus doar pe `127.0.0.1`. Frontend-ul nu conține secrete: variabilele `VITE_*` ajung în browser, deci acolo se pune doar adresa publică a API-ului.

Dacă schimbi `db_password.txt` după ce baza a fost creată, rulează `docker compose down -v` (șterge datele locale), altfel parola din volum rămâne cea veche.

`resend_api_key.txt` este opțional, dar fișierul trebuie să existe (poate fi gol), altfel `docker compose` nu pornește.
Dacă ai rulat scriptul de secrete înainte de emailuri, rulează-l din nou: creează doar fișierele care lipsesc.

## Teste

```bash
cd backend && npm test
```
Teste unitare pentru regulile de înscriere (duplicat, capacitate, eveniment trecut, succes, eveniment inexistent), anulare (după începere, neînscris, lock), modificarea capacității (sub numărul de înscriși, alt organizator, lock), înregistrarea organizatorilor (cod lipsă, greșit, neconfigurat, corect), limitarea cererilor (429 după limită, IP + email, rute nelimitate, comutatorul Swagger), setările bazei de date (fără `synchronize`, migrări, `DB_MIGRATIONS_RUN`), validarea (parametrii de listare, mesajele câmp cu câmp, `null` la editare), `escapeLike`, emailurile (conținut, escapare HTML, ora din București, reîncercări, `ResendMailer` pe un server Resend fals), contul (confirmarea emailului cerută la înscriere, mesajul 429 cu timpul rămas, emailurile de resetare/confirmare) și codificarea fișierelor sursă (fără text dublu codificat).

**Teste de integrare** (pe un PostgreSQL real, cu schema creată de migrări; au nevoie de Docker):

```bash
cd backend
npm run test:db:up     # pornește un PostgreSQL temporar pe 127.0.0.1:55432 (baza eventhub_test)
npm run test:int       # paginare, căutare, rezumat; emailuri (coadă, rollback, 2 worker-e); cont (linkuri, resetare, sesiuni)
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
| POST | `/auth/register` | public | 201, `{accessToken, user}` + cookie `eh_refresh`; rolul `ORGANIZER` cere `inviteCode` valid, altfel 403; 429 după 10 conturi/oră de pe același IP |
| POST | `/auth/login` | public | 200 `{accessToken, user}` + cookie `eh_refresh` / 401 / 429 (5/min per cont + IP, 30/min per IP) |
| POST | `/auth/refresh` | cookie `eh_refresh` + antet `X-EventHub-Client: web` | 200 `{accessToken, user}` + cookie nou; 401 (sesiune invalidă, cookie șters); 403 fără antet; 30/min per IP |
| POST | `/auth/logout` | cookie + antet `X-EventHub-Client` | 204; închide sesiunea acestui dispozitiv și șterge cookie-ul (merge și cu access token-ul expirat) |
| POST | `/auth/logout-all` | autentificat + antet `X-EventHub-Client` | 204; închide toate sesiunile contului, de pe toate dispozitivele |
| GET | `/auth/me` | autentificat | `{ id, name, email, role, emailVerified }` |
| POST | `/auth/password/forgot` | public | `{ email }` → mereu 202 cu același mesaj (nu dezvăluie dacă adresa are cont); 429 după 3/oră per adresă + IP, 20/oră per IP |
| POST | `/auth/password/reset` | public | `{ token, password }` → 200; 400 `TOKEN_INVALID` (link inexistent, expirat sau folosit); închide toate sesiunile contului |
| POST | `/auth/email/verify` | public | `{ token }` → 200; 400 `TOKEN_INVALID` |
| POST | `/auth/email/resend` | autentificat | 202 cu un link nou (cel vechi se anulează); 400 dacă adresa e deja confirmată; 5/oră per IP |
| GET | `/events?search=&sort=asc\|desc&available=true&page=1&limit=20` | public | doar evenimente viitoare; răspuns paginat `{ items, total, page, limit, totalPages }`; `limit` maxim 50, `search` maxim 100 de caractere (`%` și `_` se caută literal); 400 pentru valori invalide |
| GET | `/events/:id/registrations` | organizator proprietar | lista participanților înscriși |
| GET | `/events/:id` | public | include `registeredCount`, `availableSeats` |
| GET | `/events/mine` | organizator | dashboard cu numărul de înscrieri |
| GET | `/events/mine/summary` | organizator | `{eventsCount, upcomingCount, totalRegistrations, totalWaiting}` |
| POST | `/events` | organizator cu email confirmat | 201 / 400 / 403 `EMAIL_NOT_VERIFIED` |
| PATCH | `/events/:id` | organizator proprietar | 403 dacă nu este proprietar |
| DELETE | `/events/:id` | organizator proprietar | 204 |
| POST | `/events/:id/registrations` | participant cu email confirmat | 201 / 400 (trecut) / 403 `EMAIL_NOT_VERIFIED` / 409 (duplicat, plin) |
| DELETE | `/events/:id/registrations` | participant | 204 / 400 (început) / 404; locul eliberat merge la primul de pe lista de așteptare |
| GET | `/registrations/me` | participant | |
| POST | `/events/:id/waitlist` | participant cu email confirmat | 201 `{ position, waitlistCount }`; doar când evenimentul e plin (altfel 409 `SEATS_AVAILABLE`); 409 dacă ești înscris / deja pe listă; 400 eveniment trecut |
| DELETE | `/events/:id/waitlist` | participant | 204 / 404 |
| GET | `/events/:id/waitlist` | organizator proprietar | cine așteaptă, în ordine |
| GET | `/waitlist/me` | participant | listele de așteptare proprii, cu locul pe fiecare |

**Toată logica este în API.** Frontend-ul doar afișează răspunsurile. Evenimentele vin cu starea calculată pe server
(`status`: OPEN/FULL/PAST, `isRegistered`, `canRegister`, `mustVerifyEmail`, `canCancel`, `canEdit`, `occupancyPercent`,
`waitlistCount`, `isWaitlisted`, `waitlistPosition`, `canJoinWaitlist`, `canLeaveWaitlist`), iar erorile de validare
vin ca `{ message, fields: { câmp: mesaj } }` și se afișează lângă fiecare câmp. Rutele `GET /events` și `GET /events/:id`
sunt publice, dar adaptează răspunsul dacă cererea are token.

## Lista de așteptare

- Când un eveniment viitor este plin, un participant cu email confirmat poate intra pe **lista de așteptare** și își vede locul („locul 3 din 7”).
- Când se eliberează un loc (cineva își anulează înscrierea sau organizatorul mărește capacitatea), **primul de pe listă este înscris automat**
  și primește emailul „Ai primit un loc la «Titlu»”; organizatorul primește „Înscriere nouă … (de pe lista de așteptare)”.
  Dacă nu mai poate veni, își anulează înscrierea și locul trece la următorul.
- Ordinea: primul venit, primul servit. Lista nu are limită. Promovarea continuă până la începerea evenimentului.
- **Invariant:** cât timp cineva așteaptă, evenimentul nu are locuri libere. Toate operațiile pe locuri și pe listă (înscriere, anulare,
  intrare/ieșire de pe listă, modificarea capacității, ștergere) blochează același rând al evenimentului, deci regula ține și la cereri simultane.
- Cei de pe listă primesc și emailurile „s-a schimbat evenimentul” / „evenimentul a fost anulat”.
- Lista este într-un tabel separat (`waitlist_entries`): tot ce numără locurile ocupate rămâne neschimbat.

## Sesiuni

| | Access token | Refresh token |
|---|---|---|
| Ce este | JWT | 32 de octeți aleatori |
| Durată | **15 minute** | **30 de zile**, reînnoit la fiecare folosire; **maximum 90 de zile** de la autentificare |
| În browser | **doar în memorie** (dispare la reîncărcarea paginii) | cookie **httpOnly** `eh_refresh` (JavaScript nu îl poate citi), `SameSite=Lax`, trimis doar spre `/api/auth` |
| Pe server | nu se salvează | doar hash-ul SHA-256, în `refresh_tokens` |

- La încărcarea paginii, frontend-ul cere `POST /auth/refresh`: cu un cookie valid primește un access token nou, deci rămâi autentificat.
  Când access token-ul expiră, `api.ts` îl reînnoiește automat o dată și repetă cererea. Nimic nu se mai păstrează în `localStorage`.
- **Rotație:** la fiecare reînnoire, refresh token-ul se înlocuiește cu unul nou. Dacă un token deja înlocuit este folosit din nou după 30 de secunde,
  înseamnă că cineva are o copie: toată acea autentificare este revocată (pe toate dispozitivele unde ajunsese) și apare un avertisment în log.
  În primele 30 de secunde, token-ul vechi mai primește doar un access token: acoperă două tab-uri care reînnoiesc în același timp.
  În browser, tab-urile își așteaptă rândul (Web Locks), iar logout într-un tab îi deconectează și pe celelalte (BroadcastChannel).
- **Logout** închide sesiunea dispozitivului curent; **logout-all** le închide pe toate (și invalidează imediat access token-urile, prin `tokenVersion`).
  Resetarea parolei închide de asemenea toate sesiunile. Token-urile expirate sau revocate de peste 7 zile se șterg zilnic, la 03:00.
- **CSRF:** rutele care folosesc cookie-ul cer antetul `X-EventHub-Client: web`. Un formular de pe alt site nu poate trimite antete proprii,
  iar CORS acceptă credențiale doar de la originile din `CORS_ORIGIN`.
- **Frontend-ul și API-ul trebuie să fie pe același site** (ex. `eventhub.ro` + `api.eventhub.ro`, sau API-ul sub `eventhub.ro/api`; `localhost:5173` +
  `localhost:3000` contează ca același site). Pe două domenii fără legătură, cookie-ul ar fi „third-party” și multe browsere (ex. Safari) îl blochează.

| Variabilă | Implicit | Rol |
|---|---|---|
| `COOKIE_SECURE` | `true` în producție | cookie doar prin HTTPS. `docker-compose.yml` îl pune pe `false` (local pe http) |
| `COOKIE_SAMESITE` | `lax` | `strict` / `none` (`none` forțează Secure) |
| `COOKIE_DOMAIN` | — | ex. `.eventhub.ro`, dacă frontend-ul și API-ul sunt pe subdomenii diferite |

## Cont: confirmarea emailului, resetarea parolei

- **Confirmarea adresei.** La înregistrare se trimite un link de confirmare (valabil 24 de ore). Până la confirmare,
  utilizatorul se poate autentifica și poate vedea evenimentele, dar **nu se poate înscrie** (participant) și **nu poate crea evenimente** (organizator):
  API-ul răspunde 403 cu `code: "EMAIL_NOT_VERIFIED"`, iar interfața arată o bandă cu „Retrimite emailul de confirmare”.
  Astfel emailurile despre evenimente ajung doar la adrese confirmate. Conturile create înainte de această funcție sunt considerate confirmate.
- **Resetarea parolei.** „Ai uitat parola?” pe pagina de autentificare → link pe email, valabil **30 de minute**, o singură dată;
  o cerere nouă anulează linkul anterior. După resetare se trimite emailul „Parola ta a fost schimbată”.
- **Linkurile sunt sigure în baza de date:** în `auth_tokens` se păstrează doar hash-ul SHA-256 al token-ului, iar conținutul emailurilor
  cu link (`email_outbox.sensitive`) se șterge imediat după trimitere.
- **Access token-ul și contul curent.** JWT-ul conține `tv` (versiunea sesiunilor contului). La fiecare cerere autentificată, API-ul citește contul (o interogare pe cheia primară):
  după o resetare de parolă sau logout-all, access token-urile vechi primesc 401, la fel cele ale unui cont șters. Rolul și starea emailului vin din baza de date, nu din token.
- **Local, fără cheie Resend:** linkurile apar în logul API-ului (nivel `debug`, sub `LogMailer`): de acolo se pot copia.

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

## Email

Emailurile se trimit prin [Resend](https://resend.com).

| Când | Cine primește |
|---|---|
| înscriere | participantul (confirmare) și organizatorul (cine s-a înscris, locuri ocupate) |
| anulare de către participant | participantul (confirmare) și organizatorul |
| se schimbă **titlul, data/ora sau locația** | fiecare participant înscris (vechi → nou) |
| evenimentul este șters | fiecare participant înscris |

Schimbarea doar a capacității sau a descrierii nu trimite nimic. Fiecare persoană primește emailul ei (adresele nu ajung la ceilalți).

**Cum funcționează:** acțiunea (înscriere, modificare, ștergere) scrie emailurile în tabelul `email_outbox`, **în aceeași tranzacție**.
Dacă acțiunea eșuează, emailurile dispar odată cu ea. Un job din API (`OutboxWorker`, la fiecare 15 secunde) le trimite în loturi de până la 100
(o singură cerere Resend). La eroare (Resend indisponibil, limită depășită) se reîncearcă după 1, 2, 4, 8 minute; după 5 încercări emailul devine `FAILED`,
cu eroarea salvată. Două instanțe ale API-ului nu trimit niciodată același email (`FOR UPDATE SKIP LOCKED`).

**Fără cheie Resend** (implicit): totul funcționează, dar emailurile sunt doar scrise în log (`[nu se trimite] către …`). Nimic nu pleacă din greșeală.

**Cu emailuri reale:**

1. Creează un cont gratuit pe resend.com și o cheie API.
2. Pune cheia în `secrets/resend_api_key.txt` (Docker) sau `RESEND_API_KEY` în `backend/.env`.
3. Fără un domeniu propriu, expeditorul `onboarding@resend.dev` livrează **doar către adresa contului tău Resend**; ceilalți destinatari primesc eroare 403.
   Pentru participanți reali: verifică un domeniu în Resend și setează `MAIL_FROM` (ex. `EventHub <noreply@domeniul-tau.ro>`).

| Variabilă | Implicit | Rol |
|---|---|---|
| `RESEND_API_KEY` / `secrets/resend_api_key.txt` | gol | cheia Resend; gol = doar log |
| `MAIL_FROM` | `EventHub <onboarding@resend.dev>` | expeditorul |
| `APP_URL` | `http://localhost:5173` | adresa frontend-ului, pentru linkurile din emailuri |
| `APP_TIMEZONE` | `Europe/Bucharest` | fusul orar al datelor din emailuri (containerul API rulează în UTC) |

Planul gratuit Resend: 100 de emailuri pe zi și 3.000 pe lună. Dacă limita zilnică este atinsă (ex. ștergerea unui eveniment mare), restul emailurilor așteaptă în coadă
și se reîncearcă; după 5 încercări (~15 minute) devin `FAILED`. Pentru volume mai mari este nevoie de un plan plătit.

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
- Înscrierea la evenimente, intrarea pe lista de așteptare și crearea de evenimente cer o adresă de email confirmată (403 `EMAIL_NOT_VERIFIED`).
- Un loc eliberat la un eveniment cu listă de așteptare este dat imediat primului de pe listă; un eveniment nu are locuri libere cât timp cineva așteaptă.
- Validare cu `class-validator` (`whitelist` + `forbidNonWhitelisted`), parole hash-uite cu bcrypt.

## Structura

```
backend/src/{auth,users,events,registrations,common}   # module NestJS cu responsabilități separate
backend/src/database/{data-source.ts,migrations/}      # setările bazei de date și migrările
backend/src/mail/                                      # emailuri: șabloane, coadă (outbox), trimitere (Resend / log)
frontend/src/{pages,auth.tsx,api.ts,ui.tsx}     # pagini, context de autentificare, client HTTP
```

## Bonus incluse

Sortare după dată, filtrare după locuri libere, dashboard organizator cu număr de înscrieri, teste automate, Docker Compose.
