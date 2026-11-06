# EventHub

A web application for organising events and managing registrations (the interface is in Romanian).
**Stack:** React (Vite, TypeScript) · NestJS (TypeScript, REST) · PostgreSQL · TypeORM · JWT.

| Events | Event | Sign-in | Phone |
|---|---|---|---|
| ![Event list](docs/design/evenimente.webp) | ![A paid event with a map](docs/design/eveniment.webp) | ![Sign-in form](docs/design/autentificare.webp) | ![Event page on a phone](docs/design/telefon-eveniment.webp) |

## Getting started: step by step

This takes about 10 minutes the first time. You end up with the site at **http://localhost:5100** and the API at
**http://localhost:5200/api**, running on your own computer.

### 1. Install the prerequisites (once)

| Tool | Why | Download |
|---|---|---|
| **Git** | to download the code | https://git-scm.com/downloads |
| **Docker Desktop** | runs the database and the API | https://www.docker.com/products/docker-desktop |
| **Node.js 22.12 or newer** (LTS recommended) | runs the website while you work on it | https://nodejs.org |

After installing Docker Desktop, **start it** and wait until it says *Engine running*. Docker needs about 2 GB of free memory to
build the images; close heavy programs if your computer is low on memory.

Check everything in a terminal (PowerShell on Windows, Terminal on Mac/Linux):

```bash
git --version
docker --version
node --version     # must be v22.12 or higher
```

### 2. Download the code

```bash
git clone https://github.com/TudorMihai23644/EventHub2026.git
cd EventHub2026
```

### 3. Create the secrets (once)

The passwords are never stored in the code. A script creates them in the `secrets/` folder (ignored by Git):

```bash
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\setup-secrets.ps1

# Mac / Linux
sh setup-secrets.sh
```

It generates the database and session passwords and asks you a few questions:

- **Organizer invite code**: type any word you will remember (e.g. `my-secret-code`). Only people who know it can create
  organizer accounts. You can read it again later in `secrets/organizer_invite_code.txt`.
