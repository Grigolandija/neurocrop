# NeuroCrop full-system audit progress

Started: 2026-07-25  
Scope: frontend, API/backend, PostgreSQL, authentication and authorization,
ChirpStack/LoRaWAN, payload handling, device lifecycle, calculations, alerts,
configuration, Docker/proxy/deployment, jobs, security, tests, and documentation.

## Architecture map

1. NeuroSense sends a LoRaWAN uplink through a gateway to ChirpStack.
2. ChirpStack publishes `application/+/device/+/event/up` to MQTT.
3. `backend/ingest.js` validates the event, resolves a registered Node by DevEUI,
   serializes that device stream and writes normalized measurements to PostgreSQL.
4. `backend/api.js` starts only after checksum-verified migrations and exposes
   cookie-authenticated, organization-scoped product APIs.
5. Backend scoring, derived climate metrics, agronomic rules, action verification,
   alerts and analytics turn measurements plus Crop Profile targets into API state.
6. React and `public/approved-dashboard-runtime.js` consume the API for Overview,
   Areas, Sections, Nodes, Readings, Trends, Alerts, Profiles and administration.
7. Production Compose runs the API and MQTT ingest from one immutable backend
   image on the private ChirpStack network; GitHub releases use SHA image tags.

## Baseline and verification

| Area | Result | Evidence |
|---|---|---|
| Backend unit/contract/migration tests | Pass | 204 total: 200 pass, 4 DB/API integration tests skipped locally, 0 fail; GitHub runs the PostgreSQL/API integration path |
| Backend syntax | Pass | `npm run check`, including API, ingest, ingest health and retention worker |
| Frontend state/runtime tests | Pass | 4 state golden vectors plus runtime invariants |
| Frontend lint/typecheck/build | Pass | ESLint and Vite production build |
| Dependency audit | Pass after fix | `npm audit --omit=dev` and `pnpm audit --prod`: no known vulnerabilities |
| Gateway factory Python tests | Pass locally | 10 private factory/updater tests; `gateway-factory/` is intentionally excluded from the public repository and its CI belongs in the private factory repository |
| Shell syntax | Pass | Tracked deployment, backup and rollback scripts parsed with `bash -n` locally and in CI |
| PostgreSQL integration | Not run locally | No local PostgreSQL client/service or Docker CLI |
| Compose runtime validation | Not run locally | Docker CLI unavailable |
| Production runtime | Pass with findings | Read-only inspection of containers, both databases, ChirpStack metadata, logs, timers, backups, proxy and public endpoints |

## Findings

