# NeuroCrop Control Center

Šiame repozitorijoje yra NeuroCrop MVP frontend dalis. Sistema skirta šiltnamio
mikroklimato stebėjimui, duomenų interpretavimui ir aiškių veiksmų augintojui
pateikimui.

Šis dokumentas pirmiausia skirtas backend ir duomenų bazės programuotojui.

## Greitas tinklalapio atnaujinimas

Jeigu projektas jau atsisiųstas į kompiuterį arba serverį:

```bash
cd ~/neurocrop
pnpm update-site
```

Ši viena komanda automatiškai:

1. atsisiunčia naujausius GitHub pakeitimus su saugiu `git pull --ff-only`;
2. patikrina ir įdiegia tiksliai `pnpm-lock.yaml` nurodytas priklausomybes;
3. sukuria naują production versiją kataloge `dist/`.

Po komandos reikia įkelti **visą `dist/` katalogo turinį** į hostingo
`public_html` katalogą.

Jeigu projekto katalogas vadinasi kitaip arba yra kitoje vietoje, pirmoje
komandoje reikia naudoti tikrą jo kelią, pvz.:

```bash
cd "/home/user/projects/neurocrop-frontend"
pnpm update-site
```

Komanda sąmoningai pati nekopijuoja failų į `public_html`, nes skirtinguose
hostinguose skiriasi katalogo kelias ir prieigos būdas. Taip išvengiama
atsitiktinio ne to katalogo perrašymo.

## Svarbiausia architektūros taisyklė

Frontend **neturi tiesiogiai jungtis nei prie MySQL, nei prie ChirpStack**.

```text
LoRaWAN node
    -> ChirpStack
    -> NeuroCrop backend / ingest procesas
    -> MySQL
    -> NeuroCrop REST API
    -> Frontend
```

ChirpStack API raktai, MQTT prisijungimai, DB slaptažodžiai ir taisyklių variklis
turi būti tik backend infrastruktūroje. Klientas neturi matyti ar net žinoti,
kad naudojamas ChirpStack.

## Dabartinė frontend būklė

- Naudojamas React 19, Vite ir TypeScript.
- React šiuo metu yra plonas apvalkalas, kuris atidaro `public/dashboard.html`
  per `iframe`.
- Didžioji dashboard logika vis dar yra `public/dashboard.html`.
- `public/dashboard-store.js` saugo demonstracinius Areas, Sections ir Nodes
  duomenis naršyklės `localStorage`.
- Crop profiles, Settings ir alertų veiksmai taip pat kol kas dalinai saugomi
  `localStorage`.
- `public/api.js` yra pradinis frontend ir backend API sluoksnis.
- Jeigu `apiBaseUrl` tuščias, frontend veikia demonstraciniu režimu.
- Dabartinis lokalus prisijungimo langas nėra tikra apsauga. Kai API
  nesukonfigūruotas, jis priima bet kokį teisingo formato el. paštą ir bent
  4 simbolių slaptažodį.

Todėl dabartinės demonstracinės reikšmės, alertai ir grafikai neturi būti
laikomi realiais DB duomenimis.

## Terminai

Galutiniai produkto terminai yra:

| UI terminas | Reikšmė | Seni pavadinimai kode |
| --- | --- | --- |
| Area | Didesnė vieta, pvz. šiltnamis | `site`, `location` |
| Section | Stebima Area dalis | `zone`, `block` |
| Node | LoRaWAN matavimo įrenginys | `node`, `slave node` |
| Crop profile | Kultūros ir augimo stadijos tikslinės ribos | `profile` |

Naujame API ir DB rekomenduojama naudoti `areas` ir `sections`. Frontend
adapteryje laikinai galima konvertuoti API modelį į seną `sites/zones` formą,
kol senasis dashboard kodas bus išskaidytas į React komponentus.

## Paleidimas lokaliai

Reikalingas Node.js ir `pnpm`.

```bash
pnpm install
pnpm dev
```

Patikros:

```bash
pnpm lint
pnpm build
```

Vite sugeneruoja statinius domeno failus kataloge `dist/`.

## API prijungimas

Development metu redaguoti:

```text
public/runtime-config.js
```

Po build serveryje galima redaguoti:

```text
dist/runtime-config.js
```

Pavyzdys:

```js
window.NEUROCROP_CONFIG = {
  apiBaseUrl: "https://api.neurocrop.lt/api/v1"
};
```

Tai leidžia pakeisti backend adresą neperkompiliuojant frontendo.

Visos užklausos iš `public/api.js` siunčiamos su:

```js
credentials: "include"
```

Rekomenduojama naudoti serverio sukurtą sesijos cookie:

- `HttpOnly`;
- `Secure`;
- tinkamas `SameSite`;
- trumpa sesijos trukmė ir atnaujinimo mechanizmas;
- jokio JWT ar slaptažodžio `localStorage`.

Jeigu API yra kitame subdomene, backend CORS turi leisti tik konkretų frontend
domeną ir `Access-Control-Allow-Credentials: true`. Negalima naudoti
`Access-Control-Allow-Origin: *` kartu su credentials.

## Jau naudojami API endpointai

Šie metodai jau aprašyti `public/api.js`:

```text
POST /auth/login
GET  /dashboard
GET  /readings/latest?blockId=...
GET  /history?blockId=...&metric=...&from=...&to=...
GET  /locations
GET  /blocks?locationId=...
GET  /nodes?blockId=...
```

`blockId` ir seni `/locations`, `/blocks` pavadinimai yra laikini. Prieš
plečiant API siūloma vieną kartą sutarti galutinį variantą:

```text
areaId
sectionId
/areas
/sections
```

Išsamesnis dabartinis minimalus formatas pateiktas `API-CONTRACT.md`.

## Rekomenduojamas MVP REST API

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

Visi kiti endpointai privalo tikrinti sesiją ir organizaciją. Organizacijos ID
negalima aklai priimti iš frontend ir pagal jį grąžinti svetimo ūkio duomenų.

### Areas ir Sections

```text
GET    /areas
POST   /areas
PATCH  /areas/:areaId
DELETE /areas/:areaId

GET    /sections?areaId=...
POST   /sections
PATCH  /sections/:sectionId
DELETE /sections/:sectionId
```

Section gali laikinai neturėti Area, nes UI leidžia palikti Section
nepriskirtą:

```json
{
  "id": "section-1",
  "areaId": null,
  "name": "Tomato Block A, Rear",
  "cropProfileId": "profile-1"
}
```

Trinant Area backend turi palaikyti aiškią strategiją:

- perkelti Sections į kitą Area; arba
- palikti Sections nepriskirtas.

### Nodes

```text
GET    /nodes?sectionId=...
POST   /nodes
PATCH  /nodes/:nodeId
DELETE /nodes/:nodeId
```

Svarbiausi Node laukai:

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

- `devEui` yra unikalus ir backend validuojamas;
- Node gali būti nepriskirtas jokiai Section;
- klientas neturi siųsti ar matyti ChirpStack vidinių ID/raktų;
- `online/offline` nustatomas pagal `lastSeenAt`, o ne pagal frontend spėjimą;
- baterijos procentas ir paskutinio ryšio laikas gaunami iš telemetrijos.

### Crop profiles

```text
GET    /crop-profiles
POST   /crop-profiles
PATCH  /crop-profiles/:profileId
POST   /crop-profiles/:profileId/duplicate
DELETE /crop-profiles/:profileId
```

Profilis turi saugoti:

- kultūrą;
- augimo stadiją;
- optimal, warning ir critical ribas kiekvienam parametrui;
- versiją arba `updatedAt`;
- priskirtų Sections skaičių.

Pakeitus profilį turi persiskaičiuoti naujas Overview statusas, History
optimalios ribos ir aktyvūs alertai. Istorinių profilio ribų nereikėtų
perrašyti be audito: rekomenduojama versijuoti profilius arba prie alerto
išsaugoti tuo metu galiojusias ribas.

### Einamieji rodmenys

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
      "sampleCount": 3
    },
    "humidity": {
      "value": 58.2,
      "unit": "%",
      "measuredAt": "2026-07-01T09:14:42Z",
      "status": "warning",
      "sampleCount": 3
    }
  }
}
```

Section reikšmė gali būti kelių Nodes agregatas. Backend turi grąžinti, koks
agregavimo metodas naudotas (`avg`, `median`, `min`, `max`) ir kiek Nodes
dalyvavo. Vieno Node gedimas neturi tyliai sugadinti visos Section reikšmės.

### Istoriniai duomenys ir Trends

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
      "points": [
        {
          "timestamp": "2026-07-01T08:45:12Z",
          "value": 23.8
        }
      ],
      "optimal": {
        "min": 22,
        "max": 26
      }
    }
  ]
}
```