- **Optional keys** (Resend, Cloudinary, Google, Turnstile, Stripe): **press Enter to skip each one.** The site works fully
  without them; see [Optional services](#optional-services) to turn them on later.

> **Run this before `docker compose up`.** If Docker starts first, it creates empty *folders* where the secret files should be, and
> the API crashes with `EISDIR: illegal operation on a directory`. Running the script fixes that: it replaces the empty folders.

### 4. Start the database and the API

```bash
docker compose up -d --build
```

The first build takes a few minutes. Check that the API is up: open **http://localhost:5200/api/health** in the browser; you should see
`{"status":"ok","database":"up",...}`.

### 5. Start the website

In a **second** terminal:

```bash
cd frontend
npm install        # first time only
npm run dev
```

When it prints `Local: http://localhost:5100/`, open **http://localhost:5100**. 🎉

### 6. Create your first accounts

1. Click **„Creează cont”** (*Create account*) in the top right.
2. **Participant** (signs up for events): fill in name, email, password. No code needed.
3. **Organizer** (creates events): choose *Organizator* and enter the **invite code** from step 3.
4. **Confirm the email address.** Until you do, participants cannot register for events and organizers cannot create them.
   No real email is sent yet (that needs a Resend key, see [Email](#email)); instead the email, with its link, is written to the
   API's log. Get the link with:

   ```bash
   # Windows (PowerShell)
   docker compose logs backend | findstr "confirmare-email"
   # Mac / Linux
   docker compose logs backend | grep "confirmare-email"
   ```

   Open the last link (`http://localhost:5100/confirmare-email?token=...`) in the browser. Done: the account is confirmed.
   The same trick works for password-reset links (`resetare-parola`).

### 7. Stopping and starting again

| What | Command |
|---|---|
| Stop the website | `Ctrl + C` in its terminal |
| Stop the database and API | `docker compose stop` |
| Start everything again next time | start Docker Desktop, `docker compose up -d`, then `cd frontend && npm run dev` |
| Delete all data and start fresh | `docker compose down -v` (removes the database volume) |

Your data (accounts, events) is kept in the Docker volume `pgdata` between restarts.

### Alternative: everything in Docker

If you don't plan to edit the frontend, Docker can serve it too (with nginx). Use **instead of** step 5, not together (same port):

```bash
docker compose --profile web up -d --build     # site on http://localhost:5100
```

### Troubleshooting

| Problem | Cause and fix |
|---|---|
| The site says **„Serverul nu răspunde”** (*server not responding*) | The API isn't running or the page is on a different port. Check http://localhost:5200/api/health; start it with `docker compose up -d`. Open the site at **http://localhost:5100** (or `127.0.0.1:5100`), not another port. |
| `Port 5100 is already in use` when running `npm run dev` | Something else holds the port, usually the Docker frontend (`--profile web`) or another `npm run dev`. Stop it (`docker compose --profile web stop frontend`), or use another port, see [Ports](#ports). |
| The API logs `EISDIR: illegal operation on a directory, read` | `docker compose up` ran before the secrets existed. Run the secrets script (step 3), then `docker compose up -d --force-recreate`. |
| `failed to connect to the docker API ... dockerDesktopLinuxEngine` | Docker Desktop isn't running. Start it and wait for *Engine running*. |
| Docker stops or the build is killed | Not enough memory. Close other programs and run the command again. |
| No confirmation email arrives | Expected without a Resend key: the link is in the API log (step 6). |
| `Cod de invitație invalid` (*invalid invite code*) | The organizer code must match `secrets/organizer_invite_code.txt` exactly. After changing that file, restart the API: `docker compose up -d --force-recreate backend`. |

## Ports

| | Port | Where to change it |
|---|---|---|
| Frontend (`npm run dev` or the nginx container) | **5100** | `FRONTEND_PORT` |
| API | **5200** (the same inside and outside its container) | `API_PORT` |
| PostgreSQL | 5432, on `127.0.0.1` only | `docker-compose.yml` |
| PostgreSQL for tests | 55432, on `127.0.0.1` only | `TEST_DB_PORT` |

For other ports, put them in a `.env` file next to `docker-compose.yml` (e.g. `FRONTEND_PORT=5101`, `API_PORT=5300`): all derived
addresses (`APP_URL`, `PUBLIC_API_URL`, CORS, CSP, links in emails) follow automatically. For `npm run dev` on another port:
`FRONTEND_PORT=5101 npm run dev`, and set `VITE_API_URL` in `frontend/.env`.

How conflicts are prevented:
- **a busy port stops startup with a clear message**: Vite (`strictPort`) and the API never silently move to another port, where CORS
  would reject every request ("server not responding");
- **the nginx frontend in Docker is optional** (`--profile web`): `docker compose up` never takes the port of `npm run dev`;
- **CORS also accepts `127.0.0.1`** for a `localhost` address (and vice versa), so the page works on either;
- **defaults live in one place** (`backend/src/common/urls.ts`); `urls.spec.ts` checks on every test run (and in CI) that
  `docker-compose.yml`, `vite.config.ts`, `.env.development`, `.env.example` and the Dockerfiles agree on the ports.

In Docker, the frontend is served by nginx with security headers, including a **Content-Security-Policy**
(`frontend/nginx/default.conf.template`): scripts only from the site (+ Cloudflare Turnstile), connections only to the API (+ Sentry),
images from the API, OpenStreetMap and Cloudinary, no framing by other sites. The API address is baked into the build
(`PUBLIC_API_URL`), and its origin goes into the CSP at startup (`API_ORIGIN`, default `http://localhost:5200`).

**Backend without Docker:** start only the database (`docker compose up -d db`), then `cd backend && cp .env.example .env`, fill in
`.env` with the same values as in `secrets/*.txt`, and run `npm install && npm run start:dev`.

Tables are created by migrations, run automatically when the API starts (see [Migrations](#migrations)). A database created before
migrations existed is recognised and kept.

## Configuration

- **API address (frontend):** `VITE_API_URL` in `frontend/.env` (default `http://localhost:5200/api`, from `.env.development`).
  Every request goes through `src/api.ts`, which uses `API_URL` from `src/config.ts`; no page contains a hard-coded address.
- **Organizer accounts:** can only be created with the invite code from `secrets/organizer_invite_code.txt`.
  If it's missing, nobody can register as an organizer. Participants register freely. Give the code only to people you trust.

## Secrets

No secret value is in the code or in `docker-compose.yml`. They live in `secrets/` (ignored by Git):

| File | Required | Content |
|---|---|---|
| `db_password.txt` | yes | database password (generated) |
| `jwt_secret.txt` | yes | session signing key (generated) |
| `organizer_invite_code.txt` | yes | invite code for organizer accounts |
| `resend_api_key.txt` | no (may be empty) | [Email](#email) |
| `cloudinary_url.txt` | no (may be empty) | cover images in the cloud |
| `google_client_secret.txt` | no (may be empty) | "Continue with Google" |
| `turnstile_secret_key.txt` | no (may be empty) | anti-robot check |
| `stripe_secret_key.txt`, `stripe_webhook_secret.txt` | no (may be empty) | [Paid tickets](#paid-tickets-stripe-optional) |

Docker Compose declares them under `secrets:` and mounts them into the containers as files in `/run/secrets`, so they don't appear in
`docker inspect`, in images, or in `docker compose config`. The backend reads them via `NAME_FILE` (see `backend/src/common/secrets.ts`)
and refuses to start without `JWT_SECRET` or the database password. PostgreSQL is exposed only on `127.0.0.1`. The frontend contains
no secrets: `VITE_*` variables end up in the browser, so only the public API address goes there.

The optional files must **exist** (they may be empty), otherwise `docker compose` won't start. If you set up an older version, run
the secrets script again: it only creates missing files (and replaces empty folders Docker created by mistake).

If you change `db_password.txt` after the database was created, either run `docker compose down -v` (deletes local data) or set the
new password inside the database, otherwise the volume keeps the old one.

## Tests and checks

Every push / pull request runs **CI** (`.github/workflows/ci.yml`): for backend and frontend, lint, types, unused code (knip), tests
and build; for the backend also the integration tests on a real PostgreSQL and a check that migrations match the entities; then it
starts the whole application with `docker compose --profile web up` and checks the API, the frontend and the CSP header. Locally, the
same commands:

```bash
cd backend  && npm run lint && npm run typecheck && npm run knip && npm test
cd frontend && npm run lint && npm run typecheck && npm run knip && npm test
```

**Frontend** (Vitest + Testing Library, `src/*.test.ts(x)`): lei ↔ bani (cents) conversion, the safe return after sign-in (`safeNext`),
URLs sent to Sentry without tokens, the ticket check-in page (verdicts, a single request even under StrictMode, visitor / participant),
the ticket QR code, the theme toggle and `ErrorBoundary`.

**Backend unit tests** (`npm test`): registration rules (duplicate, capacity, past event, success, missing event), cancellation (after
start, not registered, lock), capacity changes (below the number registered, another organizer, lock), organizer sign-up (code missing,
wrong, not configured, correct), rate limiting (429 after the limit, IP + email, unlimited routes, the Swagger switch), database
settings (no `synchronize`, migrations, `DB_MIGRATIONS_RUN`), validation (list parameters, field-by-field messages, `null` on edit),
`escapeLike`, emails (content, HTML escaping, Bucharest time, retries, `ResendMailer` against a fake Resend server), the account
(email confirmation required to register, the 429 message with time left, reset / confirmation emails), port consistency, and source
file encoding (no double-encoded text).

**Integration tests** (on a real PostgreSQL, schema created by migrations; they need Docker):

```bash
cd backend
npm run test:db:up     # starts a temporary PostgreSQL on 127.0.0.1:55432 (database eventhub_test)
npm run test:int       # pagination, search, summaries; emails (queue, rollback, 2 workers); account; payments; tickets; map; …
npm run test:db:down   # stops and removes the container
```

Integration tests wipe every table in the test database. They refuse to run on a database whose name doesn't contain "test", or
while another program (e.g. an API started against it) is connected: its background workers would process the tests' data.
Another database: `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`.

## API

Interactive documentation (send any request from the browser): **http://localhost:5200/api/docs**.
It is on by default outside production and in local `docker compose` (`SWAGGER_ENABLED=true`); in a production install it's off unless
you set `SWAGGER_ENABLED=true`. All routes are prefixed with `/api` (e.g. `POST /api/auth/login`). The URIs are defined in one place:
`backend/src/common/routes.ts` (backend) and `frontend/src/endpoints.ts` (frontend).

| Method | Route | Access | Notes |
|---|---|---|---|
| GET | `/health` | public | checks the API and the PostgreSQL connection (200 / 503) |
| POST | `/auth/register` | public | 201, `{accessToken, user}` + cookie `eh_refresh`; role `ORGANIZER` needs a valid `inviteCode`, otherwise 403; 429 after 10 accounts/hour from the same IP |
| POST | `/auth/login` | public | 200 `{accessToken, user}` + cookie `eh_refresh` / 401 / 429 (5/min per account + IP, 30/min per IP) |
| POST | `/auth/refresh` | cookie `eh_refresh` + header `X-EventHub-Client: web` | 200 `{accessToken, user}` + new cookie; 401 (invalid session, cookie cleared); 403 without the header; 30/min per IP |
| POST | `/auth/logout` | cookie + header `X-EventHub-Client` | 204; ends this device's session and clears the cookie (works with an expired access token too) |
| POST | `/auth/logout-all` | signed in + header `X-EventHub-Client` | 204; ends every session of the account, on all devices |
| GET | `/auth/me` | signed in | `{ id, name, email, role, emailVerified }` |
| GET | `/auth/options` | public | `{ google, turnstileSiteKey }`: which sign-in methods are on (the Turnstile key is public) |
| GET | `/auth/google?next=` | public (navigation) | 302 to Google (code + PKCE + state + nonce); 404 if Google isn't configured |
| GET | `/auth/google/callback` | Google (navigation) | 302 back to the app: `/autentificare-google` with the session cookie, or `/login?google=cancelled\|expired\|unverified\|error` |
| POST | `/auth/password/forgot` | public | `{ email }` → always 202 with the same message (doesn't reveal whether the address has an account); 429 after 3/hour per address + IP, 20/hour per IP |
| POST | `/auth/password/reset` | public | `{ token, password }` → 200; 400 `TOKEN_INVALID` (link missing, expired or used); ends every session of the account |
| POST | `/auth/email/verify` | public | `{ token }` → 200; 400 `TOKEN_INVALID` |
| POST | `/auth/email/resend` | signed in | 202 with a new link (the old one is cancelled); 400 if already confirmed; 5/hour per IP |
| GET | `/events?search=&sort=asc\|desc&available=true&category=&page=1&limit=20` | public | upcoming events only; paginated `{ items, total, page, limit, totalPages }`; `limit` at most 50, `search` at most 100 characters (`%` and `_` match literally); 400 for invalid values |
| GET | `/events/past?search=&category=&page=&limit=` | public | the archive: events that have started, most recent first |
| GET | `/events/categories` | public | `{ categories, formats, payments }` with Romanian labels |
| GET | `/events/:id` | public | includes `registeredCount`, `availableSeats` and `calendar: { google, icsPath }` |
| GET | `/events/:id/calendar.ics` | public | iCalendar file (`text/calendar`) for Apple Calendar, Outlook, phones |
| GET | `/uploads/:file` | public | cover images (local storage), `image/webp`, cached for a year |
| GET | `/events/mine` | organizer | dashboard with registration counts |
| GET | `/events/mine/summary` | organizer | `{eventsCount, upcomingCount, totalRegistrations, totalWaiting}` |
| POST | `/events` | organizer with confirmed email | 201 / 400 / 403 `EMAIL_NOT_VERIFIED` |
| PATCH | `/events/:id` | owning organizer | 403 if not the owner |
| DELETE | `/events/:id` | owning organizer | 204 |
| POST | `/events/:id/cover` | owning organizer | `multipart/form-data`, field `file`: JPEG/PNG/WebP ≤ 5 MB → 200 `{ cover: { small, large } }`; 400 invalid type/image; 413 too large |
| DELETE | `/events/:id/cover` | owning organizer | 204 |
| GET | `/events/:id/registrations` | owning organizer | registered participants |
| GET | `/events/:id/registrations.csv` | owning organizer | CSV (Excel): registered, then the waitlist |
| GET | `/events/:id/stats` | owning organizer | occupancy, waitlist, registrations per day, present / no-show (`noShow` is null before the start), revenue |
| GET | `/events/:id/waitlist` | owning organizer | who is waiting, in order |
| PUT | `/events/:id/attendance/:registrationId` | owning organizer | `{ present: boolean }` → `{ id, checkedInAt }`; from when the window opens, and after the event (corrections) |
| POST | `/check-in` | organizer | `{ code }` → 200 `{ result: CHECKED_IN \| ALREADY_CHECKED_IN, checkedInAt, participant: { name }, event }`; 404 unknown code or another organizer's; 400 invalid code or outside the window |
| POST | `/events/:id/registrations` | participant with confirmed email | 201 / 400 (past) / 403 `EMAIL_NOT_VERIFIED` / 409 (duplicate, full, `PAYMENT_REQUIRED`) |
| DELETE | `/events/:id/registrations` | participant | 204 / 400 (started) / 404; the freed seat goes to the first person on the waitlist |
| GET | `/registrations/me` | participant | |
| POST | `/events/:id/waitlist` | participant with confirmed email | 201 `{ position, waitlistCount }`; only when the event is full (otherwise 409 `SEATS_AVAILABLE`); 409 if registered / already waiting; 400 past event |
| DELETE | `/events/:id/waitlist` | participant | 204 / 404 |
| GET | `/waitlist/me` | participant | own waitlists, with the position on each |
| POST | `/events/:id/checkout` | participant with confirmed email | paid event → `{ url, expiresAt }` (the Stripe page; the seat is held); 409 `SOLD_OUT` / already registered; 503 payments off or Stripe unavailable |
| POST | `/payments/webhook` | Stripe (signature) | `Stripe-Signature` verified on the raw body; 400 bad signature |
| PATCH | `/account` | signed in | `{ name }` |
| POST | `/account/password` | signed in + header `X-EventHub-Client` | `{ currentPassword, newPassword }` → a new session for this device, the others ended |
| DELETE | `/account` | signed in + header `X-EventHub-Client` | `{ password }` → 204; see [My account](#my-account-cont) |

**All logic lives in the API.** The frontend only displays responses. Events come with their state computed on the server
(`status`: OPEN/FULL/ONGOING/PAST, `isRegistered`, `canRegister`, `mustVerifyEmail`, `canCancel`, `canEdit`, `occupancyPercent`,
`waitlistCount`, `isWaitlisted`, `waitlistPosition`, `canJoinWaitlist`, `canLeaveWaitlist`, `ticket`, `checkIn`, `price`, `canBuy`, `map`),
and validation errors come as `{ message, fields: { field: message } }`, shown next to each field. `GET /events` and `GET /events/:id`
are public, but adapt the response when the request carries a token.

## Reminders and calendar

- **Reminder the day before.** A job (every 15 minutes) emails "Tomorrow / Today / Starting soon: «Title»" to participants registered
  for events starting within the next 24 hours. Once per registration (`registrations.reminderSentAt`, set in the same transaction that
  queues the email; two API instances never send it twice).
- No reminder for people who registered (or were promoted from the waitlist) less than 24 hours before (they just got the
  confirmation), nor for people on the waitlist. If the organizer moves the date, the reminder is sent again for the new date.
- **Add to calendar:** on the event page and in the confirmation, "you got a seat" and reminder emails: a Google Calendar link and an
  `.ics` file (`GET /events/:id/calendar.ics`). Times are in UTC; each calendar shows them in the user's time zone. The UID is fixed,
  so re-importing after a change replaces the entry. The end time is used; without one, the event lasts **2 hours** in the calendar.
- Emails contain links, not attachments (the Resend batch endpoint used by the queue doesn't accept attachments).

## Event details

- **End time** (optional): after the start, at most 14 days. If the organizer moves only the start, the end moves too (the duration
  stays). "Past" still means "has started" (registration, cancellation and the waitlist close at the start); between start and end the
  event shows as "In progress" (`status: ONGOING`).
- **Category** (required): Concert, Conference, Workshop, Sport, Theatre and film, Exhibition, Community, Other
  (`backend/src/events/categories.ts`, served at `GET /events/categories`). The `?category=` filter combines with pagination and
  the other filters. Events created before categories existed are "Other".
- **Format:** physical (location required), online (link required, the place shows as "Online") or hybrid (both). The link must be
  `https://`. **Only registered participants and the organizer see the link** (event page, confirmation, "you got a seat", reminder and
  "link changed" emails). The public list, `.ics`, the Google link and people on the waitlist don't get it (`hasOnlineLink` only says it exists).
- **Cover image** (optional): `POST /events/:id/cover` (the organizer, `multipart/form-data`, field `file`), `DELETE /events/:id/cover`.
  - Checked on the server: at most **5 MB** (the upload stops past the limit, 413), type determined from the content (the file's
    signature, not its name): only **JPEG, PNG, WebP** (SVG, GIF, anything else → 400), at most 40 megapixels.
  - Processed with `sharp`: rotated by the camera orientation, **all metadata removed** (EXIF can contain the phone's GPS location),
    cropped to 16:9 in two WebP versions: 1600×900 (event page) and 640×360 (list). The original is not kept.
  - Storage: on disk by default (Docker volume `uploads`, served at `/api/uploads/…`, cached for a year); on **Cloudinary** if
    `secrets/cloudinary_url.txt` (`CLOUDINARY_URL`, format `cloudinary://<api_key>:<api_secret>@<cloud_name>`) isn't empty.
  - Replacing or removing the image, or deleting the event, deletes the old files too. Responses contain only `cover: { small, large }`.

## Map

- The location of physical and hybrid events is looked up on **Nominatim** (OpenStreetMap) **in the background**: saving never
  waits for the service. The event gets `PENDING`, and `GeocodingWorker` (every 10 seconds) resolves it: `FOUND` (a point on the map),
  `NOT_FOUND` (the address doesn't exist in OpenStreetMap) or, after 6 failed attempts at 1, 2, 4, 8, 16 minutes, `FAILED`. A changed
  location is looked up again; a changed title or date is not.
- Follows the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): at most **one request per second**,
  its own **User-Agent** (`GEOCODER_USER_AGENT`; add a contact in production), **no autocomplete** (only on save) and a **cache**: an
  address already found for another event (the same, ignoring spaces and capitals) isn't requested again. Searches are limited to
  Romania (`GEOCODER_COUNTRY=ro`). `GEOCODER=off` stops requests entirely (no maps). `NOMINATIM_URL` allows a self-hosted server.
- API: `map: { lat, lng, osmUrl, directionsUrl }` for everyone (or `null`); the organizer also gets `geocode: { status, label }`, i.e.
  the address that was found, to check the point is right. The result doesn't change `updatedAt` (calendars don't see an "update").
- Frontend: a **Leaflet** map with OpenStreetMap tiles and attribution, loaded separately (only on pages of events with a map), dark in
  dark mode; "Indicații de orientare" (*directions*, Google Maps) and "Deschide în OpenStreetMap" links. Public OSM tiles are meant for
  light traffic; in production with many visitors, use a tile provider via `VITE_MAP_TILES_URL` and `VITE_MAP_ATTRIBUTION` (`frontend/.env`).

## Organizer tools

- **CSV export** (button in „Evenimentele mele”, *My events*): registered participants, then the waitlist in order, with times in the
  app's time zone. `;` separator and a UTF-8 BOM, so Excel with Romanian settings opens columns and diacritics correctly. A cell starting
  with `= + - @` gets an apostrophe in front (otherwise Excel would run it as a formula: "CSV injection").
- **Stats** per event: registered, free seats, waiting, occupancy, registrations per day (simple bars), present / no-show, revenue.
  Cancelled registrations no longer exist in the database, so the series shows current registrations by the day they were made.
- **Public archive** at `/evenimente-trecute`.

## Tickets and check-in

- Every registration has a 10-character **ticket code** (e.g. `7KQ2M-9XH4T`), generated by PostgreSQL (`eventhub_ticket_code()`, 50
  random bits). The participant sees it as a **QR code** on the event page (generated in the browser) and as text in the confirmation
  and reminder emails.
- The QR code contains the link `/check-in/CODE`. The organizer scans it with the **phone camera**; the page validates immediately and
  shows the verdict (valid / already validated at time X / rejected). The code can also be typed; lowercase, spaces, dashes and
  `O`/`I`/`L` are accepted.
- **Window**: from 3 hours before the start until 6 hours after the end (without an end time: 12 hours after the start).
- **Validated once**: two simultaneous scans of the same ticket give one "valid" and one "already validated" (a single
  `UPDATE … WHERE "checkedInAt" IS NULL`).
- Another organizer's ticket answers like an unknown code. The scan response contains only the participant's name, not their email.
- In „Evenimentele mele”, the attendee list has "present" checkboxes for manual marking; the CSV has a `Prezent` (*present*) column.

## My account (`/cont`)

- Change the name; change the password (with the current one): other sessions end, the current device stays signed in;
  "Sign me out on all devices".
- **Deleting the account** (with the password) doesn't rely on database cascades for what matters. A participant: registrations for
  upcoming events are cancelled through the normal flow (the seat goes to the first person on the waitlist, the organizer is notified)
  and they leave every waitlist. An organizer: upcoming events are deleted with a notice to participants, past ones without emails;
  cover images are deleted. Unsent emails to the deleted address are removed from the queue.

## Waitlist

- When an upcoming event is full, a participant with a confirmed email can join the **waitlist** and sees their position ("3rd of 7").
- When a seat frees up (someone cancels, or the organizer raises the capacity), **the first person on the list is registered
  automatically** and gets the email "You got a seat at «Title»"; the organizer gets "New registration … (from the waitlist)". If they
  can no longer come, they cancel and the seat moves to the next person.
- Order: first come, first served. No limit on the list. Promotion continues until the event starts.
- **Invariant:** while anyone is waiting, the event has no free seats. Every operation on seats and the list (register, cancel,
  join/leave the list, change capacity, delete) locks the same event row, so the rule holds under simultaneous requests.
- People on the waitlist also get the "event changed" / "event cancelled" emails.
- The list lives in a separate table (`waitlist_entries`): everything that counts taken seats stays unchanged.

## Sessions

| | Access token | Refresh token |
|---|---|---|
| What | JWT | 32 random bytes |
| Lifetime | **15 minutes** | **30 days**, renewed on each use; **at most 90 days** from sign-in |
| In the browser | **memory only** (gone on page reload) | **httpOnly** cookie `eh_refresh` (JavaScript can't read it), `SameSite=Lax`, sent only to `/api/auth` |
| On the server | not stored | only its SHA-256 hash, in `refresh_tokens` |

- On page load, the frontend calls `POST /auth/refresh`: with a valid cookie it gets a new access token, so you stay signed in. When the
  access token expires, `api.ts` renews it once automatically and repeats the request. Nothing is kept in `localStorage`.
- **Rotation:** each renewal replaces the refresh token with a new one. If an already-replaced token is used again after 30 seconds,
  someone has a copy: that whole sign-in is revoked (on every device it reached) and a warning is logged. Within the first 30 seconds,
  the old token still gets an access token only: this covers two tabs renewing at the same time. In the browser, tabs take turns (Web
  Locks), and signing out in one tab signs the others out too (BroadcastChannel).
- **Logout** ends the current device's session; **logout-all** ends all of them (and invalidates access tokens immediately, via
  `tokenVersion`). Resetting the password also ends every session. Tokens expired or revoked more than 7 days ago are deleted daily at 03:00.
- **CSRF:** routes that use the cookie require the header `X-EventHub-Client: web`. A form on another site can't send custom headers,
  and CORS accepts credentials only from the frontend's origins (`CORS_ORIGIN`, or `APP_URL` by default).
- **The frontend and the API must be on the same site** (e.g. `eventhub.ro` + `api.eventhub.ro`, or the API under `eventhub.ro/api`;
  `localhost:5100` + `localhost:5200` count as the same site). On two unrelated domains the cookie would be "third-party", and many
  browsers (e.g. Safari) block it.

| Variable | Default | Role |
|---|---|---|
| `COOKIE_SECURE` | `true` in production | cookie over HTTPS only. `docker-compose.yml` sets it to `false` (local over http) |
| `COOKIE_SAMESITE` | `lax` | `strict` / `none` (`none` forces Secure) |
| `COOKIE_DOMAIN` | — | e.g. `.eventhub.ro`, if the frontend and API are on different subdomains |

## Optional services

Each one is **off** until its keys are set; without them the application works exactly the same.

### Paid tickets (Stripe, optional)

Turned on by `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (in Docker: `secrets/stripe_secret_key.txt`, `secrets/stripe_webhook_secret.txt`).
Without them the form doesn't show a price and an event can't have one (400).

- The organizer sets a **price in lei** (at least 2 lei, Stripe's minimum; empty = free). The participant clicks „Cumpără bilet”
  (*Buy ticket*) and pays on the **Stripe Checkout** page (card details never pass through EventHub).
- **The seat is held while they pay**: 31 minutes (the Stripe session) + 5 minutes for late webhooks. Held seats are subtracted from
  free seats everywhere (list, event page, the "only with seats" filter, the minimum capacity when editing). Three buyers for two seats:
  two get the payment page, the third `409 SOLD_OUT`. Someone who comes back gets the same payment page ("Continuă plata", *continue payment*).
- **Webhook** `POST /api/payments/webhook` (events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.expired`), with the HMAC signature verified on the **raw body** and at most 5 minutes old. A confirmed payment →
  registration with a ticket and the usual email, **exactly once** (Stripe may send the same webhook several times).
- **Refunds are automatic**, in the background (`RefundWorker`, every 30 seconds, idempotency key `refund-<id>`, retries): when a
  registration is cancelled (before the event), when the event is deleted, when the amount doesn't match, or when a payment arrives
  after the hold expired and the seats were taken. The participant gets an email when the money is returned. A refund Stripe rejects
  stays `REFUND_FAILED` (check it in the Stripe dashboard).
- Paid events **have no waitlist**; an event with paid tickets can't become free (the price can change for future tickets). The
  organizer's stats show revenue.
- Payments stay in the database after the event or account is deleted (the money trail).
- Locally: `stripe listen --forward-to localhost:5200/api/payments/webhook` (Stripe CLI) prints the `whsec_…` secret to put in `.env`.

### Google sign-in, Turnstile, Sentry

- **"Continue with Google"** (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, in Docker `secrets/google_client_secret.txt`).
  In Google Cloud Console: an OAuth client of type *Web application*, *Authorized redirect URI* = `PUBLIC_API_URL` + `/auth/google/callback`
  (e.g. `http://localhost:5200/api/auth/google/callback`).
  - Server-side authorization code flow with **PKCE**, **state** (anti-CSRF, in a 10-minute httpOnly cookie, SameSite=Lax) and
    **nonce**. The ID token's issuer, audience (`aud` = our client), expiry, nonce and `email_verified` are checked.
  - New account → a **participant** with a confirmed address and **no password** (they can set one via "Forgot password?").
    Organizers are still created only with the invite code; an existing organizer can sign in with Google.
  - Same address as an existing account → the accounts are linked. If that account's address **wasn't confirmed**, anyone could have
    created it with someone else's address: on linking, **its password is wiped and every session ends**, so only the address owner
    keeps access.
  - A passwordless account: password sign-in answers `401 USE_GOOGLE`, changing the password / deleting the account `400 NO_PASSWORD`.
- **Cloudflare Turnstile** (`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`, in Docker `secrets/turnstile_secret_key.txt`) on sign-up,
  sign-in and "Forgot password?". The widget sends its token in the `X-Turnstile-Token` header; the server checks it with Cloudflare
  (`400 CAPTCHA_REQUIRED` / `CAPTCHA_FAILED`). If **Cloudflare doesn't answer**, the request passes (rate limiting still applies) with a
  warning in the log: an outage on their side doesn't lock users out. Test keys: site `1x00000000000000000000AA`, secret
  `1x0000000000000000000000000000000AA`.
- **Sentry**: backend `SENTRY_DSN` (unexpected errors only, 500; not 400/401/403/404), frontend `VITE_SENTRY_DSN` (rendering errors and
  exceptions; without a DSN the SDK isn't even in the build). **Nothing personal**: no cookies, auth headers, request bodies or query
  strings (the OAuth code and the tokens in reset / confirmation links are in URLs), and no user email. `SENTRY_TRACES_SAMPLE_RATE`
  (default 0) for performance tracing.

## Account: email confirmation, password reset

- **Confirming the address.** Sign-up sends a confirmation link (valid 24 hours). Until confirmed, the user can sign in and see events,
  but **can't register** (participant) and **can't create events** (organizer): the API answers 403 with `code: "EMAIL_NOT_VERIFIED"`,
  and the interface shows a banner with „Retrimite emailul de confirmare” (*resend the confirmation email*). This way event emails
  only go to confirmed addresses. Accounts created before this feature count as confirmed.
- **Password reset.** "Forgot password?" on the sign-in page → a link by email, valid **30 minutes**, single use; a new request cancels
  the previous link. After the reset, the email "Your password was changed" is sent.
- **Links are safe in the database:** `auth_tokens` keeps only the SHA-256 hash of each token, and the content of emails containing a
  link (`email_outbox.sensitive`) is deleted right after sending.
- **The access token and the current account.** The JWT contains `tv` (the account's session version). On every authenticated request
  the API reads the account (a primary-key lookup): after a password reset or logout-all, old access tokens get 401, as do those of a
  deleted account. The role and email status come from the database, not from the token.
- **Locally, without a Resend key:** links appear in the API log (`debug` level, under `LogMailer`); copy them from there (see step 6
  of [Getting started](#getting-started-step-by-step)).

## Migrations

The database schema changes **only through migrations** (`backend/src/database/migrations`), never automatically (`synchronize` is off).
Connection settings are in one place, `backend/src/database/data-source.ts`, used by both the application and the TypeORM CLI.

- On startup, the API runs new migrations (`DB_MIGRATIONS_RUN`, default `true`).
- The first migration (`InitialSchema`) recognises a database created before migrations existed: it creates nothing, it only marks
  itself as applied. The data stays.

**Changing the schema** (from `backend/`, with the database running):

```bash
# 1. change the entity (e.g. events/event.entity.ts)
npm run migration:generate -- src/database/migrations/ChangeName   # 2. generate the migration
# 3. read the generated file, then add it to git
npm run migration:run      # 4. apply it (or restart the API)
```

| Command | What it does |
|---|---|
| `npm run migration:show` | lists migrations and which are applied (`[X]`) |
| `npm run migration:check` | fails if entities and migrations differ (a forgotten migration) |
| `npm run migration:revert` | undoes the last migration (careful: `InitialSchema` drops every table) |
| `npm run migration:run:prod` | runs the compiled migrations, inside the Docker image |

With several API instances running at once: set `DB_MIGRATIONS_RUN=false` and run `migration:run:prod` once, as a separate deploy step.

## Email

Emails are sent through [Resend](https://resend.com).

| When | Who receives it |
|---|---|
| registration | the participant (confirmation, with the ticket) and the organizer (who registered, seats taken) |
| cancellation by the participant | the participant (confirmation) and the organizer |
| **title, date/time or location** changes | every registered participant (old → new) |
| the event is deleted | every registered participant |
| the day before | registered participants (reminder) |

Changing only the capacity or the description sends nothing. Everyone gets their own email (addresses aren't shared).

**How it works:** the action (registration, change, deletion) writes the emails to the `email_outbox` table **in the same transaction**.
If the action fails, the emails disappear with it. A job in the API (`OutboxWorker`, every 15 seconds) sends them in batches of up to
100 (one Resend request). On error (Resend unavailable, limit exceeded) it retries after 1, 2, 4, 8 minutes; after 5 attempts the email
becomes `FAILED`, with the error saved. Two API instances never send the same email (`FOR UPDATE SKIP LOCKED`).

**Without a Resend key** (the default): everything works, but emails are only written to the log (`[nu se trimite] către …`, *not
sent, to …*). Nothing leaves by accident.

**With real emails:**

1. Create a free account at resend.com and an API key.
2. Put the key in `secrets/resend_api_key.txt` (Docker) or `RESEND_API_KEY` in `backend/.env`, then restart the API
   (`docker compose up -d --force-recreate backend`).
3. Without your own domain, the sender `onboarding@resend.dev` delivers **only to your Resend account's address**; other recipients
   get a 403 error. For real participants: verify a domain in Resend and set `MAIL_FROM` (e.g. `EventHub <noreply@your-domain.ro>`).

| Variable | Default | Role |
|---|---|---|
| `RESEND_API_KEY` / `secrets/resend_api_key.txt` | empty | the Resend key; empty = log only |
| `MAIL_FROM` | `EventHub <onboarding@resend.dev>` | the sender |
| `APP_URL` | `http://localhost:5100` | the frontend address, for links in emails |
| `APP_TIMEZONE` | `Europe/Bucharest` | time zone of dates in emails (the API container runs in UTC) |
| `PUBLIC_API_URL` | `http://localhost:5200/api` | the public API address, for `.ics` links in emails |

Resend's free plan: 100 emails a day and 3,000 a month. If the daily limit is reached (e.g. deleting a large event), the remaining
emails wait in the queue and are retried; after 5 attempts (~15 minutes) they become `FAILED`. Higher volumes need a paid plan.

## Security

- **Rate limiting** (`@nestjs/throttler`, global). The limits are in one place: `backend/src/common/security.ts`.
  - `POST /auth/login`: 5 attempts/minute per IP + email (guessing one account's password) and 30/minute per IP (many accounts).
    Users on the same network don't block each other.
  - `POST /auth/register`: 10/hour per IP. Other routes: 120/minute per IP. `GET /health` isn't limited.
  - Over the limit: `429` with `{ message: "Prea multe încercări..." }` and a `Retry-After` header.
  - Counters are in memory: they reset on restart and aren't shared between instances (for that: Redis storage).
  - Behind a reverse proxy, set `TRUST_PROXY` (e.g. `1`), otherwise every user would have the proxy's IP.
- **Security headers** with `helmet` (no `X-Powered-By`, with HSTS, `nosniff`, `X-Frame-Options`, etc.). The API's
  Content-Security-Policy is off only while Swagger is on. The frontend's CSP is set by nginx (see [Ports](#ports)).
- **Swagger** (`/api/docs`) only when `SWAGGER_ENABLED=true` or outside production.

## Business rules (in the backend)

- No duplicate registrations: a check in the service + a `UNIQUE(userId, eventId)` constraint in PostgreSQL.
- Capacity is never exceeded: registration runs in a transaction with `pessimistic_write` on the event row, so simultaneous requests
  can't go over the limit.
- No registration for past events; new events must be in the future.
- A registration can't be cancelled after the event starts (400). Cancellation runs in the same transaction, with the same lock on the
  event, as registration.
- Only the owning organizer can edit or delete (role guard + ownership check → 403).
- An event's capacity can't go below the number registered. The change runs in a transaction with the same lock, so a simultaneous
  registration can't exceed the new capacity.
- Registering, joining a waitlist and creating events require a confirmed email address (403 `EMAIL_NOT_VERIFIED`).
- A seat freed at an event with a waitlist goes immediately to the first person on it; an event has no free seats while anyone is waiting.
- Validation with `class-validator` (`whitelist` + `forbidNonWhitelisted`), passwords hashed with bcrypt.

## Design ("Noir Glass")

Minimalist and near-black, with **a single red** (`--red`) used sparingly: the primary button, focus, the current page, the "seats
available" dot, the month in the date. **Frosted glass** only on what floats (header, panels, forms, ticket, notifications, the check-in
verdict), over a soft red glow and fine grain; lists stay flat with thin lines. Everything is in one file, `frontend/src/styles.css`,
with variables at the top. Without `backdrop-filter`, or when the system asks for reduced transparency, glass becomes an opaque
surface; with reduced motion, there's no animation.

**Light theme:** the sun / moon button in the header switches between the two themes; the choice is remembered in the browser, and on
the first visit the system theme is used. Same colour roles, different values (`:root[data-theme='light']` in `styles.css`): warm
white, the same red a little deeper for contrast, white frosted glass, normal OSM map tiles. The theme is applied before the first paint
by `public/theme-init.js` (a separate file: the CSP forbids inline scripts), so the page never flashes in the wrong theme.

## Structure

```
backend/src/{auth,users,events,registrations,waitlist,payments,geo,…}   # NestJS modules with separate responsibilities
backend/src/common/                                                     # shared: routes, URLs/ports, security, validation, CSV
backend/src/database/{data-source.ts,migrations/}                       # database settings and migrations
backend/src/mail/                                                       # emails: templates, queue (outbox), sending (Resend / log)
frontend/src/{pages,auth.tsx,api.ts,ui.tsx,styles.css}                  # pages, auth context, HTTP client, design
docker-compose.yml, setup-secrets.{ps1,sh}                              # running everything locally
IMPROVEMENTS.md                                                         # roadmap, decisions and test results for every feature
```
