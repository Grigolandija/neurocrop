# NeuroCrop Frontend API Contract

API adresas nustatomas `public/runtime-config.js`:

```js
window.NEUROCROP_CONFIG = {
  apiBaseUrl: "https://api.neurocrop.lt"
};
```

Frontend siunčia sesijos slapuką su `credentials: "include"`. ChirpStack, MQTT
ir DB prisijungimai priklauso tik backend.

## Authentication

```text
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/change-password
POST /auth/register
GET  /auth/organizations
POST /auth/switch-organization
POST /auth/accept-invite
```

`POST /auth/change-password` priima dabartinį ir naują (bent 12 simbolių)
slaptažodžius. Sėkmingai pakeitus slaptažodį dabartinė sesija lieka aktyvi, o
visos kitos to vartotojo sesijos atšaukiamos:

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-secure-password"
}
```

```json
{
  "changed": true,
  "otherSessionsRevoked": true
}
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
          "scoreModelVersion": "2.0.0",
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

`score`, `scoreModelVersion`, `conditionStatus`, `mainDriver`, `coverage`, `nodeSummary` ir
`computedAt` yra kanoniniai backend laukai. Jeigu jie pateikiami, frontend juos
naudoja kaip pagrindinį Growing Conditions Score ir būsenos šaltinį. Jeigu šių
laukų nėra, frontend laikinai perskaičiuoja būseną pats iš naujausių rodmenų.

Kanoninis `scoreModelVersion: "2.0.0"` naudoja tęstinę nuokrypio kreivę be
šuolio ties optimalia riba, agronominių domenų svorius ir bendrą VPD / oro
temperatūros / RH klimato grupę. Pilna formulės specifikacija yra
`backend/SCORING_MODEL.md`.

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

## Dienos veiksmai

```text
GET  /actions/today?sectionId=...
POST /actions/today/:actionId/feedback
GET  /actions/history?limit=20
```

`GET` grąžina iki trijų backend sureitinguotų veiksmų tik iš `live` arba
`delayed` matavimų. Veiksmas gali turėti naujausią `feedback`, jeigu jis buvo
užregistruotas po veiksme nurodyto `observedAt`.

`POST` priima `status` (`completed`, `deferred` arba `failed`) ir pilną
`action` kopiją. Backend išsaugo nekintamą rekomendacijos kopiją, naudotoją bei
laiką; veiksmas neišnyksta, kol naujesnis sensoriaus matavimas nepatvirtina
pasikeitusių sąlygų.

`GET /actions/history` grąžina organizacijos veiksmų auditą. `completed`
įrašams backend palygina rekomendacijoje buvusią reikšmę su naujausiu po
veiksmo gautu tos pačios sekcijos matavimu ir pateikia `outcome.state`:
`awaiting_data`, `improving`, `target_reached` arba `not_improving`.

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
POST   /nodes/register
PATCH  /nodes/:devEui
DELETE /nodes/:devEui
GET    /nodes/:devEui/sensors
PATCH  /nodes/:devEui/sensors/:port

