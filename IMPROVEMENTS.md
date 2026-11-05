# EventHub – Improvements Backlog

Living list of improvement ideas for EventHub. New ideas go into **Inbox** first, then get a priority and move into the roadmap.
Mark items done with `[x]` and keep them (don't delete) so the history stays visible.

Effort: XS < 1h · S ≈ half day · M ≈ 1–3 days · L > 3 days

## Table of contents

1. [Block late cancellation + fix the capacity race](#idea-1)
2. [Rate limiting + helmet + Swagger only outside production](#idea-2)
3. [Delete dead frontend code](#idea-3)
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

- [Reference: external APIs vs. in-house](#reference)
- [Inbox (new ideas)](#inbox)

---

## Roadmap (priority order)

| # | Status | Item | Type | Effort | Depends on |
|---|---|---|---|---|---|
| [1](#idea-1) | [x] | Block cancelling a registration after the event started + lock when lowering capacity | Fix | S | |
| [2](#idea-2) | [x] | Rate limiting (`@nestjs/throttler`) + `helmet` + Swagger only outside production | Security | S | |
| [3](#idea-3) | [ ] | Delete dead frontend code (`components/EventCard.tsx`, `components/Navbar.tsx`, `index.css`) | Cleanup | XS | |
| [4](#idea-4) | [ ] | TypeORM migrations instead of `synchronize: true` | Production | S | |
| [5](#idea-5) | [ ] | Pagination on `GET /events` + `available` filter in SQL + single aggregate query for `summary` | Performance | S–M | |
| [6](#idea-6) | [ ] | Transactional email (Resend): registration confirmation, event changed/deleted notice | Feature + API | M | |
| [7](#idea-7) | [ ] | Password reset + email verification | Feature | M | 6 |
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

**Status:** planned · **Type:** Cleanup · **Effort:** XS

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

**Status:** idea · plan not written yet

`synchronize: true` in `app.module.ts` creates the schema automatically and can drop columns in production. Switch to TypeORM migrations.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-5"></a>
## 5. Pagination + `available` filter in SQL + aggregate summary

**Status:** idea · plan not written yet

`GET /events` loads every upcoming event with no limit, and the "available seats" filter runs in memory after the query (`events.service.ts`). Add `?page=&limit=` and move the filter into SQL (`HAVING`). `summary()` loads every event just to count them; replace it with one aggregate query. Also escape `%` and `_` in search (or move to Postgres full-text search).

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-6"></a>
## 6. Transactional email (Resend)

**Status:** idea · plan not written yet

Registration confirmation, plus a notice to participants when an event is edited or deleted. Today, deleting an event quietly removes everyone's registration. Use Resend (or Postmark / SendGrid) instead of sending mail yourself.

[↑ Back to table of contents](#table-of-contents)

---

<a id="idea-7"></a>
## 7. Password reset + email verification

**Status:** idea · plan not written yet · **Depends on:** [6](#idea-6)

Without a reset, a user who forgets their password has no way back into their account.

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
- 2026-11-05 – Update outdated dependencies that `npm install` warns about (`glob`, `inflight`, `uuid`, pulled in by other packages), as part of [#13](#idea-13).
