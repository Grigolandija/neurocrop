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
| Backend unit/contract/migration tests | Pass | 120 total: 117 pass, 3 DB/API integration tests skipped locally, 0 fail |
| Backend syntax | Pass | `npm run check`, including API, ingest, ingest health and retention worker |
| Frontend state/runtime tests | Pass | 4 state golden vectors plus runtime invariants |
| Frontend lint/typecheck/build | Pass | ESLint and Vite production build |
| Dependency audit | Pass after fix | `npm audit --omit=dev` and `pnpm audit --prod`: no known vulnerabilities |
| Gateway factory Python tests | Pass | 6 tests passed during baseline |
| Shell syntax | Pass | Deployment and rollback scripts parsed with `sh -n` |
| PostgreSQL integration | Not run locally | No local PostgreSQL client/service or Docker CLI |
| Compose runtime validation | Not run locally | Docker CLI unavailable |
| Production runtime | Access required | Containers, DB, MQTT and ChirpStack not inspected yet |

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
| AUD-018 | High | Open | Alert lifecycle | Current alerts are calculated in the browser while workflow state is stored separately; manual resolve is not sensor-verified recovery and can hide a continuing condition | Move canonical alert creation, deduplication, acknowledgement and automatic recovery to backend before relying on alerts for unattended escalation | Source and workflow trace; requires product/backend design |
| AUD-011 | High | Open | LoRaWAN keys | Legacy `/nodes/register` and DevEUI-change paths use one `DEFAULT_OTAA_APP_KEY` for multiple devices | Replace legacy registration with per-device factory provisioning, then rotate existing shared keys; requires real inventory and firmware coordination | Repository trace confirms shared-key function |
| AUD-012 | High | Open | Factory deployment | Secure per-device factory routes/tests exist only in Git-ignored local files and are not registered by tracked `backend/api.js` | Decide whether factory API is a separate private deployment or must be tracked and mounted into production | Git tracking and import trace |
| AUD-013 | Medium | Open | Payload auditability | Repository has no tracked ChirpStack decoder; ingest stores compact metadata, not raw payload, frame counter, uplink ID or decoder version | Export actual decoder/config, define a versioned payload contract and fixtures, then add raw uplink idempotency storage | README corrected to mark target vs implemented behavior |
| AUD-014 | Medium | Open | Downlink | No tracked downlink encoder, queue command or acknowledgement flow was found | Confirm whether MVP intentionally has no control channel; if required, design versioned commands and delivery/audit state | Repository-wide route/code search |
| AUD-015 | Medium | Open | Integration verification | Live PostgreSQL tenant, migration, MQTT and ChirpStack state cannot be proven from source alone | Run read-only production checks listed below | Awaiting access |

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

## Production access required

Repository-level work can continue without access, but the remaining integration
claims require read-only inspection of:

- Docker host running `neurocrop-api`, `neurocrop-ingest`, PostgreSQL, MQTT and
  ChirpStack;
- production PostgreSQL schema/migration history and data-integrity counts;
- ChirpStack application, device profiles, codec, device keys metadata and recent
  uplink event shape;
- API/ingest logs with secrets redacted;
- backup age and latest restore-test status.

No production credentials are stored in this file or the repository.
