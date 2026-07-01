# NeuroCrop Frontend API Contract

API adresas nustatomas `public/runtime-config.js`:

```js
window.NEUROCROP_CONFIG = {
  apiBaseUrl: "https://api.neurocrop.lt/api/v1"
};
```

Frontend siunčia sesijos slapuką su `credentials: "include"`. ChirpStack, MQTT
ir DB prisijungimai priklauso tik backend.

## Authentication

```text
POST /auth/login
POST /auth/logout
GET  /auth/me
```

```json
{
  "email": "grower@example.lt",
  "password": "secret"
}
```

```json
{
  "user": {
    "id": "user-1",
    "email": "grower@example.lt",
    "role": "grower",
    "organizationId": "org-1"
  }
}
```

## Dashboard bootstrap

```text
GET /dashboard
```

Minimalus dabartinio dashboard naudojamas pereinamasis atsakymas:

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
          "sensorCount": 1,
          "batteryNodes": [
            {
              "id": "NS-000001",
              "devEui": "0011223344556677",
              "level": 63,
              "active": true
            }
          ],
          "availableMetrics": ["airTemp", "humidity", "co2"]
        }
      ]
    }
  ]
}
```

`sites/zones` yra laikinas esamo UI wire formatas. Backend domeno modelyje ir
naujuose endpointuose naudoti `areas/sections`; formatas bus pakeistas kartu
su kiekvieno puslapio 1:1 React migracija.

## CRUD

```text
GET    /areas
POST   /areas
PATCH  /areas/:areaId
DELETE /areas/:areaId

GET    /sections?areaId=...
POST   /sections
PATCH  /sections/:sectionId
DELETE /sections/:sectionId

GET    /nodes?sectionId=...
POST   /nodes
PATCH  /nodes/:nodeId
DELETE /nodes/:nodeId

GET    /crop-profiles
POST   /crop-profiles
PATCH  /crop-profiles/:profileId
POST   /crop-profiles/:profileId/duplicate
DELETE /crop-profiles/:profileId
```

Area trynimo body:

```json
{
  "moveSectionsToAreaId": null
}
```

`null` reiškia palikti Sections nepriskirtas.

## History

```text
GET /history?sectionId=...&metric=humidity&from=...&to=...
```

```json
{
  "sectionId": "tomato-rear",
  "metric": "humidity",
  "unit": "%",
  "points": [
    { "timestamp": "2026-07-01T09:00:00Z", "value": 68.4 },
    { "timestamp": "2026-07-01T09:10:00Z", "value": 67.9 }
  ]
}
```

Taškai neprivalo būti gauti tą pačią sekundę. Backend turi grąžinti tikrus
timestamp; grafikas juos braižo laiko ašyje.

## Alerts

```text
GET  /alerts?status=open
POST /alerts/:alertId/acknowledge
POST /alerts/:alertId/snooze
POST /alerts/:alertId/resolve
```

Backend automatiškai žymi sąlygą `recovered`, kai rodiklis stabiliai grįžta į
profilio ribas. Vartotojo `resolve` yra darbo proceso įrašas, ne sensoriaus
reikšmės pakeitimas.

## Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid sectionId",
    "fields": {
      "sectionId": "Section does not exist"
    }
  }
}
```

Visi endpointai turi tikrinti vartotojo organizaciją ir rolę. Frontend neturi
gauti ChirpStack vidinių ID, API raktų, MQTT prisijungimų ar DB slaptažodžių.
