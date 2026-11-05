# EventHub – Improvements Backlog

Living list of improvement ideas for EventHub. New ideas go into **Inbox** first, then get a priority and move into the roadmap.
Mark items done with `[x]` and keep them (don't delete) so the history stays visible.

Effort: XS < 1h · S ≈ half day · M ≈ 1–3 days · L > 3 days

## Table of contents

1. [Block late cancellation + fix the capacity race](#idea-1)
2. [Rate limiting + helmet + Swagger only outside production](#idea-2)
3. ~~[Delete dead frontend code](#idea-3)~~ (cancelled → 18)
4. [TypeORM migrations instead of `synchronize`](#idea-4)
5. [Pagination + `available` filter in SQL + aggregate summary](#idea-5)
6. [Transactional email (Resend)](#idea-6)
7. [Password reset + email verification](#idea-7)
8. [Refresh tokens + server-side logout](#idea-8)
9. [Waitlist with automatic promotion](#idea-9)
10. [24h reminders + calendar export](#idea-10)
11. [Event fields: `endsAt`, category, cover image, online events](#idea-11)
12. [Organizer tools: CSV export + analytics](#idea-12)
13. [CI, linting, frontend tests, frontend in Docker](#idea-13)
14. [Location autocomplete + map](#idea-14)
15. [QR tickets + check-in](#idea-15)
16. [Google sign-in, Turnstile, Sentry](#idea-16)
17. [Paid events with Stripe](#idea-17)
18. [Adopt the "Red Neon 4K" theme](#idea-18)

- [Reference: external APIs vs. in-house](#reference)
- [Inbox (new ideas)](#inbox)

---

## Roadmap (priority order)

| # | Status | Item | Type | Effort | Depends on |
|---|---|---|---|---|---|
| [1](#idea-1) | [x] | Block cancelling a registration after the event started + lock when lowering capacity | Fix | S | |
| [2](#idea-2) | [x] | Rate limiting (`@nestjs/throttler`) + `helmet` + Swagger only outside production | Security | S | |
| [3](#idea-3) | ❌ | ~~Delete dead frontend code~~ – cancelled, replaced by [#18](#idea-18) | Cleanup | XS | |
| [4](#idea-4) | [x] | TypeORM migrations instead of `synchronize: true` | Production | S | |
| [5](#idea-5) | [x] | Pagination on `GET /events` + `available` filter in SQL + single aggregate query for `summary` + safe search | Performance | M | 4 |
| [6](#idea-6) | [x] | Transactional email (Resend): registration confirmation, event changed/deleted notice | Feature + API | M | |
| [7](#idea-7) | [x] | Password reset + email verification | Feature | M | 6 |
| [8](#idea-8) | [ ] | Short access token + refresh token in httpOnly cookie, server-side logout/revocation | Security | M | |
| [9](#idea-9) | [ ] | Waitlist with automatic promotion when someone cancels | Feature | M | 1, 6 |
| [10](#idea-10) | [ ] | 24h reminders (`@nestjs/schedule`) + `.ics` download + "Add to Google Calendar" link | Feature | S–M | 6 |
| [11](#idea-11) | [ ] | Event fields: `endsAt`, category/tags, cover image (Cloudinary), online/physical + link | Feature + API | M | |
| [12](#idea-12) | [ ] | Organizer tools: CSV export of attendees, analytics (registrations over time, no-show rate) | Feature | S–M | |
| [13](#idea-13) | [ ] | CI (lint + tests), ESLint/Prettier, frontend tests, frontend in `docker-compose` | Tooling | M | |
| [14](#idea-14) | [ ] | Location autocomplete + map (Mapbox / Google Places, or free Nominatim + Leaflet) | Feature + API | M | |
| [15](#idea-15) | [ ] | QR ticket per registration + organizer check-in scanner | Feature | M–L | |
| [16](#idea-16) | [ ] | Google sign-in (OAuth), Cloudflare Turnstile on register/login, Sentry monitoring | API | S each | |
| [17](#idea-17) | [ ] | Paid events with Stripe Checkout | Feature + API | L | |
| [18](#idea-18) | [ ] | Adopt the "Red Neon 4K" theme (`index.css`, `EventCard`, `Navbar`) for the whole app | Design | M | priority to decide |

---

<a id="idea-1"></a>
## 1. Block late cancellation + fix the capacity race

**Status:** ✅ done 2026-11-05 · 22/22 backend tests pass, TypeScript compiles · **Type:** Fix · **Effort:** S

**Files changed:** `backend/src/registrations/registrations.service.ts`, `registrations.service.spec.ts`, `backend/src/events/events.service.ts`, new `backend/src/events/events.service.spec.ts`, `README.md`.

Two small backend changes. The frontend and the database schema stay as they are.

### Part A: no cancelling after the event has started

**Problem:** `RegistrationsService.cancel` deletes the registration without looking at the event date. Anyone calling the API directly can cancel a registration for a past event, and that rewrites the attendance history.

**Steps**
1. In `backend/src/registrations/registrations.service.ts`, rewrite `cancel()` to run inside a transaction, like `register()` already does:
   - Lock the event row (`pessimistic_write`). This is the same lock `register()` takes, so a registration and a cancellation for the same event run one after the other, never at the same time.
   - Event missing → 404 "Evenimentul nu a fost găsit."
   - `startsAt <= now` → 400 "Nu poți anula înscrierea la un eveniment care a avut deja loc."
   - No registration for this user → 404 (same as today).
   - Otherwise, delete the registration.
2. In `registrations.service.spec.ts`, add 3 tests: cancel a past event → 400, not registered → 404, valid cancel → deleted.

### Part B: lowering capacity while people are registering

**Problem:** `EventsService.update` counts registrations and saves the new capacity without a lock. Suppose capacity is 10 and 9 people are registered. The organizer lowers it to 9 while someone registers at the same moment. Both checks pass, and you end up with 10 people on 9 seats.

**Steps**
3. In `backend/src/events/events.service.ts`, add `DataSource` to the constructor and run `update()` inside a transaction:
   - Lock the event row (`pessimistic_write`) → check ownership (403) → count registrations → reject a capacity below that count (400, same field message as today) → save.
   - Because `register()` takes the same lock, either the registration commits first and gets counted, or the capacity change commits first and the registration sees the new limit. Going over capacity is no longer possible.
4. Add a new `events.service.spec.ts` with tests for: capacity below the number registered → 400, not the owner → 403, the lock is actually requested, a valid update is saved.

### Part C: docs

5. In `README.md`, update the API row to `DELETE /events/:id/registrations` → `204 / 400 (trecut) / 404`, and add both rules to the "Reguli de business" list.
6. In this file, tick item 1 as `[x]`.

### How it affects the project

| Area | Effect |
|---|---|
| **API** | One change: cancelling a registration for a past event now returns **400** instead of 204. Every other response stays the same. |
| **Frontend** | No changes. The cancel button is already hidden for past events. In the rare case where a page is opened before the start and the button is clicked after it, the existing error toast shows the API message. |
| **Database** | No schema change and no migration. |
| **Performance** | Editing an event holds a lock on that one row for a few milliseconds, so a registration for the same event may wait that long. Other events aren't affected. |
| **Later items** | This sets up [#9 (waitlist)](#idea-9): promoting the next person when someone cancels will happen inside this same locked transaction. When [#11](#idea-11) adds `endsAt`, we'll decide whether "past" means started or ended. |
| **Risk** | Low. About 4 files change, all in the backend, and each change gets tests. |

### Before starting

- `backend/node_modules` isn't installed, so the tests need `cd backend && npm install && npm test`.
- The project isn't a git repository yet. Run `git init` and make a first commit before editing, so the changes can be undone.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-2"></a>
## 2. Rate limiting + helmet + Swagger only outside production

**Status:** ✅ done 2026-11-05 · 40/40 backend tests pass, TypeScript compiles · manual Docker check (step 13) still to do, needs `secrets/` set up · **Type:** Security · **Effort:** S

**Files changed:** `backend/package.json` (+ `@nestjs/throttler` 6.7, `helmet` 8.3, dev `supertest` 7.3, `@types/supertest`), `backend/src/app.module.ts`, `backend/src/main.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/health.controller.ts`, new `backend/src/common/security.ts`, new `backend/src/common/security.spec.ts`, `docker-compose.yml`, `backend/.env.example`, `README.md`.

**Differences from the plan:**
- Step 4: instead of `@Throttle(...)` with numbers in the controller, routes get `@ThrottleScope('login' | 'register')`, and every limit lives only in `security.ts`. Each strict limit has a `skipIf`, so it only runs on its own route.
- The 120/minute default counts per IP **per route** (that's how the throttler builds its keys), not across all routes combined.

Three independent hardening changes in the backend. No database change; the frontend only shows a new error message it already knows how to display.

### Part A: rate limiting (`@nestjs/throttler`)

**Problem:** `POST /auth/login` accepts unlimited attempts, so a script can try thousands of passwords per minute against one account. `POST /auth/register` can be spammed to create fake accounts. No route has any limit.

**Limits**

| Route | Limit | Counted per | Why |
|---|---|---|---|
| `POST /auth/login` | 5 / minute | IP **+ email** | Stops guessing one account's password. Counting per email too means people sharing an IP (office, university Wi‑Fi, mobile carrier) don't lock each other out. |
| `POST /auth/login` | 30 / minute | IP | Stops one IP from trying many different accounts (credential stuffing). |
| `POST /auth/register` | 10 / hour | IP | Stops mass fake-account creation. |
| Everything else | 120 / minute | IP | Safety net; normal browsing (search is debounced at 250 ms) stays far below it. |
| `GET /health` | no limit | | The Docker healthcheck calls it every 5 s. |

**Steps**
1. Install `@nestjs/throttler@^6` (supports NestJS 10).
2. New file `backend/src/common/security.ts`: one place for all limits (the table above) and the 429 message *"Prea multe încercări. Încearcă din nou peste un minut."*, so they're easy to tune.
3. `app.module.ts`: register `ThrottlerModule` with the default limit, and `ThrottlerGuard` as a global guard (`APP_GUARD`), so every route is covered without touching each controller.
4. `auth.controller.ts`: `@Throttle(...)` with the stricter limits on `login` and `register`; the login limit uses a tracker key of IP + lower-cased email.
5. `health.controller.ts`: `@SkipThrottle()`.
6. `main.ts`: `app.set('trust proxy', ...)` driven by a new optional `TRUST_PROXY` env var. Without it, behind a reverse proxy (nginx, Render, Railway…) every user would appear to have the proxy's IP and share one limit. Default off, since `docker compose` has no proxy.

### Part B: security headers (`helmet`)

**Problem:** responses have no security headers, and `X-Powered-By: Express` advertises the framework.

**Steps**
7. Install `helmet@^8`; in `main.ts` add `app.use(helmet(...))`. It removes `X-Powered-By` and adds `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, etc.
8. Content-Security-Policy is turned off only while Swagger is enabled, because Swagger UI's page needs inline scripts/styles that the default CSP blocks. In production (no Swagger) the strict CSP stays on.

### Part C: Swagger only outside production

**Problem:** `/api/docs` is always public and lets anyone explore and call every route.

**Steps**
9. New env var `SWAGGER_ENABLED`. Default: on when `NODE_ENV !== 'production'`, off in production. `SWAGGER_ENABLED=true/false` overrides either way.
10. `docker-compose.yml`: the Dockerfile sets `NODE_ENV=production`, so without a change the docs would disappear from the local Docker setup the README describes. Add `SWAGGER_ENABLED: ${SWAGGER_ENABLED:-true}` there, so local Docker keeps the docs and a real deployment simply doesn't set it.

### Part D: tests and docs

11. Add `supertest` + `@types/supertest` (dev only). New `common/security.spec.ts`:
    - boots a tiny Nest app with the real throttler config and a dummy login route; 5 requests with the same email → OK, 6th → **429** with the Romanian message;
    - a different email from the same IP is still allowed (proves the IP + email key);
    - `swaggerEnabled()` returns the right value for each `NODE_ENV` / `SWAGGER_ENABLED` combination.
12. `README.md`: new "Securitate" lines (limits, helmet, Swagger switch), `429` in the API table for `/auth/login` and `/auth/register`, and the new env vars. `backend/.env.example`: add `SWAGGER_ENABLED` and `TRUST_PROXY` with comments.
13. Manual check after `docker compose up --build`: 6 wrong logins in a row → the 6th shows the "Prea multe încercări" message in the login form; `curl -I` shows the helmet headers; `/api/docs` still opens locally.
14. In this file, tick item 2 as `[x]`.

### How it affects the project

| Area | Effect |
|---|---|
| **API** | New **429 Too Many Requests** response when a limit is exceeded, with a `Retry-After` header and `{ statusCode, message }` body. Extra response headers from helmet. No route, body, or other status code changes. |
| **Frontend** | No code change. `api.ts` already turns `message` into an error, so the login/register form shows "Prea multe încercări…" in its existing red alert. |
| **Swagger** | Still at `/api/docs` for `npm run start:dev` and local `docker compose`; gone in a production deployment unless `SWAGGER_ENABLED=true`. |
| **Database** | None. |
| **Dependencies** | `@nestjs/throttler`, `helmet` (runtime); `supertest`, `@types/supertest` (dev). |
| **Config** | Two new optional env vars: `SWAGGER_ENABLED`, `TRUST_PROXY`. Nothing breaks if they're unset. |
| **Limitations** | Counters are kept in memory: they reset when the API restarts, and with several API instances each one counts separately. When the app scales out, switch the throttler storage to Redis. |
| **Later items** | [#7](#idea-7) (password reset) and [#16](#idea-16) (Turnstile) reuse `security.ts` to add limits on the reset-email route and a CAPTCHA after repeated failures. |
| **Risk** | Low. Main risk is limits that are too strict for real users; they're all in one file and easy to adjust. |

### Files to change

`backend/package.json`, `backend/src/app.module.ts`, `backend/src/main.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/health.controller.ts`, new `backend/src/common/security.ts`, new `backend/src/common/security.spec.ts`, `docker-compose.yml`, `backend/.env.example`, `README.md`.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-3"></a>
## 3. Delete dead frontend code

**Status:** ❌ cancelled 2026-11-05 · replaced by [#18 Adopt the "Red Neon 4K" theme](#idea-18). The files stay: the neon design is planned to become the app's look. The plan below is kept for history.

Remove three frontend files that nothing uses. No backend, API or database change.

### What's there now (checked 2026-11-05)

| File | Size | What it is | Why it's dead |
|---|---|---|---|
| `frontend/src/components/EventCard.tsx` | ~2 KB | Event card for a "neon" design | Not imported anywhere. Declares its **own** `EventItem` type (`date`, `id: string \| number`) that conflicts with the real one in `src/types.ts` (`startsAt`, status flags from the API), and works out "full" itself, against the "all logic is in the API" rule. |
| `frontend/src/components/Navbar.tsx` | ~2 KB | A second navbar | Not imported; the real navbar lives in `App.tsx`. Links to `/my-registrations` and `/admin/events` and checks an `ADMIN` role; none of these exist (the real routes are `/inscrierile-mele` and `/organizator`, the roles are `PARTICIPANT` and `ORGANIZER`). |
| `frontend/src/index.css` | ~9 KB, 434 lines | "Pure Black & Red Neon 4K" theme (`--neon-red`, `.neon-card`, `.btn-neon`…) | Not imported (`main.tsx` imports only `styles.css`). None of the pages use a class that is defined only in this file. |

Because none of them is imported, Vite already leaves them out of the built app. Deleting them doesn't change what users see or download; it removes misleading code for whoever reads the project next.

### Steps

1. **Back up first.** The project isn't a git repository, so a deletion can't be undone. Either run `git init` + a first commit (recommended: it also protects ideas 1 and 2), or copy the three files to a backup folder.
2. Delete `frontend/src/components/EventCard.tsx`, `frontend/src/components/Navbar.tsx`, `frontend/src/index.css`, and the then-empty `frontend/src/components/` folder.
3. Check nothing broke:
   - `npx tsc --noEmit` in `frontend` (passes today, before the change; must still pass);
   - `npm run build` (TypeScript + Vite production build);
   - search `src/` for `components/`, `index.css`, `neon-`, `btn-neon`: no results;
   - `npm run dev` and click through the events list, an event page, login/register, "Înscrierile mele" and the organizer dashboard: the look is unchanged.
4. Keep `ENDPOINTS.health` in `src/endpoints.ts`. It's unused in the frontend today, but it's one line, it mirrors a real backend route, and it'll be handy for a "server unreachable" banner.
5. Add an Inbox note for [#13](#idea-13): an unused-code check (e.g. `knip`) in CI, so dead files are caught automatically next time. TypeScript's `noUnusedLocals` alone wouldn't have caught these, because it doesn't flag files that are never imported.
6. In this file, tick item 3 as `[x]`. `README.md` needs no change: its "Structura" section doesn't mention `components/`.

### How it affects the project

| Area | Effect |
|---|---|
| **Users** | None. The files were never part of the built app. |
| **Bundle size** | Unchanged (they were never bundled). About 13 KB of source removed. |
| **Code clarity** | No second `EventItem` type, no navbar pointing to routes and roles that don't exist, one stylesheet instead of two. |
| **Backend / API / DB** | None. |
| **Later items** | Less to sort through in [#11](#idea-11) (new event fields and cover image on the cards) and [#13](#idea-13) (linting, frontend tests). |
| **Risk** | Very low. The only real risk is losing the neon design if you wanted it later, which is why step 1 is a backup. |

### Question before starting

`index.css` is a complete alternative theme ("Red Neon 4K"), and the current `styles.css` has a comment about a neon tube. **Were you planning to switch the app to that neon design?** If so, we shouldn't delete it; instead we'd make a separate idea "adopt the neon theme", based on these files. If not, delete as planned.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-4"></a>
## 4. TypeORM migrations instead of `synchronize`

**Status:** ✅ done 2026-11-05 · 49/49 backend tests pass, TypeScript compiles, all live checks passed, Docker image builds · **Type:** Production · **Effort:** S

**Files changed:** `backend/package.json` (+ dev `ts-node` 10, 6 `migration:*` scripts), `backend/src/app.module.ts`, new `backend/src/database/data-source.ts`, new `backend/src/database/cli-data-source.ts`, new `backend/src/database/data-source.spec.ts`, new `backend/src/database/migrations/1793883387970-InitialSchema.ts`, `backend/.env.example`, `README.md` (new "Migrări" section).

**Live checks** (throwaway `postgres:16-alpine` on port 55432, deleted afterwards; your `pgdata` volume was never touched):

| Check | Result |
|---|---|
| Compiled API started on an empty database | ✅ created `users`, `events`, `registrations`; `migrations` has 1 row; `/api/health` = ok |
| `migration:check` on that database | ✅ "No changes in database schema were found", exit 0 |
| Database created the old way (`synchronize`) + 1 user, then `migration:run` | ✅ no table created (baseline), migration recorded, **user kept** |
| `migration:check` on the old-style database | ✅ no changes, so the old schema is identical to the migration's |
| `migration:revert` then `migration:run` | ✅ tables dropped, then created again |
| `migration:check` with a stray column added | ✅ fails (exit 1) and prints the missing SQL |
| `docker build ./backend` | ✅ image contains `dist/database/migrations/…InitialSchema.js`, the `migration:run:prod` script and the TypeORM CLI |

**Differences from the plan:**
- Two files instead of one: `data-source.ts` (options only, no side effects, so the app and the tests can import it) and `cli-data-source.ts` (the `DataSource` the CLI needs).
- The first live run showed `pg` warning "client.query() when the client is already executing a query": the baseline guard checked the 3 tables in parallel on one connection. Fixed to check them one after another.
- `docker-compose.yml` unchanged: `DB_MIGRATIONS_RUN` defaults to `true`, which is what local Docker needs.

Replace automatic schema sync with versioned migration files. No API or frontend change.

### Problem

`app.module.ts` has `synchronize: true`. On every start, TypeORM compares the entities with the database and changes the database to match, with no review and no history:
- **Renaming a property** (e.g. `location` → `venue`) makes TypeORM drop the old column and create a new empty one, and that column's data is gone.
- **Changing a type or length** can truncate or drop data the same way.
- There's no record of *what* changed *when*, and no way to undo a change.
- The README itself says "pentru producție se folosesc migrări".

With migrations, every schema change is a `.ts` file in git that you read before it runs, the database records which ones were applied, and each one can be reverted.

### Steps

**Setup**
1. Install `ts-node` (dev only). TypeORM 0.3.31 is already installed and its command-line tool needs `ts-node` to read `.ts` files.
2. New file `backend/src/database/data-source.ts`, the one place for database settings:
   - connection values (host, port, user, `secret('DB_PASSWORD')`, database), the same as today;
   - an explicit entity list `[User, Event, Registration]` (`autoLoadEntities` only works inside Nest, and the command-line tool runs outside Nest);
   - `migrations: [__dirname + '/migrations/*.{ts,js}']`, so the same path works with `ts-node` in development and with compiled `.js` in Docker;
   - `synchronize: false`;
   - a default export `new DataSource(...)` for the command-line tool.
3. `app.module.ts`: use these same options, plus `migrationsRun` so pending migrations run automatically when the API starts. `docker compose up` keeps working with no extra step. A new optional env var `DB_MIGRATIONS_RUN` (default `true`) turns this off for deployments that run migrations as a separate step.
4. `package.json` scripts:
   - `migration:generate -- src/database/migrations/Name`: compares entities with the database and writes a new migration;
   - `migration:run` / `migration:revert` / `migration:show`;
   - `migration:check`: fails if the entities and the migrations differ, so a forgotten migration is caught (`--check`, supported by 0.3.31). It goes into CI in [#13](#idea-13);
   - `migration:run:prod`: runs compiled migrations inside the Docker image (`node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js`).

**First migration**
5. Generate `InitialSchema` against an **empty, throwaway** Postgres (`docker run --rm -e POSTGRES_PASSWORD=tmp -p 55432:5432 postgres:16-alpine`). It doesn't need `secrets/` and never touches your real data. Expected content: the `uuid-ossp` extension, tables `users`, `events`, `registrations`, the unique email, `UNIQUE(userId, eventId)`, and the foreign keys with `ON DELETE CASCADE`.
6. **Baseline guard for databases that already exist.** Your `pgdata` volume, and anyone else's, already has these tables, created by `synchronize`. Run as-is, `InitialSchema` would fail with "relation already exists". So at its start: if `users`, `events` and `registrations` already exist, it creates nothing and only gets recorded as applied. `synchronize` and `migration:generate` use the same naming rules, so an existing schema is identical to what the migration would create.
7. Remove `synchronize: true` from `app.module.ts`.

**Checks**
8. Unit test `database/data-source.spec.ts`: `synchronize` is `false`, the migrations path is set, all 3 entities are listed, and `migrationsRun` follows `DB_MIGRATIONS_RUN`.
9. Check against the throwaway Postgres:
   - empty database → API start creates all tables, and the `migrations` table has 1 row;
   - `migration:check` → "no changes", which proves the migration matches the entities;
   - database created the old way (`synchronize`) → the baseline is skipped, recorded, and no data is lost;
   - `migration:revert` → tables removed; `migration:run` → back again.
10. `npm test` (all 40+ tests) and `npx tsc --noEmit`; `docker compose build` to confirm the image builds and `dist/database/migrations/*.js` is inside it.

**Docs**
11. `README.md`: remove the "`synchronize: true`" sentence; add a "Migrări" section explaining how to change the schema (edit entity → `npm run migration:generate` → read the file → commit → it runs at the next start) plus `DB_MIGRATIONS_RUN`. `backend/.env.example`: add `DB_MIGRATIONS_RUN`.
12. In this file, tick item 4 as `[x]`.

### How it affects the project

| Area | Effect |
|---|---|
| **Your data** | Kept. The baseline guard recognises the existing tables, so there's no `docker compose down -v`. |
| **Running the app** | Same commands as today. Migrations run on startup; with nothing new to apply, startup only does one extra query. |
| **Changing the schema** | New rule: after editing an entity you must run `migration:generate` and commit the file. Skip it and the app starts, but the new column is missing and queries fail; `migration:check` (later in CI) catches this. |
| **Database** | One new table, `migrations` (the list of applied migrations). Existing tables unchanged. |
| **API / frontend** | None. |
| **Dependencies** | `ts-node` (dev only). |
| **Config** | One new optional env var, `DB_MIGRATIONS_RUN`. |
| **Limitations** | Running migrations on startup is fine with one API instance. If several start at once, run `migration:run:prod` as a separate deploy step and set `DB_MIGRATIONS_RUN=false`. |
| **Later items** | Every idea that changes the database ships with its own migration: [#7](#idea-7) reset tokens, [#8](#idea-8) refresh tokens, [#9](#idea-9) waitlist, [#11](#idea-11) `endsAt` / category / image, [#15](#idea-15) check-in. Do this one **before** those. |
| **Risk** | Low–medium. The delicate part is step 6 on an existing database; it gets its own check in step 9. |

### Files to change

`backend/package.json`, `backend/src/app.module.ts`, new `backend/src/database/data-source.ts`, new `backend/src/database/data-source.spec.ts`, new `backend/src/database/migrations/<timestamp>-InitialSchema.ts`, `backend/.env.example`, `README.md`.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-5"></a>
## 5. Pagination + `available` filter in SQL + aggregate summary

**Status:** ✅ done 2026-11-05 · 65/65 unit tests + 12/12 integration tests pass, backend and frontend compile, 15/15 end-to-end API checks pass · browser check (step 15) still to do · **Type:** Performance · **Effort:** M (was S–M: adds the first database-backed tests)

**Files changed:** `backend/src/events/dto/event.dto.ts`, `backend/src/events/events.service.ts`, `backend/src/events/event.entity.ts`, `backend/src/registrations/registration.entity.ts`, new `backend/src/common/escape-like.ts` + `.spec.ts`, new `backend/src/common/paginated.ts`, new `backend/src/events/dto/event.dto.spec.ts`, new `backend/src/database/migrations/1793884528097-AddEventIndexes.ts`, new `backend/src/events/events.service.int-spec.ts`, new `backend/src/test/int-db.ts`, new `backend/jest.int.config.js`, `backend/package.json` (`test:int`, `test:db:up`, `test:db:down`), `frontend/src/types.ts`, `frontend/src/pages/EventsPage.tsx`, `frontend/src/styles.css` (`.more`), `README.md`.

**Checks:**

| Check | Result |
|---|---|
| Integration tests (real Postgres, schema from migrations) | ✅ 12/12: pages of 20/20/5 with no duplicates (incl. 15 events at the same time), empty page past the end, desc sort, past events excluded, seat filter excludes full events from items **and** total, `%`/`_`/`\` searched literally, case-insensitive, `isRegistered` per viewer, summary numbers |
| Do the tests catch the bug? | ✅ with `escapeLike` removed on purpose, the `%` and `_` tests fail |
| `migration:check` with the new `@Index`es | ✅ no changes |
| End-to-end through the real HTTP API (25 events created via `POST /events`) | ✅ 15/15: response shape, page sizes, defaults, seat filter, `100%` search, participant flags, four 400 cases with Romanian field messages, summary |
| Frontend `npm run build` (TypeScript + Vite) | ✅ |

**Differences from the plan:**
- A unit test caught a real bug: for `?page=abc` the API answered "Pagina minimă este 1." because the error formatter shows the first failing rule and class-validator reported `@Min` first. Fixed by putting `@IsInt` next to the property; now it answers "Pagina trebuie să fie un număr întreg.".
- Added `npm run test:db:up` / `test:db:down` to start and stop the test Postgres, and a safety check: integration tests refuse to run on a database whose name doesn't contain "test" (they delete every table).
- "Load more" also skips an event it already shows, in case the list shifted between pages (e.g. an event filled up while "Doar cu locuri libere" is on).
- The search box got `maxLength={100}`, matching the API limit.

Four connected changes to how events are read. One API response changes shape; the frontend events page is updated in the same change.

### Problems (checked 2026-11-05)

1. **No pagination.** `GET /events` returns *every* upcoming event, and for each response it also loads registration counts and the viewer's registrations. With 5,000 events, every visit to the home page (and every search keystroke, after the 250 ms debounce) sends all 5,000.
2. **"Doar cu locuri libere" is filtered in JavaScript**, after the query (`views.filter(e => e.availableSeats > 0)`). That already wastes work, and with pagination it would be **wrong**: a page of 20 could come back with 3 items, and the total would count full events too. It has to move into SQL.
3. **`summary()` loads all of an organizer's events** with their counts, only to compute three numbers in JavaScript.
4. **Search treats `%` and `_` as wildcards.** They go straight into `ILIKE '%…%'`, so searching `100%` or `_` matches almost everything. There's also no length limit on `search`.

Also found: `registrations` has no index on `eventId` (the `UNIQUE(userId, eventId)` index starts with `userId`, so it doesn't help), and `events` has no index on `startsAt`. Every count of registrations per event and every "upcoming, sorted by date" query scans the whole table.

### Part A: pagination on `GET /events`

1. `ListEventsQuery` (`events/dto/event.dto.ts`) gets:
   - `page`: integer ≥ 1, default 1;
   - `limit`: integer 1–50, default 20;
   - `search`: max 100 characters.
   Query strings arrive as text, so `@Type(() => Number)` converts them. Invalid values → 400 with a Romanian message per field, like the other forms.
2. **Response shape changes** from an array to:
   ```json
   { "items": [ /* events, same fields as today */ ], "total": 134, "page": 2, "limit": 20, "totalPages": 7 }
   ```
   An object is clearer than an array plus a total in a header, and it doesn't need extra CORS settings. The only consumer is `EventsPage`, updated in Part E.
3. `findUpcoming` uses `skip`/`take` + `getManyAndCount()` (items and total come from the database). Order by `startsAt`, then `id`, so events with the same start time don't jump between pages.
4. The viewer's `isRegistered` / `canRegister` flags are computed only for the 20 events on the page, not for all of them.
5. Not paginated for now: `GET /events/mine` (an organizer has few events) and `GET /registrations/me`. Noted for later if needed.

### Part B: "available seats" filter in SQL

6. When `available=true`: `AND e.capacity > (SELECT COUNT(*) FROM registrations r WHERE r."eventId" = e.id)`. The filtered events never leave the database, so `total` and `totalPages` are correct.
7. **Indexes, through a migration** (the first real use of [#4](#idea-4)): `@Index()` on `Registration.eventId` and `Event.startsAt`, then `npm run migration:generate -- src/database/migrations/AddEventIndexes`. Read the generated file, check that `migration:check` passes.

### Part C: `summary()` as one SQL query

8. One query instead of loading everything:
   ```sql
   SELECT COUNT(DISTINCT e.id)                                      AS "eventsCount",
          COUNT(DISTINCT e.id) FILTER (WHERE e."startsAt" > now())  AS "upcomingCount",
          COUNT(r.id)                                               AS "totalRegistrations"
   FROM events e LEFT JOIN registrations r ON r."eventId" = e.id
   WHERE e."organizerId" = :id
   ```
   Postgres returns counts as text, so they're converted with `Number()`. The response `{ eventsCount, upcomingCount, totalRegistrations }` stays identical.
   Small behaviour detail: "upcoming" now uses the database clock (`now()`), the same as the event list already does, instead of the API server's clock.

### Part D: safe search

9. New helper `escapeLike()` in `common/`: escapes `\`, `%` and `_` before building `%…%`, so `100%` searches for the text "100%". Postgres `ILIKE` uses `\` as its escape character by default.
10. Full-text search (word stems, ranking, Romanian diacritics) stays out of scope; it's a separate idea if search ever needs to be smarter.

### Part E: frontend events page

11. `types.ts`: a generic `Paginated<T>` type (`items`, `total`, `page`, `limit`, `totalPages`).
12. `EventsPage.tsx`:
    - a **"Încarcă mai multe"** button under the list (adds the next page). On phones it's simpler than page numbers, and it matches how the list already scrolls;
    - a line "Afișate 20 din 134 evenimente";
    - changing the search, sort or seats filter goes back to page 1;
    - a guard against out-of-order responses: if an older request finishes after a newer one (slow network while typing), its result is ignored.

### Part F: tests and docs

13. **Unit tests:** `escapeLike()` (`%`, `_`, `\`, normal text); `ListEventsQuery` validation (page 0 → 400, limit 51 → 400, `"2"` → 2, defaults, search over 100 characters → 400).
14. **New: database-backed tests** (`*.int-spec.ts`, run with `npm run test:int`). The service's SQL can't be meaningfully tested with mocks, so these run against the throwaway Postgres used in idea 4, with the schema built by the real migrations:
    - 45 events → page 1 has 20, page 3 has 5, `total` 45, `totalPages` 3, no event on two pages;
    - `available=true` with some full events → full ones excluded **and** `total` counts only the rest;
    - search `100%` finds only the event titled "100% Jazz"; `_` matches nothing unexpected;
    - past events never appear;
    - `summary()` returns the same numbers as the old code for a mixed set (past/future, with and without registrations).
    `npm test` stays fast and needs no database; `test:int` is separate and goes into CI in [#13](#idea-13).
15. Manual check in the browser: search, sort, "Doar cu locuri libere", "Încarcă mai multe", and the count line.
16. `README.md`: the `GET /events` row (new params, new response shape), a note on `npm run test:int`. In this file, tick item 5 as `[x]`.

### How it affects the project

| Area | Effect |
|---|---|
| **API** | **Breaking change for `GET /events`:** returns `{ items, total, page, limit, totalPages }` instead of an array. New optional params `page`, `limit`; invalid values → 400. `search` over 100 characters → 400. `GET /events/:id`, `/events/mine`, `/events/mine/summary` keep the same shape. |
| **Frontend** | Events page gets "Încarcă mai multe" and "Afișate X din Y". No other page changes. |
| **Search** | `%` and `_` are searched literally. |
| **Database** | One migration adding 2 indexes (`registrations.eventId`, `events.startsAt`). No data changes. |
| **Performance** | Home page and search send at most 20 events. Seat filter and summary run in the database, using the new indexes. |
| **Tests** | First database-backed test suite (`npm run test:int`, needs Docker), reusable for later ideas. |
| **Later items** | [#9](#idea-9) waitlist and [#12](#idea-12) analytics reuse the same SQL-count pattern and the integration tests; [#11](#idea-11) categories add one more filter to the same query; [#18](#idea-18) neon theme will style the "load more" button. |
| **Risk** | Low–medium. The response-shape change is the main risk; it's covered by TypeScript on the frontend, the integration tests and the manual check. |

### Files to change

`backend/src/events/dto/event.dto.ts`, `backend/src/events/events.service.ts`, `backend/src/events/event.entity.ts` (`@Index`), `backend/src/registrations/registration.entity.ts` (`@Index`), new `backend/src/common/escape-like.ts` + spec, new `backend/src/events/dto/event.dto.spec.ts`, new migration `…-AddEventIndexes.ts`, new `backend/src/events/events.service.int-spec.ts` + its Jest config, `backend/package.json` (`test:int`), `frontend/src/types.ts`, `frontend/src/pages/EventsPage.tsx`, `README.md`.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-6"></a>
## 6. Transactional email (Resend)

**Status:** ✅ done 2026-11-05 · 113/113 unit + 23/23 integration tests, 19/19 end-to-end checks (real API + fake Resend server), Docker image builds · **delivery to a real inbox (step 17) waits for an API key** · **Type:** Feature + API · **Effort:** M

**Files changed:** new `backend/src/mail/` (`mail.config.ts`, `mailer.ts`, `resend.mailer.ts`, `log.mailer.ts`, `templates.ts`, `outbox.entity.ts`, `outbox-retry.ts`, `notifications.service.ts`, `outbox.worker.ts`, `mail.module.ts` + 3 unit specs + `mail.int-spec.ts`), new migration `1793886555958-AddEmailOutbox.ts`, `backend/src/registrations/registrations.service.ts` (+ module, spec), `backend/src/events/events.service.ts` (+ module, spec, int-spec), `backend/src/app.module.ts` (`ScheduleModule`), `backend/src/database/data-source.ts` (entity), `backend/src/test/int-db.ts`, new `backend/src/common/encoding.spec.ts`, `backend/package.json` (+ `resend` 6.37, `@nestjs/schedule` 4.1), `backend/Dockerfile` (Node 20 → 24), `docker-compose.yml`, `setup-secrets.ps1`, `setup-secrets.sh`, `backend/.env.example`, `README.md` (new "Email" section).

**Checks:**

| Check | Result |
|---|---|
| Unit: templates (Bucharest time, HTML escaping, no newlines in subject, links, old → new), retry rules, `ResendMailer` against a local fake Resend server (payload, `Authorization`, `Idempotency-Key`, `x-batch-validation: permissive`, per-index errors, 429 + `retry-after`, 403, 500, server down), mailer choice | ✅ 25 new |
| Unit: services queue emails in the same transaction, nothing on rejection, "notify then delete" order | ✅ 8 new |
| Does the escaping test catch a missing `escapeHtml`? | ✅ fails with it removed |
| Integration (real Postgres): registration → 2 rows; rejected (full) → 0; rollback after queueing → 0; cancel → 2 with seats left; capacity-only edit → 0, date/location edit → 1 per participant; delete with 3 participants → 3 rows, event + registrations gone | ✅ |
| Integration: worker sends due emails in one batch → `SENT`; temporary error → retry only after the delay; rejected address → only that one `FAILED`; **two workers at once on 150 emails → 100 + 50, each sent exactly once**; same batch → same idempotency key on retry | ✅ 5 runs in a row, no flakes |
| End-to-end: compiled API + fake Resend: 9 emails for register ×2 / capacity edit / location edit / cancel / delete, delivered within one 15 s tick, 19:00 Bucharest for a 17:00 UTC event, escaped title, links, organizer seat counts, no duplicates, outbox all `SENT`; without a key → warning at startup, 2 emails logged, nothing sent | ✅ 19/19 |
| `migration:check` | ✅ no changes |
| Docker image (Node 24.22): `ro-RO` + `Europe/Bucharest` → "marți, 1 decembrie 2026 la 19:00"; SDK loads; 3 migrations inside | ✅ |

**Differences from the plan / found along the way:**
- **Organizer emails** added (decision 3): new registration and cancellation, with seats taken.
- **Node 20 → 24 in the Dockerfile.** `resend` 6.37 requires Node ≥ 22.12, and Node 20 has been end-of-life since April 2026.
- **Batch "permissive" mode:** one invalid address no longer fails the whole batch of 100; it alone becomes `FAILED` (no retry), the rest are sent.
- **Idempotency key** per batch (hash of the email ids): if Resend accepted a batch but the reply was lost, the retry doesn't send it twice.
- **Clock bug caught by the tests:** the worker first compared `sendAfter` (database clock, microseconds) with Node's clock (milliseconds), so a just-queued email could look "not due". Fixed: the worker uses the database clock (`SELECT now()`).
- **`EventsService.remove` is now a locked transaction:** nobody can register between reading the participant list and deleting the event.
- **Unrelated bug found and fixed while working:** `events.service.ts` had all Romanian letters double-encoded ("gÄƒsit" instead of "găsit") since commit `d5d89ce`, so several API error messages reached users garbled. Cause: my break-and-restore test in idea 5 used PowerShell's `Get-Content`, which reads UTF-8 as Windows-1252. Reversed exactly (diff against the last clean commit shows only idea 5's changes). New `common/encoding.spec.ts` fails the test suite if any `src/` file contains double-encoded text (checked: it catches the broken version).
- Also fixed in `README.md`: a stray "Lr" at the start of two lines in "Secrete" (present since the initial commit, likely from one of my edits in idea 1) and a stray " ," in "Teste".

The app sends no email today. The worst gap: when an organizer **deletes** an event, every registration is deleted with it (`ON DELETE CASCADE`) and the participants are never told. Same when the date or place changes.

### Emails

| When | To | Content |
|---|---|---|
| Registration succeeds | the participant | "Te-ai înscris la «Titlu»": date and time, location, link to the event |
| Registration cancelled | the participant | short confirmation, link to the event |
| Event's **date/time, location or title** changes | every registered participant | what changed (old → new), link |
| Event deleted | every registered participant | "Evenimentul «Titlu» a fost anulat" with the date it was planned for |
| Someone registers | the event's organizer | "«Nume» s-a înscris la «Titlu»", seats taken / capacity, link to the dashboard |
| Someone cancels | the event's organizer | "«Nume» și-a anulat înscrierea la «Titlu»", seats taken / capacity |

Changes to capacity or description alone send nothing (they don't affect someone who's coming).

### Resend facts this plan relies on (checked 2026-11-05)

- **Free plan:** 100 emails/day, 3,000/month; the daily quota resets at midnight UTC. ([quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [pricing](https://resend.com/pricing))
- **Rate limit:** 10 requests/second per team, same on every plan; over it → 429 with `retry-after`. ([rate limit](https://resend.com/changelog/api-rate-limit))
- **Batch API:** up to 100 emails in one request, counted as 1 request; the whole batch fails if one email in it is invalid. ([batch sending](https://resend.com/docs/dashboard/emails/batch-sending))
- **Without your own domain**, the sender `onboarding@resend.dev` can only deliver to the email address of your Resend account; other recipients get a 403. `delivered@resend.dev` is a test recipient. Sending to real participants needs a verified domain. ([403 with resend.dev](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain))

### Part A: sending layer (`backend/src/mail/`)

1. `Mailer` interface with one method, `sendBatch(messages)`, and two implementations:
   - `ResendMailer`: the official `resend` Node SDK, batch endpoint.
   - `LogMailer`: writes "would send: to, subject" to the log and sends nothing. **Used automatically when there's no API key**, so local development and tests never send real mail by accident.
2. Configuration:
   - `RESEND_API_KEY`: a secret, read like the others (`secrets/resend_api_key.txt` → `/run/secrets/…`, or `.env` locally). Empty → `LogMailer`, with one warning at startup.
   - `MAIL_FROM`: default `EventHub <onboarding@resend.dev>`.
   - `APP_URL`: the frontend's address for links in emails (default `http://localhost:5173`).
   - `APP_TIMEZONE`: default `Europe/Bucharest`. **Needed:** the API container runs in UTC, so without it "19:00" would be written as "17:00" in the email.
3. `setup-secrets.ps1` / `.sh` create an **empty** `resend_api_key.txt` if it's missing. Docker Compose refuses to start when a declared secret file doesn't exist, so this keeps `docker compose up` working for anyone without a key.

### Part B: outbox (emails are queued in the database, then sent)

Instead of calling Resend in the middle of a request, each action writes the emails it needs into a table, **in the same database transaction as the action itself**, and a background job sends them.

4. New table `email_outbox` (migration): recipient, subject, HTML, text, kind, status (`PENDING` / `SENT` / `FAILED`), attempts, last error, `sendAfter`, `createdAt`, `sentAt`.
5. Background job (`@nestjs/schedule`, every 15 seconds):
   - takes up to 100 `PENDING` rows that are due, with `FOR UPDATE SKIP LOCKED` (two API instances never pick up the same email);
   - sends them in **one** batch request;
   - success → `SENT`. Failure → attempts + 1 and retry later (1, 2, 4, 8 minutes…; uses `retry-after` on a 429); after 5 failed attempts → `FAILED` with the error saved.

**Why the outbox and not "just send it":**
- **No wrong emails:** if registration fails (event just filled up) the transaction rolls back and the queued email disappears with it. Sending directly could confirm a registration that didn't happen, or the reverse.
- **No lost emails:** if Resend is down, the API restarts, or the daily quota is used up, emails wait and go out later.
- **Fast requests:** "Înscrie-te" doesn't wait for an outside service.
- **Limits:** deleting an event with 300 participants = 3 batch requests, not 300 calls against the 10/second limit.
- **History:** the table shows what was sent, when, and why something failed.
- **Reused later:** [#7](#idea-7) password reset, [#9](#idea-9) waitlist and [#10](#idea-10) reminders all just add rows.

### Part C: email content (`mail/templates.ts`)

6. One pure function per email, returning `{ subject, html, text }` in Romanian. A plain-text version always goes too (better deliverability, readable anywhere).
7. **HTML escaping** of everything an organizer typed (title, location, description). Otherwise `<a href=…>` in a title would become a real link inside the email.
8. Dates formatted with `ro-RO` in `APP_TIMEZONE`; links built from `APP_URL` (`/events/:id`).
9. Simple layout (inline styles: email clients ignore `<style>` files) in the app's black/red colours. The full neon look waits for [#18](#idea-18).

### Part D: where emails are queued

10. `RegistrationsService.register`: confirmation, inside the existing locked transaction.
11. `RegistrationsService.cancel`: cancellation confirmation, inside the transaction from [#1](#idea-1).
12. `EventsService.update`: inside its transaction (from [#1](#idea-1)), compares old and new **date/time, location, title**; if any changed, one email per registered participant.
13. `EventsService.remove`: now a transaction: read the participants → queue "event cancelled" → delete the event. Today the registrations disappear first, and with them the list of people to tell.
14. One email per person (never one email with everyone in To/CC), so participants' addresses stay private.

### Part E: tests

15. **Unit:** templates (escaping `<script>` in a title, the time in Europe/Bucharest, link built from `APP_URL`, old → new values); the job with a fake mailer (success → `SENT`; failure → attempts and the next retry time; 5th failure → `FAILED`; 429 uses `retry-after`); mailer choice (no key → `LogMailer`).
16. **Database-backed** (`test:int`):
    - successful registration → 1 row; registration rejected because the event is full → **0 rows** (proves the rollback);
    - changing only the capacity → 0 rows; changing the date → 1 row per participant;
    - deleting an event with 3 participants → 3 rows, event gone;
    - two job runs at the same time → each email is sent once (`SKIP LOCKED`).
17. **Real send (needs your key):** with `MAIL_FROM` = `onboarding@resend.dev`, register with your own Resend account's email address → the email arrives; check it in Gmail/Outlook (Romanian diacritics, time, link).

### Part F: docs

18. `README.md`: an "Email" section (what's sent and when, how to get a key, the `resend.dev` limitation and verifying a domain, `LogMailer` when there's no key, the free-tier quota) and the new env vars. `backend/.env.example`. In this file, tick item 6 as `[x]`.

### How it affects the project

| Area | Effect |
|---|---|
| **Users** | Participants get the 4 emails above. Nothing changes on screen. |
| **API** | No route or response changes. Register / cancel / edit / delete each write a few more rows inside their transaction. |
| **Database** | New table `email_outbox` (one migration). Rows stay as history; cleanup of old `SENT` rows can come later. |
| **Without a key** | Everything works; emails are logged instead of sent. Tests never send. |
| **Docker** | One new optional secret, `resend_api_key` (an empty file is fine). |
| **Dependencies** | `resend` (official SDK), `@nestjs/schedule`. |
| **Free-tier limit** | 100 emails/day. Deleting a big event can use the day's quota; the rest wait in the outbox and go out after midnight UTC. A real deployment would need a paid plan or patience. |
| **Privacy** | Participants' emails go to Resend (it's the sender). Worth one line in a future privacy page. |
| **Later items** | [#7](#idea-7), [#9](#idea-9), [#10](#idea-10) add rows to the outbox. [#10](#idea-10)'s reminders reuse `@nestjs/schedule`. |
| **Risk** | Medium. New background job and an outside service; the outbox and the tests contain most of it. The main real-world risk is deliverability (spam folder) until a domain with SPF/DKIM is verified. |

### Files to change

New `backend/src/mail/` (`mail.module.ts`, `mailer.ts`, `resend.mailer.ts`, `log.mailer.ts`, `templates.ts`, `outbox.entity.ts`, `outbox.service.ts`, `outbox.worker.ts` + specs), new migration `…-AddEmailOutbox.ts`, `backend/src/registrations/registrations.service.ts`, `backend/src/events/events.service.ts`, `backend/src/app.module.ts`, `backend/src/database/data-source.ts` (entity list), `backend/package.json`, `docker-compose.yml` (secret + env vars), `setup-secrets.ps1`, `setup-secrets.sh`, `backend/.env.example`, `README.md`, new `*.int-spec.ts` tests.

### Decisions (2026-11-05)

1. **Testing without a Resend account:** Claude tests everything itself with `LogMailer`, and tests the real `ResendMailer` code against a **local fake Resend server** (same HTTP calls, nothing leaves the machine). Delivery to a real inbox (step 17) waits for the user's API key.
2. **Outbox** (recommended option) chosen.
3. **Organizer emails added:** the organizer also gets an email when someone **registers** or **cancels** for one of their events (one email per registration / cancellation). If that gets too noisy for popular events, a daily digest is a possible follow-up.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-7"></a>
## 7. Password reset + email verification

**Status:** ✅ done 2026-11-05 · 135/135 unit + 40/40 integration tests, 23/23 end-to-end checks (compiled API + fake Resend), backend and frontend build · **browser check of the 3 new pages still to do** · **Type:** Feature + Security · **Effort:** M · **Depends on:** [6](#idea-6), [2](#idea-2), [4](#idea-4)

**Files changed:** backend: new `auth/auth-token.entity.ts`, `auth/tokens.service.ts`, `auth/verified-email.guard.ts` (+ spec), `auth/account-emails.spec.ts`, `auth/auth.int-spec.ts`, new migration `1793904062668-AddAuthTokens.ts`; changed `auth/auth.service.ts` (+ spec), `auth/auth.controller.ts`, `auth/auth.module.ts`, `auth/jwt-auth.guard.ts`, `auth/roles.ts`, `auth/dto/auth.dto.ts`, `users/user.entity.ts`, `events/event-view.ts` (+ spec), `events/events.controller.ts`, `registrations/registrations.controller.ts`, `mail/templates.ts`, `mail/notifications.service.ts`, `mail/outbox.entity.ts`, `mail/outbox-retry.ts`, `mail/log.mailer.ts`, `common/security.ts`, `common/routes.ts`, `database/data-source.ts`, `package.json` (Jest `testTimeout` 15 s). Frontend: new `pages/PasswordPages.tsx`, `pages/VerifyEmailPage.tsx`; changed `App.tsx`, `auth.tsx`, `api.ts`, `endpoints.ts`, `types.ts`, `pages/AuthPages.tsx`, `pages/EventDetailPage.tsx`, `pages/EventFormPage.tsx`, `styles.css`. `README.md` (routes, new "Cont" section).

**Checks:**

| Check | Result |
|---|---|
| Integration (real Postgres): verify link single-use / expired / invented; resend cancels old link; DB holds only hashes; forgot identical for existing vs unknown email, email only for existing; reset: old password fails, new works, **JWT from before the reset rejected**, `tokenVersion` 1; "password changed" email; reset verifies the email; link single-use; new request cancels old; expired rejected; verify link can't be used as reset link; **two simultaneous resets with one link → exactly one succeeds**; deleted user's token rejected; pre-`tv` tokens accepted as version 0; role/verified read from DB; sensitive emails delivered whole but scrubbed in the queue | ✅ 17 new |
| Do the tests catch the two critical lines? | ✅ guard without `tokenVersion` check → "old sessions closed" fails; tokens without `usedAt IS NULL` → 5 tests fail |
| Migration on a database with an existing user | ✅ user marked verified with its `createdAt`; `migration:check` clean |
| End-to-end via HTTP: unverified organizer `POST /events` → 403 and unverified participant registration → 403 (**guard order correct on both routes**); verification fixes it on the same session; `mustVerifyEmail`; `/auth/me` exposes only public fields; forgot same response, no email to unknown address; short password → field error; reset closes old session; reused link → `TOKEN_INVALID`; queue scrubbed; 4th "forgot" in an hour → 429 "peste 60 de minute" | ✅ 23/23 |

**Differences from the plan / additions:**
- **Reset also verifies the email** (the link reached that mailbox).
- **`canRegister` / new `mustVerifyEmail` come from the API** (in `event-view.ts`), like the other event flags, instead of the frontend guessing from the user object.
- **429 message now states the real wait** ("peste 60 de minute" for hourly limits) instead of always "peste un minut". The one-minute limits keep their old text.
- **Role is read from the database** on each request too, not trusted from the token.
- **StrictMode guard on the verification page:** React runs effects twice in development; without a guard the second call would show "link invalid" right after the first succeeded.
- **Token removed from the address bar** on both link pages.
- **Jest unit `testTimeout` 5 → 15 s:** one `resend.mailer` test failed once while the machine was heavily loaded (all suites ran 5–10× slower); it passes alone and in every other run.

### Problems (checked 2026-11-05)

1. **No way back in.** A user who forgets their password has no recovery path; the only fix today is someone editing the database.
2. **Nobody checks the email address.** Registering with a typo (`ana@gmial.com`) or someone else's address works. Since [#6](#idea-6), the app now *sends* to that address: confirmations, changes, and organizer notices go to whoever owns it.
3. **A password change wouldn't end other sessions.** The JWT is valid for 7 days (`auth.module.ts`) and the guard only checks the signature. After a reset because "someone has my password", that person's existing session would keep working for up to a week.

### Part A: one-time tokens (shared by reset and verification)

1. New table `auth_tokens` (migration): `userId`, `kind` (`PASSWORD_RESET` / `EMAIL_VERIFY`), `tokenHash` (unique), `expiresAt`, `usedAt`, `createdAt`.
2. A token is 32 random bytes (`crypto.randomBytes`), sent in the link as base64url. **Only its SHA-256 hash is stored**: someone who can read the database can't use the tokens in it.
3. Single use (`usedAt`), short-lived: **reset 30 minutes**, **verification 24 hours**. Asking for a new reset link cancels the previous unused one.
4. **Links in the email queue:** `email_outbox` stores each email's full HTML, so the link (with the real token) would sit in the database. For these two kinds, the worker **replaces the HTML/text with "[conținut șters după trimitere]" right after sending**. Combined with the short expiry, a later database leak exposes nothing usable.

### Part B: password reset

5. `POST /auth/password/forgot { email }` → **always** `202` with the same message, "Dacă există un cont cu această adresă, vei primi un email cu instrucțiuni.", whether or not the account exists. Otherwise the form would tell anyone which emails have accounts. An email is queued only when the account exists.
6. `POST /auth/password/reset { token, password }`: same password rules as registration (8–72 characters). Invalid / expired / already used → `400` "Linkul de resetare nu mai este valabil. Cere unul nou." (one message for all three, nothing to probe). On success:
   - new bcrypt hash, token marked used, other unused reset tokens of that user cancelled;
   - **every existing session of that user stops working** (see Part D);
   - a short "Parola ta a fost schimbată" email, so the real owner notices if it wasn't them.
7. Rate limits (in `security.ts`): `forgot` 3/hour per IP + email and 20/hour per IP; `reset` 10/hour per IP.

### Part C: email verification

8. `users.emailVerifiedAt` (nullable). On registration a verification email is queued: "Confirmă adresa de email" with a 24-hour link.
9. `POST /auth/email/verify { token }` → sets `emailVerifiedAt`. `POST /auth/email/resend` (logged in, 3/hour) → new link, previous one cancelled.
10. `GET /auth/me` and the login/register response include `emailVerified: true/false`.
11. **Until verified** (decision 1): a participant **can't register for events**, and an organizer **can't create events**. Both get `403` with `code: "EMAIL_NOT_VERIFIED"` and "Confirmă-ți adresa de email înainte să…". Logging in and browsing still work.
    Consequence: since only verified users can register or organize, the event emails from [#6](#idea-6) only ever go to confirmed addresses.
12. **Existing accounts** (decision 2): the migration marks them as verified (`emailVerifiedAt = createdAt`), so nobody who uses the app today gets locked out.

### Part D: ending other sessions after a password change

13. `users.tokenVersion` (integer, default 0) goes into the JWT as `tv`. A password reset increases it by 1.
14. `JwtAuthGuard` (and `OptionalJwtGuard`) look up the user's current `tokenVersion`: one primary-key query per logged-in request. If it doesn't match the token → `401` "Sesiune expirată. Autentifică-te din nou." This also rejects tokens of **deleted** users, which today keep working until they expire.
15. [#8](#idea-8) later replaces this with short access tokens plus revocable refresh tokens; the `tokenVersion` column stays useful there.

### Part E: frontend

16. Login page: link **"Ai uitat parola?"** → new page `/parola-uitata` (email field → the neutral message).
17. New page `/resetare-parola?token=…`: new password + confirmation → on success, toast "Parola a fost schimbată. Autentifică-te cu noua parolă." and redirect to `/login`. The token is removed from the address bar as soon as the page reads it (`history.replaceState`), so it doesn't stay in browser history.
18. New page `/confirmare-email?token=…`: confirms on load, then shows success or "linkul a expirat" with a resend button.
19. While not verified: a thin banner under the navbar, "Confirmă-ți adresa de email. Nu ai primit emailul? Retrimite", and on an event page the `EMAIL_NOT_VERIFIED` error is shown with the same resend link instead of a generic toast.
20. `types.ts`: `User.emailVerified`.

### Part F: tests and docs

21. **Unit:** token generation/hash/expiry; templates (reset, verify, password changed; link from `APP_URL`, escaped name); DTOs; guard rejects an old `tv` and a deleted user; the sensitive-email scrubbing in the worker.
22. **Database-backed:**
    - forgot for an existing and a non-existing email → identical response; an outbox row only for the existing one;
    - reset: happy path; expired; used twice; wrong token; second "forgot" cancels the first link;
    - after reset: old password fails, new one works, **a JWT issued before the reset gets 401**;
    - verification: register → `EMAIL_VERIFY` row; unverified participant → 403 on register-for-event; after verifying → allowed; expired link → 400; resend cancels the old link;
    - existing users after the migration are verified;
    - sent reset/verify emails have their HTML scrubbed.
23. **End-to-end** with the fake Resend server: "forgot" → read the link out of the captured email → open `/resetare-parola` flow through the API → log in with the new password; old session → 401. Same for verification.
24. `README.md`: the 4 new routes in the API table, verification rules, token lifetimes, new limits. In this file, tick item 7 as `[x]`.

### How it affects the project

| Area | Effect |
|---|---|
| **New users** | Must confirm their email before registering for events or creating events. Can log in and browse right away. |
| **Existing users** | No change: marked as verified by the migration. |
| **API** | 4 new routes. `POST /events/:id/registrations` and `POST /events` can return `403 EMAIL_NOT_VERIFIED`. Login / register / `me` responses gain `emailVerified`. |
| **Sessions** | After a password reset, all of that user's sessions end. Deleted users' tokens stop working immediately. Cost: one indexed primary-key query per logged-in request. |
| **Database** | One migration: table `auth_tokens`; columns `users.emailVerifiedAt`, `users.tokenVersion`; existing users backfilled as verified. |
| **Email volume** | +1 email per new account, +1–2 per password reset. Counts toward Resend's 100/day free limit. |
| **Frontend** | 3 new pages, a link on the login page, a banner for unverified accounts. |
| **Without a Resend key** | Works as in [#6](#idea-6): emails (including links) appear in the API log, which is handy locally: copy the link from there. |
| **Later items** | [#8](#idea-8) reuses `tokenVersion` and the token table pattern; [#16](#idea-16) Turnstile can protect "forgot" too. |
| **Risk** | Medium. Security-sensitive code (tokens, sessions); covered by the tests above. The guard change touches every logged-in request, so its tests matter most. |

### Files to change

New `backend/src/auth/auth-token.entity.ts`, `backend/src/auth/tokens.service.ts`, `backend/src/auth/password.controller.ts` (or routes in `auth.controller.ts`), DTOs in `auth/dto/auth.dto.ts`, `backend/src/auth/auth.service.ts`, `backend/src/auth/jwt-auth.guard.ts`, `backend/src/users/user.entity.ts`, `backend/src/users/users.service.ts`, `backend/src/mail/templates.ts` + `notifications.service.ts` + `outbox.worker.ts` (scrubbing), `backend/src/events/events.controller.ts` / `registrations.controller.ts` (verified check), `backend/src/common/security.ts`, new migration, new specs and int-specs; `frontend/src/pages/AuthPages.tsx`, new `frontend/src/pages/PasswordPages.tsx` and `VerifyEmailPage.tsx`, `frontend/src/App.tsx`, `frontend/src/auth.tsx`, `frontend/src/types.ts`, `frontend/src/endpoints.ts`, `frontend/src/styles.css`; `README.md`.

### Decisions (2026-11-05): all four recommendations

1. Unverified accounts can log in and browse, but can't register for events or create events.
2. Existing accounts are marked as verified by the migration.
3. Other sessions end on password reset now, with `tokenVersion`.
4. After a successful reset: redirect to login.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-8"></a>
## 8. Refresh tokens + server-side logout

**Status:** idea · plan not written yet

The JWT is valid for 7 days, stored in `localStorage`, and logout does nothing on the server. Use a short-lived access token plus a refresh token in an httpOnly cookie, and revoke the refresh token on logout.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-9"></a>
## 9. Waitlist with automatic promotion

**Status:** idea · plan not written yet · **Depends on:** [1](#idea-1), [6](#idea-6)

When an event is full, people can queue; the first in line is promoted automatically when someone cancels (inside the locked cancel transaction from idea 1).

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-10"></a>
## 10. 24h reminders + calendar export

**Status:** idea · plan not written yet · **Depends on:** [6](#idea-6)

Reminder email 24h before the event via `@nestjs/schedule`. `.ics` download (`ics` library) and an "Add to Google Calendar" link.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-11"></a>
## 11. Event fields: `endsAt`, category, cover image, online events

**Status:** idea · plan not written yet

Add `endsAt`, category/tags, a cover image (Cloudinary / S3 / R2), and online/physical with a link. Revisit what "past" means once `endsAt` exists.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-12"></a>
## 12. Organizer tools: CSV export + analytics

**Status:** idea · plan not written yet

CSV export of attendees; analytics such as registrations over time and no-show rate. Also: past events archive, user profile (edit name/password, delete account). Open question: should organizers be able to edit past events?

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-13"></a>
## 13. CI, linting, frontend tests, frontend in Docker

**Status:** idea · plan not written yet

No frontend tests, no ESLint/Prettier, no CI, and the frontend isn't in `docker-compose`.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-14"></a>
## 14. Location autocomplete + map

**Status:** idea · plan not written yet

Location is free text, so it can't be shown on a map or searched by distance. Use Mapbox / Google Places, or free Nominatim + Leaflet.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-15"></a>
## 15. QR tickets + check-in

**Status:** idea · plan not written yet

Each registration gets a QR code (`qrcode` library); the organizer scans it at the door to record attendance.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-16"></a>
## 16. Google sign-in, Turnstile, Sentry

**Status:** idea · plan not written yet

Google OAuth (`passport-google-oauth20`) next to the existing JWT auth; Cloudflare Turnstile on register/login; Sentry on frontend and backend.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-17"></a>
## 17. Paid events with Stripe

**Status:** idea · plan not written yet

Stripe Checkout for paid tickets. Never handle card data yourself.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-18"></a>
## 18. Adopt the "Red Neon 4K" theme

**Status:** idea · plan not written yet · **Type:** Design · **Effort:** M · **Priority:** to decide · replaces [#3](#idea-3)

Make the unused "Pure Black & Red Neon 4K" design the app's real look, instead of deleting it.

**What already exists** (`frontend/src/index.css`, 434 lines, plus `components/EventCard.tsx` and `components/Navbar.tsx`):
- colour palette (black/obsidian backgrounds, neon reds), multi-layer glow effects, "cyber grid" background, neon scrollbar;
- styles for: navbar, buttons (`.btn-neon`, `.btn-neon-outline`), hero banner, event grid and cards (`.neon-card`), forms and inputs (`.neon-input`), panels, alerts.

**Gaps found while checking it (2026-11-05):**
- **Fonts aren't loaded.** The theme uses Orbitron, Rajdhani and Inter, but `index.html` loads only Manrope and Unbounded, so the browser falls back to a default font.
- **Not responsive.** `index.css` has no `@media` rules (the current `styles.css` has 6), so it needs mobile layouts.
- **Missing styles for current pages.** No styles for the event list rows, date tile, occupancy meter, status pills, filters, toasts, event detail page, organizer dashboard or attendee list.
- **The two components can't be used as-is.** `Navbar.tsx` links to `/my-registrations` and `/admin/events` and checks an `ADMIN` role; none of these exist (real routes: `/inscrierile-mele`, `/organizator`; roles: `PARTICIPANT`, `ORGANIZER`). `EventCard.tsx` has its own `EventItem` type (`date`, `id: string | number`) and works out "full" itself; it must use the real type from `src/types.ts` and the status/flags the API already sends.
- **Two stylesheets.** Decide whether `index.css` replaces `styles.css` or the two get merged; today only `styles.css` is imported.

[↑ Back to table of contents](#table-of-contents)

---

<a id="reference"></a>
## Reference: external APIs vs. in-house

| Need | Use | Why |
|---|---|---|
| Emails | Resend / Postmark / SendGrid | Deliverability (SPF/DKIM, bounces) is hard to do yourself |
| Scheduled jobs | `@nestjs/schedule` or BullMQ + Redis | Reminders, waitlist expiry |
| Location / map | Mapbox, Google Places, or Nominatim + Leaflet | Location is free text now; no map or proximity search |
| Images | Cloudinary / S3 / Cloudflare R2 | Resize + CDN + storage off the API server |
| Social login | Google OAuth (`passport-google-oauth20`) | Lower sign-up friction; keep own JWT alongside |
| Bot protection | Cloudflare Turnstile | Free, friendlier than reCAPTCHA |
| Monitoring | Sentry | See production errors |
| Payments | Stripe Checkout | Never handle card data yourself |

**Keep in-house:** registration/capacity rules, QR codes (`qrcode` lib), `.ics` files (`ics` lib), search (Postgres full-text is enough).

[↑ Back to table of contents](#table-of-contents)

---

<a id="inbox"></a>
## Inbox (new ideas, not yet prioritized)

<!-- Add new ideas here as: - YYYY-MM-DD – idea – short reason -->
- 2026-11-05 – Unused-code check (`knip`) in CI, as part of [#13](#idea-13) – would have caught the dead files from [#3](#idea-3) automatically.
- 2026-11-05 – Add `.gitattributes` (`* text=auto eol=lf`) – this machine has `core.autocrlf=true`, so a fresh checkout turns files into CRLF; `setup-secrets.sh` then fails on Mac/Linux (`sh\r: not found`).
- 2026-11-05 – `tsconfig.build.json` that excludes `*.spec.ts` – `nest build` currently compiles the test files into `dist/` and they end up in the Docker image.
- 2026-11-05 – `createdAt` columns are `TIMESTAMP` without time zone (only `startsAt` has one) – consider a migration to `timestamptz` for consistency.
- 2026-11-05 – ✅ **Fixed 2026-11-05 – Bug:** empty "Capacitate maximă" in the event form (sent as `null`) or a non-number got the message "Capacitatea maximă este 100.000 de locuri." – same cause as the `?page=abc` bug fixed in [#5](#idea-5): the first failing rule was shown, in decorator order.
  - **Worse case found while fixing:** editing an event (`PATCH`) let `capacity: null` and `title: null` through validation (`PartialType` adds `@IsOptional()`, which skips `null`). With no registrations, `null` reached the database → **500**; with registrations, the message was "Capacitatea nu poate fi sub numărul de înscriși".
  - **Fix:** new `common/validation.ts` (shared by `main.ts` and the tests): `firstMessage()` reports "missing / wrong type" rules first (`isDefined`, `isString`, `isInt`, …), whatever the decorator order, which also fixes a missing `title` / `name` showing "maximum N characters". `capacity` got `@IsDefined` ("Capacitatea este obligatorie."). `UpdateEventDto` uses `PartialType(…, { skipNullProperties: false })`: a missing field stays optional, `null` is validated.
  - **Tests:** new `common/validation.spec.ts` through the real `ValidationPipe` (14 tests). Checked they fail with each half of the fix removed.
- 2026-11-05 – Intermittent Jest warning "A worker process has failed to exit gracefully" (seen in 2 of ~10 parallel `npm test` runs on Windows). All tests pass; `--detectOpenHandles` in a single process finds nothing. Look again when setting up CI in [#13](#idea-13) (e.g. `--runInBand` or `workerIdleMemoryLimit`).
- 2026-11-05 – Email follow-ups from [#6](#idea-6): (a) cleanup job for old `SENT` rows in `email_outbox` (they stay forever now); (b) a way for organizers/admins to see `FAILED` emails; (c) a daily digest option for organizers of popular events instead of one email per registration; (d) verify a real domain + SPF/DKIM before emailing real participants.
- 2026-11-05 – `backend/package.json`: add `"engines": { "node": ">=22.12" }` (required by `resend`), and use `npm ci` instead of `npm install` in the Dockerfile for reproducible builds.
- 2026-11-05 – Account follow-ups from [#7](#idea-7): (a) cleanup of used/expired rows in `auth_tokens`; (b) "change password" while logged in (needs the current password) and "change email" (needs re-verification); (c) a banner update in other open tabs after verifying (today only the tab that opened the link refreshes); (d) register's unique-email race: two simultaneous sign-ups with the same address → the second gets a 500 from the database constraint instead of 409.
- 2026-11-05 – Update outdated dependencies that `npm install` warns about (`glob`, `inflight`, `uuid`, pulled in by other packages), as part of [#13](#idea-13).