Svarbu: skirtingi Nodes duomenis atsiųs ne tą pačią sekundę. DB turi saugoti
tikrą kiekvieno matavimo laiką. Grafikas neturi reikalauti identiškų timestamp.
Backend gali grąžinti:

- žalius taškus trumpam laikotarpiui;
- agreguotus 5 min., 15 min. ar 1 val. intervalus ilgesniam laikotarpiui;
- `null`, jeigu intervale duomenų nėra, o ne išgalvotą nulį.

Frontend vienu metu lygina daugiausia du parametrus. Abu turi turėti savo
vienetus ir Y ašis.

### Alerts ir Insights

```text
GET  /alerts?status=active&areaId=...&sectionId=...
POST /alerts/:alertId/acknowledge
POST /alerts/:alertId/snooze
POST /alerts/:alertId/resolve
GET  /insights?sectionId=...
```

Rekomenduojamas alerto gyvavimo ciklas:

```text
active -> acknowledged -> recovered -> resolved
```

- Kai rodmuo grįžta į normą, backend pažymi alertą `recovered`.
- Alertas neturi amžinai likti aktyvus vien todėl, kad vartotojas nepaspaudė
  Resolve.
- Resolve gali būti automatinis po nustatyto stabilaus laikotarpio arba
  rankinis, priklausomai nuo taisyklės.
- Reikia saugoti, kas ir kada atliko acknowledge, snooze ar resolve.
- Overview rodo ne daugiau kaip tris svarbiausias aktyvias įžvalgas.

Insight turi paaiškinti:

- kas vyksta;
- kodėl;
- ką rekomenduojama daryti;
- ar situacija gerėja;
- kokiais rodmenimis ir ribomis išvada pagrįsta.

## MVP sensoriai ir skaičiavimai

Realiai MVP palaikomi sensoriai:

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

Lux, PPFD, EC, pH, substrato drėgmė, slėgis ir kiti būsimi parametrai dabar
frontend demonstracijoje gali būti matomi, bet backend MVP neturi generuoti
netikrų reikšmių. Neįdiegtas parametras turi būti grąžintas kaip neprieinamas,
kad UI jį parodytų pilkai ir neleistų pasirinkti.

## ChirpStack integracija

Rekomenduojamas ingest procesas:

1. ChirpStack gauna uplink iš Node.
2. Backend gauna įvykį per MQTT arba ChirpStack HTTP integration.
3. Backend pagal `devEui` suranda Node.
4. Payload dekoderis išskiria matavimus ir baterijos būseną.
5. Išsaugomas originalus uplink bei normalizuoti matavimai.
6. Apskaičiuojami derived metrics.
7. Rule Engine įvertina naują būseną.
8. Sukuriami, atnaujinami arba uždaromi alertai.
9. REST API pateikia duomenis frontendui.

Ingest endpointas, jeigu naudojamas HTTP integration, neturi būti viešas
klientui. Jis turi tikrinti ChirpStack paslaptį arba būti pasiekiamas tik
vidiniame tinkle.

Rekomenduojama išsaugoti:

- `deviceMeasuredAt`, jeigu firmware jį pateikia;
- `receivedAt` iš tinklo;
- `devEui`;
- frame counter;
- raw payload;
- dekoderio versiją;
- gateway/network metaduomenis diagnostikai;
- normalizuotus metric/value/unit įrašus.

## Siūlomas DB modelis

Minimalios lentelės:

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

Svarbūs ryšiai:

```text
organization 1 -> N areas
area 1 -> N sections
section 1 -> N nodes
section N -> 1 crop_profile
node 1 -> N readings
alert N -> 1 section
```

`sections.area_id` ir `nodes.section_id` gali būti `NULL`, nes UI palaiko
nepriskirtus objektus.

`readings` lentelėje rekomenduojami bent šie laukai:

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

Didėjant duomenų kiekiui reikės indeksų bent pagal:

```text
(organization_id, section_id, metric, measured_at)
(node_id, metric, measured_at)
```

Taip pat reikės retention/agregavimo proceso, kad seni raw duomenys
nepadarytų History užklausų lėtų.