| ID | Severity | Status | Area | Root cause | Fix / next action | Verification |
|---|---|---|---|---|---|---|
| AUD-001 | Low | Closed | Local release security | `.release/factory_key` looked like a repository secret | Confirmed `.release/` and key are Git-ignored and untracked; no repository leak | `git ls-files`, `git check-ignore` |
| AUD-002 | High | Fixed | Uplink/data integrity | Ingest accepted every finite number, including impossible pH, RH, battery and radio values | Added per-field technical plausibility bounds and fail-closed normalization | Unit tests cover valid boundaries and corrupt values |
| AUD-003 | High | Fixed | Logs/secrets | Ingest logged the full `MQTT_URL`, which can contain credentials, plus raw telemetry values | Redact URL credentials and log only stored DevEUI | Tests prove credentials and telemetry interpolation are absent |
| AUD-004 | High | Fixed | Frontend dependency | React Router 7.18.1 had a high-severity advisory | Migrated declarative imports to `react-router` 8.3.0 and updated React baseline | Frontend tests/lint/build and production dependency audit pass |
| AUD-005 | Medium | Fixed | API documentation | README documented a latest-readings route not implemented by backend | Documented the real `/readings/latest?sectionId=` contract | Static route/client comparison and build pass |
| AUD-006 | Medium | Fixed | PostgreSQL performance | Case-insensitive DevEUI queries could not use ordinary DevEUI indexes | Added non-destructive migration `0016` with functional Node and measurement indexes | Migration contract test passes |
| AUD-007 | Medium | Fixed | Ingest availability | Deployment considered ingest healthy when the process ran even if MQTT was disconnected | Added MQTT readiness heartbeat and Docker healthcheck; deploy now requires `healthy` | Backend health/deployment tests and shell syntax pass |
| AUD-008 | Low | Fixed | Configuration | Production and staging required an unused `session_secret` | Removed unused Compose mounts and deployment requirement; auth remains random DB-backed hashed sessions | Auth tests and Compose contract tests pass |
| AUD-009 | Low | Fixed | UX/API consistency | Sections dialog claimed deletion removed node assignments while API returns 409 for non-empty Sections | Dialog now tells users to move/remove Nodes first | Frontend lint/typecheck/build pass |
| AUD-010 | Medium | Fixed | Environment documentation | No canonical example covered actual API, DB, MQTT, ChirpStack and mail variables | Added `backend/.env.example` with blank sensitive values and production-secret guidance | Manual variable inventory |
| AUD-016 | Medium | Fixed | Crop Profile validation | Known sensor targets could be saved outside physically possible ranges and poison scoring | Added physical-limit validation for known profile metrics while preserving custom metrics | Unit tests cover impossible RH/pH and valid custom metrics |
| AUD-017 | Medium | Fixed | Alerts API contract | Frontend `getAlerts()` defaulted to unsupported `status=open` while backend accepts `all`, `acknowledged`, `snoozed`, `resolved` | Changed the client default to `all` | Runtime invariant test |
| AUD-025 | High | Fixed | Current readings | Section averages included stale/offline last-known samples, so the UI could present old measurements as current operational state | Current Section averages now include only live or delayed measurement sources while per-Node rows retain last-known diagnostics | Backend freshness contract plus full backend test suite |
| AUD-026 | Medium | Fixed | Frontend render performance | Readings column discovery synchronously updated state from an effect, causing a redundant render and possible navigation flicker | Visible columns are now derived with memoization while explicit user-hidden columns remain respected | ESLint, state/runtime tests and production build |
| AUD-027 | Medium | Fixed | CI coverage | Public CI attempted to execute the intentionally ignored private `gateway-factory/` tree, making clean GitHub checkouts fail before testing tracked operations | Public CI validates only tracked operational scripts and the production Compose model; private gateway tests remain in the private factory release flow | Clean-checkout GitHub Actions run |
| AUD-028 | Low | Fixed | E2E reliability | The preload assertion counted a shared presentation class used by both Settings and Organization workspaces | E2E now scopes each assertion to its unique `data-workspace-route` host and still proves every workspace mounts before navigation | Playwright CI |
| AUD-019 | Medium | Fixed locally | Browser security | Production static frontend returned no HSTS, MIME-sniffing, frame, referrer or browser-permission policy headers | Added non-breaking headers to the shipped `.htaccess`; deployment is still required | Runtime invariant test; production headers captured before fix |
| AUD-024 | Medium | Fixed locally | Overview decision UX | Watch-level Section evidence exposed only a generic out-of-range message because `/dashboard` omitted the main metric value and target | Dashboard now returns the exact main condition; until that backend is deployed, Overview enriches legacy responses from existing latest-reading and Crop Profile endpoints, then shows current value, target, deviation and the minimum increase/decrease required | Backend scoring regression test, frontend runtime invariant, lint and production build |
| AUD-020 | Medium | Open | Production operations | Production has 24 available OS updates, including one standard security update; package metadata is over one week old | Schedule a maintenance window, refresh package metadata, assess updates, snapshot/backup and patch with rollback available | Read-only host inspection |
| AUD-021 | Medium | Open | Device lifecycle | 45 production Nodes are assigned but only 5 are current; 40 stale assigned Nodes belong to the demo organization | Keep demo inventory excluded from production health/client counts or archive it; verify this distinction in every operational query | Production aggregate query |
| AUD-022 | Low | Open | Backup observability | Daily backups and checksums are healthy, but the latest NeuroCrop dump shrank from about 4.9 MB to 307 KB after data changes | Extend backup job with table row-count manifest and alert on unexpected size/count deltas | Production backup metadata and checksum verification |
| AUD-023 | Low | Open | Staging endpoint | Running staging is protected, but its canonical URL is the `nip.io` host rather than `staging.neurocrop.lt` | Use the actual protected URL consistently in E2E and deployment docs, or configure the desired DNS name | Production DNS and HTTP checks |
| AUD-018 | High | Fixed locally | Alert lifecycle | Alerts were calculated in the browser while workflow state was stored separately; manual resolve could hide a continuing condition | Added backend-generated stable alert identities, DB-managed active episodes, deduplication, acknowledgement/mute preservation, automatic condition clearing and episode reopening; frontend now prefers canonical backend rows and keeps browser calculation only as an API fallback | Migration `0018`, backend lifecycle unit/migration tests, frontend runtime invariant; production deployment and live smoke test remain |
| AUD-011 | High | Fixed | LoRaWAN keys | Legacy `/nodes/register` and DevEUI-change paths could use one `DEFAULT_OTAA_APP_KEY` for multiple devices | Production now rejects legacy registration unless it is explicitly enabled for isolated CI compatibility; customer Node edits cannot change factory identity or create ChirpStack keys. New hardware uses the per-device factory claim flow | Backend contract tests, route feature gate and immutable identity update path |
| AUD-012 | High | Fixed | Factory deployment | Secure per-device factory routes/tests were originally outside the tracked API flow | Factory routes and gateway update implementation are tracked, imported by `backend/api.js`, syntax-checked and covered by backend plus gateway-factory tests | Git tracking, API import trace, backend tests and Python factory tests |
| AUD-013 | Medium | Open | Payload auditability | Production has one 14,948-character JS codec used by six devices, but the repository has no tracked decoder; ingest stores compact metadata, not raw payload, frame counter, uplink ID or decoder version | Export the production decoder without secrets, define a versioned payload contract and fixtures, then add raw uplink idempotency storage | Production codec metadata/hash plus repository trace |
| AUD-014 | Medium | Open | Downlink | No tracked downlink encoder, queue command or acknowledgement flow was found | Confirm whether MVP intentionally has no control channel; if required, design versioned commands and delivery/audit state | Repository-wide route/code search |
| AUD-015 | Medium | Closed | Integration verification | Live PostgreSQL tenant, migration, MQTT and ChirpStack state could not be proven from source alone | Completed read-only production inspection without exposing credentials or key values | See production verification below |