GET    /crop-profiles
POST   /crop-profiles
PATCH  /crop-profiles/:profileId
POST   /crop-profiles/:profileId/duplicate
DELETE /crop-profiles/:profileId
```

`PATCH /nodes/:devEui` priima `name`, `sectionId` ir naują `devEui`. Keičiant
`devEui`, matavimų istorija ir sensorių konfigūracija perkeliama kartu, o
ChirpStack registracija atnaujinama į naują įrenginio identitetą.

`DELETE /nodes/:devEui` grąžina `409 NODE_HAS_HISTORY`, jeigu Node jau turi
matavimų. Istorija nėra automatiškai ištrinama; ilgalaikiam pašalinimui reikalinga
atskira archyvavimo arba duomenų išvalymo politika.

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
        },
        "lux": {
          "label": "Light",
          "unit": "lx",
          "decimals": 0,
          "optimal": [10000, 35000],
          "lightingSchedule": {
            "enabled": true,
            "start": "06:00",
            "end": "22:00",
            "timeZone": "Europe/Vilnius",
            "darkThresholdLux": 100
          }
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

## Analytics

```text
GET /analytics/section?sectionId=...&metric=...&from=...&to=...&stepMinutes=...
GET /analytics/dynamics?sectionId=...
GET /analytics/site-comparison?areaId=...&sectionIds=...&metric=...&from=...&to=...&stepMinutes=...
```

Analytics užklausos yra autentifikuotos, apribotos aktyvia organizacija ir vienu
kartu priima ne daugiau kaip 31 dieną. Leidžiami žingsniai: 10, 60 ir 240 min.;
zonų palyginimas vienu metu priima nuo vienos iki šešių tos pačios Area sekcijų.
`/analytics/dynamics` grąžina realią paskutinių 24 valandų Growing Score ir
rodiklių pradžią, pabaigą, minimumą bei maksimumą. Jei Crop Profile turi
`lux.lightingSchedule`, atsakyme taip pat pateikiamas pasiektas fotoperiodas,
laikas tiksliniame apšvietime, netikėtos tamsos / naktinės šviesos trukmė ir
aiškiai kaip apytikslis pažymėtas iš lux įvertintas DLI.

## Measurement export

```text
GET /exports/measurements.csv?sectionId=...&from=...&to=...
```

Eksportas yra autentifikuotas ir apribotas aktyvia vartotojo organizacija.
Jis grąžina ne Section vidurkį, o kiekvieno node neapdorotus matavimus CSV
formatu. Nenurodžius `metrics`, eksportuojamos visos fiziškai aptiktos tos
Section metrikos. CSV naudoja `;` skirtuką ir atskirus vietinio laiko datos bei
laiko stulpelius, kad failas tiesiogiai atsidarytų Excel programoje:

```text
Date;Time;Area;Section;Sensor;Air temperature (°C);Relative humidity (%);...
```

`metrics` pasirinktinai priima kableliais atskirtą metric raktų sąrašą. MVP
riboja vieną eksportą iki 31 dienos; didesniems laikotarpiams vėliau bus
naudojami agreguoti arba asinchroniškai sugeneruoti eksportai.

## Alerts (planned, not deployed)

```text
GET  /alerts?status=open
POST /alerts/:alertId/acknowledge
POST /alerts/:alertId/snooze
POST /alerts/:alertId/resolve
```

Backend automatiškai žymi sąlygą `recovered`, kai rodiklis stabiliai grįžta į
profilio ribas. Vartotojo `resolve` yra darbo proceso įrašas, ne sensoriaus
reikšmės pakeitimas.

## Interventions (planned, not deployed)

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
# Platform administration

Platform administration has two distinct global roles, separate from organization membership roles:

- `Super Admin` (`isSuperAdmin: true`) is the protected root operator. Only a Super Admin can grant or revoke Platform Admin access, activate/deactivate accounts, permanently delete users, or permanently delete organizations.
- `Platform Admin` (`isPlatformAdmin: true`) can review organization requests and manage customer organizations, but cannot manage Super Admin privileges or permanently delete accounts.

The authenticated user payload from `POST /auth/login` and `GET /auth/me` includes both `isPlatformAdmin` and `isSuperAdmin`.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/platform/organizations` | Platform Admin | List organizations with member, workspace, node, and active node-fault counts. |
| `GET` | `/platform/organizations/:organizationId/nodes` | Platform Admin | Read the selected organization's node fleet, transport state, radio telemetry, battery, firmware, and device fault diagnostics. |
| `GET` | `/platform/users` | Platform Admin | List users and account state. |
| `POST` | `/platform/admins` | Super Admin | Grant Platform Admin using `{ "userId": "..." }`. |
| `DELETE` | `/platform/admins/:userId` | Super Admin | Revoke Platform Admin. |
| `PATCH` | `/platform/users/:userId/status` | Super Admin | Activate/deactivate using `{ "active": true/false }`; deactivation revokes active sessions. |
| `DELETE` | `/platform/users/:userId?confirm=delete` | Super Admin | Permanently remove an account, sessions, requests, invitations, and memberships; organization measurements remain. |
| `DELETE` | `/platform/organizations/:organizationId?confirm=delete` | Super Admin | Permanently remove an organization and all organization-owned operational data. |
