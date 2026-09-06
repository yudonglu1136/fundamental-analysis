# Admin recent sign-ins — 2026-09-06

Status: **implemented and verified locally; not committed, pushed or deployed**.
The earlier valuation-expansion work remains separate and unchanged.

Follow-up: the main dashboard now integrates last sign-in directly into the
two-column portfolio user directory. This replaces the separate panel in the
visible layout; its underlying activity endpoint remains compatible. See
[Admin user directory](admin-user-directory-2026-09-06.md) for the latest local
implementation, tests and deployment limitations.

## Delivered

- Admin now has a Recent sign-ins panel above System Health: name, email,
  latest verified sign-in, separate last activity, device timezone, search,
  newest-sign-in ordering, refresh, and pagination (20 rows by default, server
  maximum 50). Missing sign-in time is explicitly Not recorded.
- English and Chinese loading, empty, error/retry and pagination states;
  a bounded scrolling list on desktop and mobile.
- `GET /api/admin/login-activity` runs after authentication and the shared
  server-side owner-admin guard. All responses are `Cache-Control: no-store`.
- `POST /api/auth/activity` acknowledges an authenticated visit, including
  auth-shell returns to Ontology. It accepts no client identity or timestamp
  as evidence. The frontend sends an empty body and never blocks a successful
  sign-in on telemetry errors (bounded three-second wait before redirect).

## Meaning and privacy

This is the latest sign-in **per observed account**, not a complete historical
event log, a list of all Supabase registrations, or proof of currently online
people. Collection starts after deployment when an authenticated request is
observed. Existing Supabase sign-in time may be learned on that user's next
visit; unobserved historical logins are not reconstructed. Anonymous, failed
auth and local development-bypass requests are excluded.

The verified Auth user response supplies `last_sign_in_at`; locally verified
JWTs use primary-method `amr` timestamps, never token-refresh `iat`. User-editable
metadata and client body fields cannot set login time or admin privileges.
These fields were checked against the [Supabase JWT field reference](https://supabase.com/docs/guides/auth/jwt-fields)
and [getUser documentation](https://supabase.com/docs/reference/javascript/auth-getuser).
No Supabase service-role key or schema migration is needed.

The new additive SQLite store is `user-portfolios/login-activity.sqlite` beside
the configured runtime database, or the explicit server-only
`LOGIN_ACTIVITY_DB_PATH`. It uses WAL, private file permissions, prepared
queries, monotonic last-sign-in updates, and one row per account. It does not
modify valuation, Guru or portfolio tables. Include this private database and
its consistent WAL state in future runtime backups; never bundle it into Git
or frontend artifacts.

No passwords, bearer/refresh tokens, raw JWTs, IP addresses, user agents or raw
user IDs are stored/exposed. Display names are untrusted display-only text.
Last activity reflects an authenticated API request, including background
requests, with approximately one-minute write resolution. Same-session page
refreshes do not create sign-ins. Recording errors back off for one minute
and emit only a generic warning; the admin read endpoint reports unavailable
rather than a successful empty result when its store cannot be read.

## Verification

| Check | Result |
| --- | --- |
| Full Node server suite | 854/854 passed |
| Full Flutter suite | 99/99 passed |
| New feature tests within those totals | 10 backend; 8 widget + 1 Dart helper |
| Flutter analyze | No issues |
| Bilingual source audit | Passed |
| Performance regression suite | 40/40 passed; overlaps server coverage |
| Ontology suite | 3 Python + 22 Node passed; overlapping counts |
| Ontology source/built module verification | Passed |
| Production Flutter web build | Passed |
| Git diff whitespace check | Passed |

New tests exercise verified-source login timestamps, non-regression under old
sessions, repeated request deduplication, pagination bounds, literal search,
unknown timestamps, reinitialized-store retention, anonymous/dev exclusion,
failure backoff, and real auth middleware plus admin authorization. Ordinary
users cannot elevate through `user_metadata`; invalid/missing tokens get 401,
ordinary accounts get 403, and the owner can read the bounded list. The visit
endpoint ignores a forged client user ID and future login timestamp.

Widget checks cover both languages at 1280px and 390x844, no render overflows,
unknown login, distinct activity time, search/debounce/URL encoding, pagination,
late-response rejection, retry, refresh and empty-state coverage disclosure.

These are local tests using synthetic accounts. No production user list was
downloaded, no live OAuth/browser session was exercised, and no production
deployment or live acceptance test has been performed.