## Checked components

- Frontend route/API mapping, request cache, credentials, timeouts, unauthorized
  handling, loading/error states, responsive build and unsafe-DOM inventory.
- Auth cookies, password hashing, session revocation, role checks, platform admin
  checks, CORS/origin checks, rate limits and tenant-scoped route contracts.
- Migrations `0001` through `0016`, checksum locking, tenant foreign keys,
  measurement uniqueness, retention batching and query/index alignment.
- ChirpStack device registration/cleanup, MQTT subscription, DevEUI validation,
  duplicate handling, late/future timestamps, sensor presence and node health.
- VPD, dew point, absolute humidity, score domains, 25 agronomic interaction
  rules, simulator validation, action verification and workflow persistence.
- Production/staging Compose, immutable deployment, rollback, health checks,
  reverse-proxy headers, backups, restore checks, monitoring and secret files.
- Documentation against implemented routes, ingest storage and deployment flow.

## Production verification

Read-only checks completed on 2026-07-25:

- production API is healthy, unauthenticated product routes return `401`, and
  API/root HTTP checks complete in about 0.05-0.08 seconds from the host;
- API, PostgreSQL, ChirpStack and infrastructure containers are healthy with no
  restart loop; deployed ingest runs but has no Docker healthcheck until the
  local `AUD-007` fix is deployed;
- migrations `0001`-`0015` are applied; local migration `0016` is intentionally
  not present before deployment;
- 5,724 measurements contain no duplicate DevEUI/time pairs, cross-tenant
  Section/Node/config links, invalid DevEUIs or impossible checked physical values;
- 45 Nodes are assigned, but the 40 stale assignments are isolated in the demo
  organization while all five default-organization Nodes are current;
- ChirpStack has one JS codec and six devices with distinct AppKey and NwkKey
  values; no key material was printed or copied;
- production ingest logs currently expose telemetry values and DevEUIs, confirming
  why the local `AUD-003` log-redaction fix must be deployed;
- daily NeuroCrop and ChirpStack backups are current and checksum-valid; the most
  recent scheduled restore test succeeded on 2026-07-19;
- Caddy configuration validates; staging is online behind authentication at its
  configured `nip.io` address;
- the host has adequate disk/memory capacity but pending OS/security updates.

No production credentials are stored in this file or the repository.
