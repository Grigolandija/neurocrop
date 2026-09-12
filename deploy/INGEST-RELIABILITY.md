# Ingest reliability rollout

These changes are not a production deployment. Do not delete the inbox volume
when upgrading or rolling back the application.

## Preconditions

- Deploy the matching backend image and `production.compose.yml`. The image
  creates `/var/lib/neurocrop-ingest` owned by the unprivileged `node` user.
  The Compose named volume `neurocrop-ingest-inbox` persists it across container
  replacement. Do not use `docker compose down -v` for routine releases.
- Use one ingest writer per inbox and one unique MQTT client ID per environment.
  Production uses `neurocrop-ingest-production`, a persistent MQTT 3.1.1 session
  and a QoS 1 subscription.
- Verify the actual ChirpStack MQTT integration publishes uplink events at QoS 1
  and the MQTT broker has persistent storage, adequate offline queue limits and
  no short session expiry. These services' production configuration is outside
  this repository. A QoS 1 subscription CANNOT upgrade a QoS 0 publisher.
- Monitor the ingest health check, disk space and logs. A DB write failure leaves
  the packet on disk, retries every 5 seconds and marks ingest unhealthy. Inbox
  capacity is bounded to 1 GiB; a full/unwritable inbox refuses PUBACK and reconnects.

## Semantics

MQTT.js `handleMessage` persists and fsyncs the raw JSON before acknowledging a
QoS 1 packet. A separate worker processes up to 100 queued files per flush.
Only a committed transaction (or intentional rejection of invalid/unregistered
input) removes a file. Restart replays the backlog. A crash after DB commit but
before deletion is safe through the existing `(dev_eui,time)` conflict key.

Missing/invalid/far-future event times are rejected with an explicit log; they
are never replaced by current time. This is intentional rejection, not reliable
recovery of a malformed timestamp. The raw packet is not retained after rejection.

Cached sensor values retain `fresh/due/state` metadata but are stored as null in
numeric measurement columns. Readings searches prior genuine measurements and
retains their observation times. CO2 freshness accounts for its slower schedule.
Legacy packets with no quality fields remain supported. Previously stored values
whose quality metadata was discarded cannot be reconstructed; history is not
rewritten or backfilled with guessed timestamps.

History APIs insert explicit null markers for gaps exceeding twice the greater
of bucket resolution and the longest supported sensor interval (CO2/battery:
60 min; others: 15 min). This is deliberately conservative across adaptive mode
changes, not a claim to identify every missing individual uplink. The graph,
multi-metric graph and pinned sparkline keep those gaps. Stats ignore gap markers.

## Required pre-production integration exercise

In an isolated broker/database environment using the production publisher QoS:

1. Send identified packets, stop DB, send more, verify inbox grows and no PUBACK
   occurs before durable storage. Restart DB and verify one row per event.
2. Restart ingest with a nonempty inbox and confirm full replay.
3. Disconnect ingest from broker, publish, reconnect and verify broker replay.
4. Kill ingest between commit and file removal; verify no duplicate row.
5. Inject valid fresh/cached/failed sensor packets and confirm only fresh values
   update measurement timestamps; verify CO2 cadence and chart gaps.
6. Fill a small test inbox or deny its write permission: confirm no QoS 1 ACK.

Local automated tests cover the actual MQTT.js PUBACK handler, real filesystem
persistence/restart and failure cases, telemetry normalization, the actual uplink
handler with a DB double, and chart serialization. They are not a substitute for
the broker/PostgreSQL or physical gateway disconnection exercise above.
