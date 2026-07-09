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
          "score": 65,
          "conditionStatus": "warning",
          "mainDriver": "humidity",
          "computedAt": "2026-07-03T10:00:00Z",
          "coverage": {
            "liveMetrics": 9,
            "expectedMetrics": 13,
            "reportingNodes": 3,
            "registeredNodes": 4
          },
          "nodeSummary": {
            "live": 3,
            "delayed": 0,
            "stale": 0,
            "offline": 1
          },
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

`score`, `conditionStatus`, `mainDriver`, `coverage`, `nodeSummary` ir
`computedAt` yra kanoniniai backend laukai. Jeigu jie pateikiami, frontend juos
naudoja kaip pagrindinį Growing Conditions Score ir būsenos šaltinį. Jeigu šių
laukų nėra, frontend laikinai perskaičiuoja būseną pats iš naujausių rodmenų.

`conditionStatus` turi būti skaičiuojamas pagal paskutines galiojančias
sekcijos reikšmes: backend paima naujausius gyvus kiekvienos metrikos rodmenis,
pagal crop profile ribas apskaičiuoja `optimal`, `warning` arba `critical`, o
jeigu nėra nė vienos patikimos gyvos augimo metrikos, grąžina `unknown` /
`dataStatus: offline`, bet ne `score: 100`.

`sites/zones` yra laikinas esamo UI wire formatas. Backend domeno modelyje ir
naujuose endpointuose naudoti `areas/sections`; formatas bus pakeistas kartu
su kiekvieno puslapio 1:1 React migracija.

## Būsenos ir duomenų šviežumas

Frontend neturi laikyti kiekvieno įdiegto rodiklio automatiškai aktyviu.
Backend turi grąžinti serverio gavimo laiką atskirai nuo sensoriaus matavimo
laiko:

```json
{
  "id": "NS-000001",
  "lastReceivedAt": "2026-07-03T09:55:00Z",
  "expectedUplinkIntervalSec": 600,
  "observations": {
    "airTemp": {
      "lastObservedAt": "2026-07-03T09:50:00Z",
      "expectedIntervalSec": 600
    },
    "batteryLevel": {
      "lastObservedAt": "2026-07-03T06:00:00Z",
      "expectedIntervalSec": 21600
    }
  }
}
```

- `lastReceivedAt` yra backend serverio laikas, kada gautas uplink.
- `lastObservedAt` yra konkretaus matavimo laikas.
- Šviežumas skaičiuojamas kiekvienai metrikai atskirai.
- Transporto būsena gali būti `live`, nors konkretus rodmuo jau `stale`.
- Būsenų atsistatymui taikoma histerezė. Blogėjimas registruojamas iškart,
  o grįžimas į `live` patvirtinamas keliais nuosekliais paketais.

Kanoninė scope būsena:

```json
{
  "schemaVersion": "1.0.0",
  "scope": {
    "type": "section",
    "id": "tomato-a-back",
    "name": "Tomato Block A, Rear"
  },
  "conditionStatus": "warning",
  "dataStatus": "delayed",
  "lastKnownCondition": {
    "status": "warning",
    "asOf": "2026-07-03T09:50:00Z",
    "reasons": [
      {
        "code": "CONDITION_WARNING",
        "metricId": "humidity",
        "value": 58
      }
    ]
  },
  "coverage": {
    "liveMetrics": 9,
    "expectedMetrics": 13,
    "reportingNodes": 3,
    "registeredNodes": 4
  },
  "nodeSummary": {
    "live": 3,
    "delayed": 1,
    "stale": 0,
    "offline": 0
  },
  "extent": {
    "affected": 1,
    "total": 4,
    "ids": ["tomato-a-back"]
  },
  "reasons": [
    {
      "code": "TRANSPORT_DELAYED",
      "nodeId": "NS-000003",
      "ageSec": 1200
    }
  ],
  "computedAt": "2026-07-03T10:00:00Z",
  "validUntil": "2026-07-03T10:02:00Z"
}
```

`conditionStatus` ir `dataStatus` yra atskiros ašys. Dingus duomenims
`conditionStatus` tampa `unknown`, tačiau `lastKnownCondition` išsaugo
paskutinę warning ar critical būseną.

`validUntil` yra būsenos nuomos pabaiga. Net jeigu paskutinis atsakymas sakė
`live`, klientas po šio laiko turi rodyti prarastą ryšį ir paskutinio
apskaičiavimo laiką.

### Vėlyvi matavimai

```text
latenessSec = receivedAt - observedAt
```

Matavimas, viršijantis backend nustatytą `allowedLatenessSec`, laikomas
backfill:

- nekuria naujo aktyvaus alerto;
- gali papildyti jau buvusio incidento trukmę;
- gali sukurti uždarytą istorinį įvykį su `detectedLate: true`;
- nekeičia dabartinio priority action;
- grafike įrašomas pagal `observedAt`, o atsakymo `revision` leidžia
  frontend suprasti, kad istorija buvo papildyta.

Golden-vector fixture'ai yra `tests/state-engine/`. Frontend ir būsimas
backend freshness engine turi grąžinti tokį pat rezultatą tiems patiems
įvesties failams.

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

