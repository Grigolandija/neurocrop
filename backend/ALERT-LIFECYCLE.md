# Canonical alert lifecycle

NeuroCrop treats an alert as a live monitored condition, not as a task. Employee
assignment, execution notes and result verification belong to Actions.

## Identity and deduplication

- A metric alert id is `metric:{areaId}:{sectionId}:{metricId}`.
- A connectivity alert id is `offline:{areaId}:{sectionId}:{devEui}`.
- Repeated API reads update the same row. They do not create duplicate alerts.
- A recovered condition that later returns reopens the same identity as a new
  episode and clears review or mute state from the previous episode.

## States

- `open`: active and not reviewed.
- `acknowledged`: active and marked as seen. This never hides the condition.
- `snoozed`: active but temporarily removed from the visible queue.
- `resolved`: no longer active. Canonical live alerts reach this state only when
  the current backend evaluation no longer detects the condition.

The `active` field is authoritative for whether the condition currently exists.
The `status` field describes its workflow or historical state.

## Synchronization

`GET /alerts` evaluates current Section metrics and Node reporting state using
the same score and freshness logic as the rest of the backend. It then:

1. upserts every active condition and refreshes its context;
2. preserves a valid acknowledgement or unexpired snooze;
3. automatically resolves a metric condition only after a current `optimal`
   evaluation, and a connectivity condition only after the Node reports again;
4. reopens a recovered condition if it appears again later.

Missing or unverifiable data is not treated as recovery. Manual resolution is
rejected for an active backend-managed alert. This prevents either a data gap or
a click from hiding a continuing sensor deviation.

## Frontend boundary

When the API responds successfully, Alerts renders backend-managed active rows.
Browser-derived alerts are only a temporary fallback when the API cannot be
reached; they are not persisted as canonical history.
