# NeuroCrop Frontend API Contract

Set `apiBaseUrl` in `runtime-config.js`, for example:

```js
window.NEUROCROP_CONFIG = {
  apiBaseUrl: "https://api.example.lt/api/v1"
};
```

All responses are JSON. The frontend sends cookies with requests, so enable
credentialed CORS only for the frontend domain.

## `POST /auth/login`

Request:

```json
{ "email": "grower@example.lt", "password": "secret" }
```

Response:

```json
{ "user": { "id": "user-1", "email": "grower@example.lt", "role": "Grower" } }
```

## `GET /dashboard`

Return the current dashboard structure. This shape is intentionally aligned
with the existing frontend mock store.

```json
{
  "sites": [
    {
      "id": "greenhouse-1",
      "name": "Greenhouse No. 1",
      "zones": [
        {
          "id": "tomato-a-back",
          "name": "Tomato Block A, Rear",
          "profile": "tomato",
          "sensorCount": 4,
          "availableMetrics": ["airTemp", "humidity", "co2", "batteryLevel"],
          "batteryNodes": [
            { "id": "NS-000001", "name": "NS-000001", "level": 63, "devEui": "0011223344556677", "active": true }
          ]
        }
      ]
    }
  ]
}
```

## `GET /readings/latest?blockId=...`

Return the latest decoded readings for one block.

## `GET /history?blockId=...&metric=humidity&from=...&to=...`

```json
{
  "blockId": "tomato-a-back",
  "metric": "humidity",
  "unit": "%",
  "points": [
    { "timestamp": "2026-06-20T09:00:00Z", "value": 68.4 },
    { "timestamp": "2026-06-20T10:00:00Z", "value": 67.9 }
  ]
}
```

The backend owns ChirpStack credentials, database credentials, validation,
authorization, alert delivery, and retention jobs. Do not expose those values
in frontend files.
