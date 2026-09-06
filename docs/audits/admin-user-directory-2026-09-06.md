# Admin: last sign-in and portfolio cohorts

Status: implemented and tested locally; not committed, pushed or deployed.

## Changes

- The main Admin user directory now appears before portfolio detail and system
  health. It replaces the separate recent-login panel in the visible dashboard.
- Desktop shows **Portfolio registered** and **No portfolio registered** in
  two columns. Mobile stacks these groups. Each group has its own bounded,
  lazily rendered scrolling list, count, and newest-sign-in-first ordering.
- Each user shows name/email, verified last sign-in (seconds and device UTC
  offset), separate last activity and saved-connection status. Existing search,
  refresh, selection and read-only portfolio detail remain available.
- A saved connection counts as registered even if sync or decryption fails.
  An empty portfolio database or historical NAV alone does not. A connection
  read failure with unknown registration goes in a visible review section,
  never silently into the no-portfolio group.
- `portfolio_user_registry.last_sign_in_at` is an additive, nullable SQLite
  column. Existing visit timestamps and other data are preserved. Monotonic
  updates prevent an older session or missing timestamp erasing a newer login.
  A new verified login bypasses the existing request-write throttle.
- Auth-shell visit acknowledgements now pass through user-registry recording
  before returning, so direct Ontology arrivals also appear in the directory.
- `GET /api/admin/portfolio-users` retains authentication and server-side owner
  authorization and now returns `Cache-Control: no-store`, including errors.
  Storage failures return a sanitized 503, not a successful empty directory.

## Login meaning and scope

The Supabase skill informed the authentication boundary: only verified Auth
`last_sign_in_at` / primary-method AMR timestamps count. `iat`, token refresh,
user-editable metadata, request-body timestamps, NAV sync and file timestamps
do not. See the official [JWT fields](https://supabase.com/docs/guides/auth/jwt-fields)
and [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) references.
No service-role key is added to the browser or requested for this implementation.

This is the platform-observed account directory plus saved portfolio records,
**not an enumeration of every Supabase registration**. Legacy rows lacking a
verified login remain null and display “Not recorded”; their next authenticated
visit can supply the existing verified sign-in time. No historical sign-in
backfill from production Auth has been performed. Anonymous and local-dev
requests are excluded from new registry records.

The standalone login-activity store and its endpoint remain compatible with
earlier local work. The new directory persists its login field directly in
the existing portfolio registry, avoiding an email-based identity join.

## Verification

| Check | Result |
| --- | --- |
| Full backend suite | 1,038 passed |
| Full Flutter suite | 131 passed |
| New backend regressions | 7, included above |
| New Dart/widget regressions | 9, included above |
| Performance/transport regression | 41 passed, overlaps backend suite |
| Flutter analyze and bilingual source audit | Passed |
| Production Flutter web build | Passed; not deployed |
| Ontology tests | 3 Python + 22 Node passed |
| Ontology module verification | Passed |

Backend tests use a temporary legacy SQLite registry and synthetic signed
accounts. They verify additive migration, unrelated-data preservation,
monotonic timestamps, throttle bypass, cohort definitions, sorting independent
of activity/NAV, removal of a saved connection, anonymous/dev exclusion, real
401/403/200 authorization, forged-body rejection, no-store and sanitized errors.
Widget tests cover EN/ZH at 1280px and 390×844, unknown times, independent
ordering, cohort placement, actions, empty states and a 120-user scrolling case.

No production user data was downloaded or changed. No AWS migration, GitHub
push or Vercel deployment has occurred in this task. A release must include the
earlier local login/auth files required by this change and verify real login,
both cohorts and private-route denial in production; unrelated valuation
candidates remain unpublished.