Crop profiles endpoint'ai turi aptarnauti tą patį modelį, kurį šiandien naudoja
Settings puslapis. Frontend'as dirba su profile `id` kaip su kanoniniu raktu,
todėl `sections.crop_profile` turi laikyti būtent šį `id`.

```text
GET /crop-profiles
```

```json
{
  "profiles": [
    {
      "id": "tomato",
      "name": "Tomatoes, vegetative",
      "heroName": "Tomato",
      "stage": "Vegetative",
      "hint": "Profile focused on active vegetative growth with stable CO2 and light conditions.",
      "requiresReview": false,
      "metrics": {
        "airTemp": {
          "label": "Air temperature",
          "unit": "degC",
          "decimals": 1,
          "aggregation": "Block avg",
          "optimal": [22, 26],
          "warning": [20, 28],
          "critical": [18, 32],
          "zone": "Greenhouse No. 1 / central climate zone",
          "action": "Check ventilation and heating balance."
        },
        "humidity": {
          "label": "Relative humidity",
          "unit": "%",
          "decimals": 0,
          "aggregation": "Block avg",
          "optimal": [60, 70],
          "warning": [55, 75],
          "critical": [45, 85],
          "zone": "Greenhouse No. 1 / microclimate zone",
          "action": "Review humidification and ventilation settings."
        }
      }
    }
  ]
}
```

```text
POST /crop-profiles
```

Frontend kuriant naują profilį siunčia vieną iš dviejų režimų:

1. `mode: "template"`: sukurti workspace kopiją pagal `sourceProfileId`
2. `mode: "blank"`: sukurti rankinį profilį su tuščia / peržiūros reikalaujančia
   pradine konfigūracija

```json
{
  "name": "Cucumbers, fruiting",
  "heroName": "Cucumber",
  "stage": "Fruiting",
  "sourceProfileId": "tomato",
  "mode": "template"
}
```

Atsakymas:

```json
{
  "profile": {
    "id": "crop-profile-cucumbers-fruiting",
    "name": "Cucumbers, fruiting",
    "heroName": "Cucumber",
    "stage": "Fruiting",
    "hint": "Workspace copy of Tomatoes, vegetative.",
    "requiresReview": false,
    "metrics": {}
  }
}
```

```text
PATCH /crop-profiles/:profileId
```

Frontend redaguodamas profilį siunčia visą išsaugotiną būseną:

```json
{
  "name": "Tomatoes, vegetative",
  "heroName": "Tomato",
  "stage": "Vegetative",
  "hint": "Profile focused on active vegetative growth with stable CO2 and light conditions.",
  "requiresReview": false,
  "metrics": {
    "airTemp": {
      "label": "Air temperature",
      "unit": "degC",
      "decimals": 1,
      "aggregation": "Block avg",
      "optimal": [22, 26],
      "warning": [20, 28],
      "critical": [18, 32],
      "zone": "Greenhouse No. 1 / central climate zone",
      "action": "Check ventilation and heating balance."
    }
  }
}
```

Backend turi saugoti ne tik ribas (`optimal`, `warning`, `critical`), bet ir
naudotojui rodomą metric metadata (`label`, `unit`, `decimals`, `aggregation`,
`zone`, `action`). Tą patį objektą frontend'as naudoja Settings, Overview,
Live readings ir Trends paaiškinimams.

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
    {
      "observedAt": "2026-07-01T09:00:00Z",
      "receivedAt": "2026-07-01T09:00:12Z",
      "value": 68.4,
      "detectedLate": false
    },
    {
      "observedAt": "2026-07-01T09:10:00Z",
      "receivedAt": "2026-07-01T09:42:00Z",
      "value": 67.9,
      "detectedLate": true
    }
  ],
  "revision": "history-r17"
}
```

Taškai neprivalo būti gauti tą pačią sekundę. Backend turi grąžinti tikrus
`observedAt`; grafikas juos braižo laiko ašyje. `receivedAt` naudojamas
duomenų pristatymo diagnostikai, o ne X ašies pozicijai.

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

## Interventions

Frontend neturi saugoti atliktų veiksmų tik `localStorage`. Veiksmas ir jo
rezultatas turi būti organizacijos audit trail dalis:

```text
GET   /interventions?sectionId=...&from=...&to=...
POST  /interventions
PATCH /interventions/:interventionId/outcome
```

Veiksmo registravimas:

```json
{
  "sectionId": "tomato-rear",
  "alertId": "alert-42",
  "metric": "humidity",
  "actionType": "CHECK_HUMIDIFIER",
  "note": "Humidifier output increased by one step",
  "performedAt": "2026-07-02T14:20:00Z"
}
```

Rezultato registravimas:

```json
{
  "status": "successful",
  "observedAt": "2026-07-02T14:55:00Z",
  "beforeValue": 58.0,
  "afterValue": 63.2,
  "note": "RH returned to the crop profile range"
}
```

Leistinos rezultato būsenos: `successful`, `no_change`, `made_worse`,
`not_relevant`. Backend turi įrašyti veiksmą atlikusį vartotoją ir serverio
laiką, net jeigu frontend siunčia `performedAt`.

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