## Saugumas

- Slaptažodžiai saugomi tik kaip patikimas hash (`Argon2id` arba `bcrypt`).
- Kiekviena užklausa tikrina vartotojo organizaciją ir rolę.
- Backend validuoja visus ID, ribas, datų intervalus ir DevEUI.
- Reikia rate limiting login ir ingest endpointams.
- ChirpStack bei DB paslaptys laikomos serverio environment variables.
- Paslaptys niekada necommitinamos į GitHub ir nerašomos į
  `runtime-config.js`.
- Produkcijoje naudoti tik HTTPS.
- CRUD ir alertų veiksmams rekomenduojamas audit log.

## Siūloma darbų seka

### 1 etapas: tikras prisijungimas

- Sukurti vartotojų ir organizacijų lenteles.
- Realizuoti login, logout ir `GET /auth/me`.
- Panaikinti demonstracinį frontend prisijungimą produkcijoje.
- Apsaugoti visus API endpointus.

### 2 etapas: struktūros CRUD

- Realizuoti Areas, Sections, Nodes ir Crop profiles endpointus.
- Prijungti esamas frontend kūrimo, edit ir delete formas.
- `localStorage` palikti tik demonstraciniam režimui arba visiškai pašalinti.

### 3 etapas: ChirpStack ir telemetrija

- Priimti uplink.
- Susieti `devEui` su Node.
- Išdekoduoti SHT45, DS18B20 ir SCD41 duomenis.
- Saugoti raw ir normalizuotus matavimus.
- Realizuoti latest readings ir History endpointus.

### 4 etapas: Rule Engine ir alertai

- Apskaičiuoti VPD, rasos tašką, temperatūrų skirtumą ir CO2 pokytį.
- Realizuoti crop profile ribų tikrinimą.
- Realizuoti alertų būsenas ir veiksmų istoriją.
- Frontend rekomendacijas generuoti iš backend atsakymo, o ne iš demo JS.

### 5 etapas: eksploatacija

- Logging ir klaidų stebėjimas.
- DB backup.
- Retention ir agregavimo darbai.
- API testai.
- Uplink pakartojimo/idempotency apsauga.
- Offline Node ir vėluojančių duomenų stebėjimas.

## Frontend ir backend darbo tvarka

Rekomenduojama:

1. GitHub turėti vieną sutartą `main` šaką.
2. Frontend ir backend pakeitimus daryti atskirose feature šakose.
3. API formatą pirmiausia pakeisti `API-CONTRACT.md`.
4. Backend pateikti stabilų staging URL.
5. Frontend `runtime-config.js` nukreipti į staging API.
6. Tik tada jungti realius duomenis po vieną modulį.

Frontend galima toliau keisti nepriklausomai, jeigu backend nekeičia sutarto
API atsakymų formato. API kontrakto pakeitimai turi būti suderinti prieš
merge.

## Deploy

Frontend:

```bash
pnpm build
```

Visą `dist/` turinį kelti į domeno `public_html`.

Backend negali būti „įdėtas“ į statinį frontend katalogą, nebent hostingas
specialiai palaiko pasirinktą serverio kalbą ir procesus. Dažniausiai backend
talpinamas atskirai, pvz.:

```text
https://api.neurocrop.lt
```

Backend technologija nėra pririšta prie frontendo. Galima naudoti Node.js
(NestJS/Express/Fastify), Python (FastAPI/Django), PHP (Laravel) ar kitą
komandos mokamą technologiją. Svarbiausia laikytis API kontrakto.

## Svarbūs failai

```text
src/App.tsx                 React iframe apvalkalas
public/dashboard.html       pagrindinis dabartinis UI ir jo logika
public/dashboard-store.js   demonstracinė localStorage duomenų saugykla
public/api.js               frontend API klientas
public/runtime-config.js    produkcinio API adreso konfigūracija
API-CONTRACT.md             frontend ir backend duomenų sutartis
```

Prieš pradedant backend integraciją siūloma kartu galutinai patvirtinti
endpointų pavadinimus ir JSON schemas. Didžiausia dabartinė techninė skola yra
senų `site/zone/block/location` pavadinimų mišinys ir tai, kad dalis UI logikos
dar nėra perkelta iš vieno HTML failo į React komponentus.
