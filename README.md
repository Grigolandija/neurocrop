# NeuroCrop integravimo instrukcija

Komandos Andriui:

```bash
cd ~/neurocrop
git pull
pnpm install
pnpm build
cd dist
zip -r ../REACT-DOMENUI.zip .
```

Dainiui:

Frontend jungiasi tik prie NeuroCrop API:

```text
LoRaWAN Node
    -> ChirpStack
    -> NeuroCrop ingest procesas
    -> MySQL
    -> NeuroCrop REST API
    -> Frontend
```

Frontend negali tiesiogiai jungtis prie MySQL, MQTT ar ChirpStack.

ChirpStack API raktai, MQTT prisijungimai, DB slaptažodžiai, payload dekoderiai
ir Rule Engine turi veikti tik serverio pusėje. Klientui ChirpStack neturi būti
matomas.

## Sistemos terminai

| Terminas | Reikšmė |
| --- | --- |
| Organization | Kliento ūkis arba įmonė |
| Area | Didesnė fizinė vieta, pvz. šiltnamis |
| Section | Stebima Area dalis |
| Node | LoRaWAN matavimo įrenginys |
| Crop profile | Kultūros, augimo stadijos ir tikslinių ribų rinkinys |
| Reading | Vieno parametro matavimas konkrečiu laiku |
| Alert | Rule Engine užfiksuotas nukrypimas |
| Insight | Vartotojui suprantamas paaiškinimas ir rekomendacija |

API ir DB naudoti pavadinimus `areas`, `sections`, `nodes`, `cropProfiles`.

## Frontend API konfigūracija

Development metu:

```text
public/runtime-config.js
```

Po build serveryje:

```text
dist/runtime-config.js
```

Pavyzdys:

```js
window.NEUROCROP_CONFIG = {
  apiBaseUrl: "https://api.neurocrop.lt/api/v1"
};
```

API adresą galima pakeisti neperkompiliuojant frontendo.

Frontend užklausos siunčiamos su:

```js
credentials: "include"
```

Naudoti serverio sesiją su `HttpOnly`, `Secure` ir tinkamu `SameSite` cookie.
JWT, slaptažodžių ir ChirpStack raktų nelaikyti `localStorage`.

Jeigu API yra kitame subdomene, CORS turi leisti tik konkretų frontend domeną
ir `Access-Control-Allow-Credentials: true`.

## API kontraktas

Detalios JSON schemos laikomos faile:

```text
API-CONTRACT.md
```

Keičiant endpointą ar atsakymo formatą pirmiausia atnaujinti kontraktą, tada
backend ir frontend. Produkcijoje rekomenduojama API versija:

```text
/api/v1
```

Visos datos siunčiamos ISO 8601 UTC formatu, pvz.:

```text
2026-07-01T09:14:42Z
```

Klaidų formatas turi būti vienodas:

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

## Reikalingi endpointai

### Autentifikacija

```text
POST /auth/login
POST /auth/logout
GET  /auth/me
```

`POST /auth/login`:

```json
{
  "email": "grower@example.lt",
  "password": "secret"
}
```

Atsakymas:

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

Visi kiti endpointai privalo tikrinti sesiją, vartotojo organizaciją ir rolę.
`organizationId` negalima aklai priimti iš frontend.

### Overview

```text
GET /dashboard
```

Atsakymas turi pateikti:

- Areas ir Sections;
- kiekvienos Area ir Section `growingConditionsScore`;
- būseną `optimal`, `warning` arba `critical`;
- Section Crop profile;
- naujausius agreguotus rodmenis;
- aktyvius alertus ir svarbiausias įžvalgas;
- Node ryšio ir baterijos santrauką;
- duomenų atnaujinimo laiką.

Score apskaičiuojamas backend pagal Crop profile ribas. Frontend jo neturi
perskaičiuoti iš skirtingos logikos.

### Areas

```text
GET    /areas
POST   /areas
PATCH  /areas/:areaId
DELETE /areas/:areaId
```

Trinant Area turi būti galima:

- perkelti jos Sections į kitą Area; arba
- palikti Sections nepriskirtas.

### Sections

```text
GET    /sections?areaId=...
POST   /sections
PATCH  /sections/:sectionId
DELETE /sections/:sectionId
```

Section gali neturėti Area:

```json
{
  "id": "section-1",
  "areaId": null,
  "name": "Tomato Block A, Rear",
  "cropProfileId": "profile-1",
  "growingConditionsScore": 65,
  "state": "warning"
}
```

### Nodes

```text
GET    /nodes?sectionId=...
POST   /nodes
PATCH  /nodes/:nodeId
DELETE /nodes/:nodeId
```

Minimalus Node modelis:

```json
{
  "id": "node-1",
  "displayId": "NS-000001",
  "name": "Rear climate node",
  "devEui": "0011223344556677",
  "sectionId": "section-1",
  "status": "online",
  "batteryPercent": 63,
  "lastSeenAt": "2026-07-01T09:15:00Z",
  "installedMetrics": [
    "airTemp",
    "humidity",
    "co2",
    "substrateTemp"
  ]
}
```

Reikalavimai:

- `devEui` unikalus;
- Node gali neturėti Section;
- `online/offline` nustato backend pagal `lastSeenAt`;
- frontend negauna ChirpStack vidinių ID ar raktų;
- neįdiegtas sensorius grąžinamas kaip neprieinamas.

### Crop profiles

```text
GET    /crop-profiles
POST   /crop-profiles
PATCH  /crop-profiles/:profileId
POST   /crop-profiles/:profileId/duplicate
DELETE /crop-profiles/:profileId
```

Profilis saugo:

- kultūrą ir augimo stadiją;
- kiekvieno parametro `optimal`, `warning`, `critical` ribas;
- matavimo vienetus;
- versiją ir `updatedAt`;
- priskirtų Sections skaičių.

Pakeitus profilį backend perskaičiuoja Section score, alertus ir naują būseną.
Istorinių alertų ribos turi likti audituojamos.

### Naujausi rodmenys

```text
GET /sections/:sectionId/readings/latest
```

Pavyzdys:

```json
{
  "sectionId": "section-1",
  "generatedAt": "2026-07-01T09:16:00Z",
  "metrics": {
    "airTemp": {
      "value": 24.1,
      "unit": "C",
      "measuredAt": "2026-07-01T09:14:42Z",
      "status": "optimal",
      "aggregation": "median",
      "sampleCount": 3
    },
    "humidity": {
      "value": 58.2,
      "unit": "%",
      "measuredAt": "2026-07-01T09:14:42Z",
      "status": "warning",
      "aggregation": "median",
      "sampleCount": 3
    }
  }
}
```

Vienoje Section gali būti keli Nodes su tais pačiais sensoriais. Backend turi
agreguoti jų reikšmes ir grąžinti `aggregation` bei `sampleCount`.

### Trends

```text
GET /history?sectionId=...&metrics=airTemp,humidity&from=...&to=...&interval=...
```

Pavyzdys:

```json
{
  "sectionId": "section-1",
  "from": "2026-06-30T09:00:00Z",
  "to": "2026-07-01T09:00:00Z",
  "series": [
    {
      "metric": "airTemp",
      "unit": "C",
      "optimal": {
        "min": 22,
        "max": 26
      },
      "points": [
        {
          "timestamp": "2026-07-01T08:45:12Z",
          "value": 23.8
        }
      ]
    }
  ]
}
```

Reikalavimai:

- saugoti tikrą kiekvieno matavimo laiką;
- nereikalauti vienodų timestamp iš skirtingų Nodes;
- trūkstamą intervalą grąžinti kaip `null`, ne kaip nulį;
- 24 h galima grąžinti raw arba smulkiai agreguotus duomenis;
- 7 d. ir 30 d. grąžinti agreguotus intervalus;
- vienoje užklausoje palaikyti iki dviejų parametrų;
- išlaikyti parametro vienetus ir Crop profile optimalias ribas.

### Alerts ir Insights

```text
GET  /alerts?status=active&areaId=...&sectionId=...
POST /alerts/:alertId/acknowledge
POST /alerts/:alertId/snooze
POST /alerts/:alertId/resolve
GET  /insights?sectionId=...
```

Alerto būsenos:

```text
active -> acknowledged -> recovered -> resolved
```

Kai rodmuo grįžta į normą, backend pažymi alertą `recovered`. Alertas negali
amžinai likti aktyvus vien todėl, kad vartotojas nepaspaudė `Resolve`.

Saugoti:

- kas ir kada atliko veiksmą;
- tuo metu galiojusias ribas;
- nukrypimo pradžią ir pabaigą;
- aktualią reikšmę ir Section;
- automatinio arba rankinio uždarymo priežastį.

Overview grąžina ne daugiau kaip tris svarbiausias aktyvias įžvalgas.

## MVP sensoriai ir derived metrics

| Sensorius | Matavimai |
| --- | --- |
| SHT45 | Oro temperatūra, santykinė drėgmė |
| DS18B20 | Substrato arba vandens temperatūra |
| SCD41 | CO2 koncentracija |

Backend apskaičiuoja:

- VPD;
- rasos tašką;
- oro ir substrato temperatūrų skirtumą;
- CO2 kitimo greitį.

Neįdiegti Lux, PPFD, EC, pH, substrato drėgmės ar kiti sensoriai negali turėti
dirbtinių reikšmių. API juos pažymi `available: false`.

## ChirpStack ingest

Rekomenduojama naudoti MQTT arba ChirpStack HTTP integration:

1. Gauti uplink įvykį.
2. Patikrinti šaltinį arba integration secret.
3. Pagal `devEui` surasti Node.
4. Idempotentiškai patikrinti frame counter ir uplink ID.
5. Išdekoduoti payload pagal firmware/dekoderio versiją.
6. Išsaugoti raw uplink.
7. Išsaugoti normalizuotus matavimus.
8. Apskaičiuoti derived metrics.
9. Paleisti Rule Engine.
10. Atnaujinti score, alertus ir įžvalgas.

Saugoti bent:

- `devEui`;
- `deviceMeasuredAt`, jeigu pateikia firmware;
- `receivedAt`;
- frame counter;
- raw payload;
- dekoderio versiją;
- normalizuotus `metric`, `value`, `unit`;
- tinklo metaduomenis diagnostikai.

Ingest endpointas nėra viešas kliento API endpointas.

## Minimalus DB modelis

```text
organizations
users
organization_members
areas
sections
nodes
node_sensors
crop_profiles
crop_profile_metric_ranges
uplinks
readings
alerts
alert_actions
notification_settings
```

Ryšiai:

```text
organization 1 -> N areas
area 1 -> N sections
section 1 -> N nodes
section N -> 1 crop_profile
node 1 -> N readings
section 1 -> N alerts
```

`sections.area_id` ir `nodes.section_id` gali būti `NULL`.

Minimalūs `readings` laukai:

```text
id
organization_id
node_id
section_id
metric
value
unit
measured_at
received_at
quality
```

Rekomenduojami indeksai:

```text
(organization_id, section_id, metric, measured_at)
(node_id, metric, measured_at)
```

Reikia retention ir agregavimo proceso, kad ilgalaikės Trends užklausos
neskaitytų visų raw matavimų.

## Saugumo reikalavimai

- Slaptažodžiai: `Argon2id` arba `bcrypt`.
- Visos užklausos tikrina organizaciją ir rolę.
- Login ir ingest endpointams taikomas rate limiting.
- Visi ID, DevEUI, datos ir ribos validuojami backend.
- CRUD ir alertų veiksmai audituojami.
- DB ir ChirpStack paslaptys laikomos environment variables.
- Paslaptys necommitinamos į GitHub ir nerašomos į `runtime-config.js`.
- Produkcijoje naudojamas tik HTTPS.
- DB turi automatinius backup ir atkūrimo testą.

## Rekomenduojama įgyvendinimo seka

1. Autentifikacija ir organizacijų izoliacija.
2. Areas, Sections, Nodes ir Crop profiles CRUD.
3. ChirpStack ingest, payload dekoderis ir raw duomenų saugojimas.
4. Naujausių rodmenų ir Trends endpointai.
5. Derived metrics ir Growing Conditions Score.
6. Rule Engine, Alerts ir Insights.
7. Monitoring, backup, retention ir API testai.

Kiekvieną modulį pirmiausia prijungti staging aplinkoje. Frontend
`runtime-config.js` nukreipti į staging API ir tik po patikros keisti į
production URL.

## Priėmimo kriterijai

Integracija laikoma baigta, kai:

- prisijungimas tikrinamas backend;
- skirtingos organizacijos nemato viena kitos duomenų;
- Areas, Sections, Nodes ir Crop profiles išlieka po naršyklės perkrovimo;
- Node galima priskirti ir atskirti nuo Section;
- ChirpStack uplink tampa DB Reading;
- Overview rodo API apskaičiuotus score ir būsenas;
- Trends rodo tikrus timestamp, vienetus ir optimalias ribas;
- neveikiantis sensorius nerodomas kaip nulinė reikšmė;
- alertas automatiškai pereina į `recovered`, kai sąlyga normalizuojasi;
- API klaidos UI pateikiamos valdomai;
- paslapčių nėra frontend faile ar GitHub istorijoje;
- build ir produkcinis domenas veikia per HTTPS.

## Svarbūs failai

```text
src/App.tsx                 React Router URL apvalkalas
legacy/dashboard.html       dabartinis pilnas dashboard UI
legacy/dashboard-store.js   lokalūs demonstraciniai duomenys ir CRUD
legacy/api.js               dabartinio dashboard API klientas
src/pages/                  būsimos palaipsnės React migracijos komponentai
scripts/prepare-legacy.mjs  paruošia legacy asset’us dev/build metu
public/runtime-config.js    API URL konfigūracija
public/.htaccess            SPA route fallback Apache hostingui
API-CONTRACT.md             endpointų ir JSON formatų sutartis
```

Backend technologija nėra pririšta prie frontendo. Galima naudoti Node.js,
Python, PHP ar kitą komandos palaikomą technologiją, jeigu laikomasi API
kontrakto ir saugumo reikalavimų.
