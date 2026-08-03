# NeuroCrop pilnas projekto ir funkcijų auditas

Audito data: 2026-08-03  
Audituota versija: `6a3be63` (`main`)  
Apimtis: React frontend, API, PostgreSQL, autentifikacija, organizacijų izoliacija, LoRaWAN/ChirpStack, ingest, skaičiavimai, alertai, veiksmai, žemėlapiai, eksportas, simuliacija, gamyklinis Node/Gateway paruošimas, CI, diegimas, monitoringas ir atsarginės kopijos.

## 1. Kaip skaityti šį auditą

Šiame dokumente „funkcija“ reiškia vartotojui, administratoriui, įrenginiui arba operacijų komandai prieinamą sistemos gebėjimą. Smulkūs techniniai helperiai (formatavimo, masyvų normalizavimo, React būsenos keitimo funkcijos) aprašomi modulio lygmeniu, nes atskiras verslo argumentas kiekvienam `formatNumber()` ar `text()` neegzistuoja.

Sprendimų pagrindimas skirstomas taip:

- **Faktas** – tiesiogiai patvirtinta kodu, testu, migracija arba projekto dokumentu.
- **Dokumentuotas motyvas** – aiškiai parašytas komentare, specifikacijoje arba Git commit žinutėje.
- **Audito išvada** – inžinerinis paaiškinimas, išvestas iš realizacijos; tai nėra istorinio autoriaus minčių citata.

Privatus kūrėjo „thought process“ nėra patikrinamas projekto artefaktas. Todėl auditas pateikia atkuriamą sprendimų logiką: problema → pasirinktas mechanizmas → nauda → kompromisas.

## 2. Sistemos paskirtis ir pagrindinis sprendimas

NeuroCrop sukurtas ne kaip bendras sensorių dashboard, o kaip sprendimų sistema augintojui:

`matavimas → patikimumas → būklės įvertinimas → prioritetas → veiksmas → rezultato patikra`

Pagrindinis architektūrinis argumentas: naršyklė neturi žinoti DB, MQTT, ChirpStack ar įrenginių raktų ir neturi pati kurti kanoninių agronominių išvadų. Todėl kelias yra:

`Node → LoRaWAN Gateway → ChirpStack → MQTT → ingest → PostgreSQL → API → React`

Tai pasirinkta dėl keturių priežasčių:

1. paslaptys ir įrenginių valdymas lieka serveryje;
2. vienodi scoring ir alert rezultatai visiems klientams;
3. tenant izoliacija tikrinama prieš skaitant telemetry;
4. istorija, audit trail ir veiksmo rezultatas neišnyksta uždarius naršyklę.

## 3. Frontend karkasas ir bendros funkcijos

| Funkcija | Kaip įgyvendinta | Kodėl / argumentas |
|---|---|---|
| Maršrutai | `BrowserRouter`; autentifikavimo keliai atskiri, darbo ekranai valdomi `DashboardPage` | Vienas SPA be pilno puslapio perkrovimo |
| Prisijungimo režimai | Clerk, o jei Clerk nesukonfigūruotas – vietinė cookie sesija | Produkcijai valdomas identity provider, lokaliam/legacy režimui suderinamumas |
| Kontroliuojama prieiga | `workspaceAccess` neleidžia eiti į darbo ekranus iki patvirtinimo ir bazinės struktūros paruošimo | Naujas vartotojas neturi automatiškai gauti nekontroliuojamos organizacijos |
| Code splitting | Kiekvienas workspace importuojamas dinamiškai | Pradinis bundle neturi parsisiųsti visų grafikų, žemėlapių ir administravimo kodo |
| Preload | Dažniausi moduliai šildomi po vieną per idle laiką; hover/focus prefetchina konkretų route | Mažesnė paspaudimo delsa, neužblokuojant main thread |
| Navigacijos loading | Senas workspace lieka matomas, virš jo rodomas loading sluoksnis; tada vyksta route pakeitimas | Išvengiama balto/tuščio ekrano ir layout šuolio |
| Stale chunk recovery | Dinaminio importo klaida po deploy vieną kartą perkrauna puslapį | Atidarytas senas tabas gali prašyti jau neegzistuojančio hash failo |
| Error boundary | Kiekvienas workspace turi atskirą render klaidos ribą ir refresh veiksmą | Vieno ekrano klaida neturi nulaužti visos aplikacijos |
| Duomenų cache | API klientas deduplikuoja užklausas, turi invalidaciją ir struktūrinių mutacijų cache valymą | Greitesnė navigacija be pasenusių Areas/Sections/Nodes |
| Autorizacijos reakcija | `401` didina globalią unauthorized versiją ir išregistruoja UI | Pasibaigusi sesija neturi palikti tariamai aktyvaus dashboard |
| LT/EN | Bendra i18n funkcija ir kalbos perjungiklis shell | Tas pats produkto modelis dviem kalboms |
| Mobile | Šoninis meniu tampa drawer, keturi svarbiausi ekranai – apatiniu dock | Operatoriui lauke svarbūs trumpi keliai |
| Accessibility | Skip link, semantiniai dialogai, `aria-*`, focus būsenos, E2E accessibility scenarijus | Klaviatūra ir assistive technologijos yra produkto kokybės dalis |
| Performance diagnostika | Tik su `?perf=1`; renka PAGE/CODE/API/SERVER laikus, išlaiko chronologiją ir leidžia kopijuoti | Optimizacijos remiamos matavimais; klientui panelė pagal nutylėjimą nerodoma |
| Service worker | Statiškai pristatomas `sw.js` | Kontroliuojamas statinių resursų cache ir atnaujinimas |

## 4. Kiekvienas produkto ekranas

### 4.1 Overview

Funkcijos:

- pasirenka aktyvią Area;
- rodo pagrindinę ūkio/Area problemą, jos trukmę, trendą, paveiktas Sections ir Nodes;
- rodo Growing Conditions Score, pagrindinį ribojantį faktorių ir live status skaičius;
- pateikia kiekvienos Section būklę, reikšmę, target ir korekcijos kryptį;
- atidaro įrodymų drawer su mini trendu;
- pateikia rekomenduojamų patikrų workflow ir įrašo feedback;
- rodo Area climate map, kai žemėlapis įjungtas;
- apdoroja loading, error ir empty būsenas.

Kaip padaryta: vienu metu kraunami `/dashboard`, `/actions/today`, crop profiles ir veiksmų santrauka; modelis normalizuojamas viename `buildModel()`. Jei senesnis backend dar nepateikia tikslios pagrindinės reikšmės, yra laikinas enrichment fallback iš latest readings ir profilio.

Argumentas: pirmas ekranas turi per kelias sekundes atsakyti „kur problema, kodėl ir ką tikrinti“, o ne rodyti visas telemetry lenteles. Kompromisas: legacy enrichment didina sudėtingumą ir turi būti pašalintas, kai visi backend diegimai garantuoja naują kontraktą.

### 4.2 Areas

Funkcijos:

- Areas sąrašas, paieška ir health filtras;
- score, Sections, Nodes ir reporting santrauka;
- Area kūrimas ir redagavimas;
- Area ištrynimas, pasirenkant palikti Sections nepriskirtas;
- naujos Section kūrimo kelias iš Area;
- climate map įjungimas/išjungimas ir atidarymas.

Kaip: React sujungia `/areas`, `/sections`, `/nodes` ir `/dashboard`; mutacijos eina per cache invaliduojantį API sluoksnį. Backend kiekvieną objektą riboja aktyvia organization.

Kodėl: Area yra aukščiausias fizinės struktūros vienetas. „Keep sections“ apsaugo nuo netyčinio visos struktūros sunaikinimo.

### 4.3 Sections

Funkcijos:

- Directory ir Coverage režimai;
- grupavimas pagal Area, paieška, Area/profile filtrai ir rūšiavimas;
- Section kūrimas, redagavimas, kopijavimas ir trynimas;
- Crop Profile priskyrimas vienai ar kelioms Sections;
- hardware coverage ir readiness paaiškinimas;
- pasirinkimo juosta nekeičia lentelės geometrijos;
- trinti leidžiama tik Section be priskirtų Nodes.

Kaip: UI suformuoja Section modelį iš struktūros, Nodes ir profilių. Bulk operacijos šiuo metu siunčia kelias atskiras API mutacijas.

Kodėl: struktūros konfigūracija atskirta nuo kasdienio monitoring. Coverage rodo ar reikalingoms metrikoms yra hardware ir dabartinių duomenų, o ne agronominį score.

Audito pastaba: kelių Section bulk pakeitimas nėra vienas backend transaction; vidurio klaida gali palikti dalinį rezultatą.

### 4.4 Nodes

Funkcijos:

- Node fleet sąrašas ir detalės;
- ryšio šviežumas, baterija, RSSI/SNR, firmware, active faults;
- paskutinį uplink priėmęs Gateway;
- Node claim/registracija pagal DevEUI;
- priskyrimas Area/Section, pavadinimo keitimas;
- pašalinimas paliekant arba trinant istoriją;
- įdiegtų sensorių aptikimas;
- sensoriaus measurement context: paskirtis, vieta, depth/height, ar naudoti score/interpolation;
- platform admin diagnostika per visas organizacijas.

Kaip: inventory gaunamas iš DB, o factory/ChirpStack tapatybė valdoma serveryje. Sveikata jungiama iš transporto, Gateway ir device fault būsenų. Klientas negali pakeisti factory identity.

Kodėl: agronominis nukrypimas ir hardware gedimas turi būti atskirti. Gateway ryšys rodo realiai paskutinį uplink gavusį gateway, o ne statinį priskyrimą.

### 4.5 Readings

Funkcijos:

- naujausi visų Sections matavimai vienoje lentelėje;
- metrikų grupės, Columns pasirinkimas, filtrai, rūšiavimas;
- Values / Against target / 1h change režimai;
- Section eilutės išskleidimas į atskirus Nodes;
- „No data“, „Not installed“, stale ir data-quality žymėjimas;
- Section averages tik iš live/delayed šaltinių;
- atskiras climate map pristatymas;
- batch latest endpoint sumažina kelias paralelines užklausas į vieną.

Kaip: `/readings/latest-batch` ribotu concurrency sukuria kiekvienos Section kanoninę išklotinę. Kiekvienai metrikai iš paskutinių 100 uplink pasirenkama naujausia galiojanti reikšmė, todėl dalinis uplink neištrina ankstesnės metrikos. 1h pokytis ieško artimiausio 40–80 min. baseline. 2026-08-03 perteklinis `DISTINCT ON` pašalintas: jau žinomi latest laikai perduodami tiesiai į indeksuotą baseline paiešką (produkcijos planas ~148 ms → ~1,9 ms).

Kodėl: current operational state negali maišyti offline duomenų su gyvais vidurkiais, bet diagnostikai paskutinė žinoma reikšmė išlieka naudinga.

### 4.6 Trends

Funkcijos:

- Area ir Section pasirinkimas;
- 24h, 7d, 30d intervalai;
- metrikos ir atskirų Nodes/Section aggregate serijos;
- target juostos, būsenos ir event/action žymos;
- bendras grafiko modelis ir heatmap/dynamics analitika;
- CSV export modal: žemėlapio masteliu pasirenkami Nodes, periodas ir galimos metrikos;
- negalimos metrikos išjungiamos;
- CSV wide format su atskira serija kiekvienam Node, tik pasirinkti Nodes/metrikos, UTF-8 BOM, lokalus laikas ir taškiniai skaičiai.

Kaip: raw istorijai naudojamas `/history`, analitikai `/analytics/section`; ilgesniems periodams DB rollup. Area pakeitimas iš naujo validuoja Section/Node kontekstą. Exportą generuoja backend, ne Excel interpretacijos frontend.

Kodėl: negalima suplakti kelių Nodes į vieną zigzaguojančią Excel seriją. Platus formatas leidžia tiesiogiai kurti atskirus grafikus; BOM ir saugūs ASCII antraščių ženklai mažina Mac/Windows Excel skirtumus.

### 4.7 Climate map / Area map

Funkcijos:

- Area plano redaktorius: ribos, stalai/zonos, durys/langai, Node koordinatės;
- optimistinis revision saugojimas nuo tylaus kitos sesijos perrašymo;
- plano revision istorija;
- Live ir History heatmap;
- metric pasirinkimas, interpoliuotas fonas ir isolinijos net mažam skirtumui;
- offline/no-measurement Node atskyrimas nuo interpoliacijos;
- istorinis kadras naudoja tuo metu galiojusį layout;
- žemėlapio geometrija ir orientacija bendra per naudojimo vietas.

Kaip: canvas skaičiavimai izoliuoti `greenhouse-map` domene; API grąžina sanitizuotą map ir leidžiamus heatmap measurement. Interpoliuojami tik sensoriai su tinkamu context. Raw bei rollup istorija parenkama pagal intervalą.

Kodėl: spalvinis laukas yra erdvinė aproksimacija, ne papildomas matavimas. Todėl neegzistuojanti/stale reikšmė neturi spalvinti žemėlapio; kartu hardware taškas gali būti rodomas diagnostikai.

Audito pastaba: `/greenhouse-map-test` maršrutas yra už pagrindinės autentifikuotos route šakos. Jei jis skirtas tik kūrimui, production build jį reikėtų feature-gate'inti arba pašalinti.

### 4.8 Alerts

Funkcijos:

- Active/Critical/Warnings/Device offline/Seen filtrai;
- kompaktiškos eilutės su vieta, reikšme, target ir laiku;
- acknowledge/mark seen, snooze ir resolve;
- „View live context“;
- canonical alert tapatybė, deduplikacija, episode atidarymas/uždarymas ir automatinis recovery;
- fallback/error/retry būsena;
- optional web push prenumerata.

Kaip: backend iš dabartinių Section snapshots sukuria stable alert ID, sinchronizuoja DB workflow, o manual resolve negali visam laikui paslėpti vis dar aktyvios sąlygos. Push delivery deduplikuojamas DB.

Kodėl: browser-only alertai dingsta, dubliuojasi ir skiriasi tarp vartotojų. Kanoninis lifecycle reikalingas auditui bei kelių darbuotojų darbui.

### 4.9 Actions

Funkcijos:

- iki trijų prioritetinių Today patikrų;
- agronominė diagnozė, required checks ir evidence;
- start/in progress/completed/deferred/failed statusai;
- priskyrimas komandos nariui, prioritetas ir due time;
- veiksmų istorija;
- prieš/po evidence ir automatinis rezultato įvertinimas;
- administratoriams reset su aiškiu patvirtinimu.

Kaip: `today-actions.js` sujungia metric deviation ir 25 realizuotų interaction rules kandidatų, koreliuotas klimato metrikas deduplikuoja, tada reitinguoja. Feedback saugo nekintamą action snapshot. Verification naudoja metric-specific langą, medianą, minimum sample count ir būsenų perėjimo taisykles.

Kodėl: sistema turi siūlyti patikrą, o ne apsimesti autonominiu valdikliu. „Completed“ dar nereiškia „sąlyga pagerėjo“; todėl rezultatas tikrinamas vėlesniais matavimais.

### 4.10 Crop Profiles

Funkcijos:

- profilių sąrašas ir editorius pagal metrikų grupes;
- kultūra, stage, unit, optimal/warning/critical ribos, score weight;
- kūrimas, redagavimas, dublikavimas ir trynimas su replacement;
- organizacijai visada garantuojamas default profilis;
- starter profilis turi visas palaikomas metrikas;
- fizinių ribų ir bandų validacija.

Kaip: kanoninis `metric-registry.json` maitina backend, frontend, DB migracijų testus ir default reikšmes. Backend galutinai validuoja.

Kodėl: vienas registras apsaugo nuo skirtingų pavadinimų, vienetų, DB kolonų ir profilio ribų. Default invariant neleidžia palikti Sections be vertinimo konteksto.

### 4.11 Simulator

Funkcijos:

- rankiniu būdu parenkamos metrikų reikšmės ir trukmė;
- grąžinama būklė, diagnozė, confidence/evidence ir rekomendacija;
- atskirai generuojami simulated Nodes ir jų telemetry.

Kaip: UI siunčia scenarijų į `/simulator/agronomic`; backend naudoja tas pačias profilio ribas ir agronomines rules, ne atskirą demo formulę. DB simulated inventory aiškiai pažymėtas source.

Kodėl: saugiai paaiškinti taisykles ir testuoti scenarijus be realaus šiltnamio poveikio. Simulated duomenys turi būti atskiriami nuo fizinių operacinių skaičių.

### 4.12 Settings ir Organization

Funkcijos:

- paskyros informacija, slaptažodžio keitimas;
- aktyvios sesijos ir kitų sesijų atšaukimas;
- organization perjungimas;
- komandos sąrašas, kvietimai ir jų atšaukimas;
- nario rolės keitimas su owner apsaugomis;
- organization pavadinimo keitimas;
- Clerk security valdymo įėjimai.

Kaip: visas mutacijas autorizuoja backend pagal aktyvios sesijos organization ir rolę. Slaptažodžio pakeitimas palieka dabartinę sesiją, atšaukia kitas. Invite token DB laikomas hash pavidalu.

Kodėl: tenant administravimas turi būti prieinamas klientui, bet negali suteikti platformos teisių ar pakeisti owner netyčia.

### 4.13 Platform Admin

Funkcijos:

- organization requests approve/reject;
- organizacijų kūrimas, archyvavimas, atkūrimas ir super-admin trynimas;
- users aktyvavimas/deaktyvavimas ir pilnas ištrynimas iš DB bei Clerk;
- vartotojo perkėlimas į kitą organization su role;
- tuščios asmeninės organization automatinis pašalinimas perkeliant;
- organization members ir Node diagnostika;
- platform admin suteikimas/atėmimas;
- Gateway inventory, priskyrimas klientui, trynimas;
- signed Gateway release rollout ir individualus update;
- read-only integracijų statusas be paslapčių.

Kaip: platform ir super-admin middleware yra atskiras nuo tenant roles. Destruktyvūs veiksmai reikalauja papildomo confirm; perkėlimas vyksta transaction ir nepalieka orphan membership.

Kodėl: kliento owner neturi matyti kitų klientų, o globali infrastruktūra negali būti valdoma tenant administratoriaus. Super-admin atskirtas todėl, kad user/gateway/organization trynimas yra negrįžtamas.

## 5. API funkcijų registras

Žemiau įtrauktos visos route šeimos. Kiekvienas product route naudoja autentifikaciją, organization scope ir role ten, kur vyksta mutacija; factory/gateway machine route naudoja atskirą įrenginio autentifikaciją.

| Sritis | Operacijos | Realizacijos tikslas |
|---|---|---|
| Auth | `login`, `logout`, `me`, `change-password`, sessions list/revoke | Saugi serverio sesija, slaptažodžio ir kelių įrenginių kontrolė |
| Recovery | `forgot-password`, `reset-password` | Vienkartinis hash token, account enumeration apsauga |
| Registration | `register`, organization requests approve/reject | Kontroliuojama prieiga, ne automatinis tenant kūrimas |
| Membership | organizations list/switch, team list/role, organization rename | Multi-organization vartotojas ir tenant savitvarka |
| Invitations | list/create/revoke/status/accept | Kontroliuojamas prisijungimas prie esamos organization |
| Dashboard | `GET /dashboard` | Vienas kanoninis struktūros, score, freshness ir coverage bootstrap |
| Areas | list/create/update/map-status/delete | Fizinės struktūros viršutinis lygis |
| Sections | list/create/update/delete | Auginimo zonos ir profilio kontekstas |
| Profiles | list/create/update/duplicate/delete | Verslo ribos ir scoring konfigūracija |
| Readings | latest, latest-batch | Dabartiniai patikimi rodmenys, paskutinės žinomos Node reikšmės ir 1h change |
| History | history | Bounded raw/rollup laiko eilutės |
| Analytics | section, dynamics, site-comparison | Serverinis agregavimas, targets, events ir palyginimas |
| Export | measurements CSV | Bounded, Node-separated, Excel-compatible duomenų išvedimas |
| Nodes | list, sensors, sensor patch, legacy register, claim, update, delete | Inventory, hardware context ir saugus lifecycle |
| Map | node-section patch, current map, history, save | Tenant-scoped planas, revision ir istorinis heatmap |
| Actions | today, feedback, assignment, history, reset, overview-summary | Rekomendacijos, darbo eiga ir rezultato įrodymas |
| Alerts | list, acknowledge, snooze, resolve | Kanoninis incidento lifecycle |
| Interventions | list/create/outcome | Rankinių darbų audit trail |
| Push | config, subscribe, unsubscribe | Authenticated web push be private key browseryje |
| Simulator | agronomic | Serverinis what-if pagal tą pačią rule sistemą |
| Platform | integrations/users/requests/organizations/members/admins | Globalus administravimas už tenant ribų |
| Gateway platform | updates, ownership, deletion, rollout | Infrastruktūros fleet ir signed release valdymas |
| Node factory | health, firmware, registration, lookup | Gamyklinis unikalus Node identity ir firmware |
| Gateway factory | activation, enroll, lookup | Vienkartinis Gateway provisioning ir mTLS/token modelis |
| Gateway agent | heartbeat, update check/download/status | Autentifikuotas management agent ir staged update |
| Health | `/health` | Viešas minimalus availability signalas monitoringui |

## 6. Backend skaičiavimo funkcijos

### 6.1 Telemetry ingest

`ingest.js` prenumeruoja ChirpStack uplink MQTT, normalizuoja DevEUI, serializuoja vieno įrenginio stream advisory lock, tikrina timestamp ir fizines reikšmių ribas, deduplikuoja `(dev_eui,time)`, transaction įrašo measurement ir atnaujina Node diagnostiką. MQTT readiness failas egzistuoja tik kol ryšys aktyvus.

Argumentas: pakartotas MQTT delivery neturi kurti dviejų matavimų; vienu metu atėję paketai neturi sukeisti Node last state; neįmanoma RH/pH/battery reikšmė neturi patekti į score.

### 6.2 Derived climate

`calcVPD`, `calcDewPoint`, `calcAbsoluteHumidity` pirmiausia tikrina fizikines įvestis. VPD naudojamas kaip kanoninė atmosferos vandens paklausa; dew point – kondensacijos kontekstui; absolute humidity – analitiniam palyginimui.

### 6.3 Score 2.1.0

- atskiri domenai: climate/water demand 35%, root water 25%, nutrition 20%, plant/root temperature 12%, carbon 8%;
- VPD, air temperature ir RH grupuojami, kad ta pati fizika nebūtų trigubai nubausta;
- lux yra context-only, nes momentinis lux nėra DLI;
- smoothstep kreivė panaikina score šuolį ties riba;
- trūkstamas sensorius neperskirsto savo svorio kitiems;
- coverage rodoma atskirai;
- didžiausias domeno nukrypimas turi limiting-factor efektą.

Argumentas: score yra dabartinių sąlygų indeksas, ne yield prognozė. Versijuotas modelis leidžia vėliau kalibruoti neapsimetant, kad svoriai yra universalūs biologiniai dėsniai.

### 6.4 Agronominės taisyklės

Realizuotos 25 svarbiausios interaction rules; platesniame kataloge dokumentuotos 134 kandidatės. Taisyklė turi required metrics, decision group, priority, evidence ir copy. Jei trūksta būtino matavimo, užtikrinta diagnozė nekuriama.

Argumentas: kelios metrikos dažnai keičia rekomendaciją (pvz., karštas lapas + šlapios šaknys nereiškia „dar laistyti“). Evidence lygis saugo nuo kategoriško priežastingumo.

### 6.5 Freshness ir Node health

Expected uplink interval priklauso nuo profilio; būsenos `live/delayed/stale/offline` skaičiuojamos iš laiko. Gateway association galioja tik su šviežiu heartbeat. Device flags ir counters normalizuojami, istorinis counter be aktyvaus flag nėra dabartinis gedimas.

### 6.6 Crop risks ir uniformity

Section vidurkis gali būti geras, nors vienas galas per karštas. Todėl `crop-risk.js` skaičiuoja Node pasiskirstymą, spread threshold, duration, trend, affected extent ir priority. Episode saugomas DB.

### 6.7 Measurement rollups ir retention

Raw measurement laikomi numatytai 35 dienas; 10 min rollup 93 dienas, 60 min – 1095 dienas. Trigger atnaujina rollup tame pačiame transaction. Valymas bounded batch ir advisory lock.

Argumentas: 31 dienos UI nereikia amžino raw saugojimo; rollup palieka sezoninės analizės galimybę mažesne kaina.

## 7. PostgreSQL ir visos migracijos

| Nr. | Funkcija ir motyvas |
|---:|---|
| 0001 | Bazinis tenant, auth, structure, measurements ir profiles modelis |
| 0002 | Išplėstos augimo metrikos |
| 0003 | DevEUI update cascade, kad istorija neprarastų ryšio |
| 0004 | Action feedback ir nekintama rekomendacijos kopija |
| 0005 | Struktūrizuotos atlikimo detalės |
| 0006 | Node archyvavimas vietoje aklo trynimo |
| 0007 | Default Crop Profile apsauga |
| 0008 | Gateway factory activation/enrollment |
| 0009 | Node factory unikalios tapatybės |
| 0010 | Tenant FK, measurement dedup ir DB integralumas |
| 0011 | Nepalaikomo demo air pressure valymas |
| 0012 | Measurement storage optimizacija ir demo retention |
| 0013 | Area tipo/metaduomenų plėtra |
| 0014 | Alert workflow ir interventions |
| 0015 | Action in-progress būsena |
| 0016 | Case-insensitive DevEUI indeksai |
| 0017 | Action assignments |
| 0018 | Kanoninis alert lifecycle ir recovery |
| 0019 | Tenant-scoped greenhouse maps |
| 0020 | Layout revision istorija istoriniam žemėlapiui |
| 0021 | 10/60 min measurement rollups |
| 0022 | Area map opt-in activation |
| 0023 | Simulated Node inventory |
| 0024 | Hash, expiring, single-use password reset token |
| 0025 | Clerk identity ir organization approval ryšys |
| 0026 | Kiekvienai organization garantuotas default profile |
| 0027 | Web push subscriptions ir delivery dedup |
| 0028 | Pilnos starter profile metrikos |
| 0029 | Crop risk episodes |
| 0030 | Paskutinio Gateway ir jo šviežumo duomenys Node |
| 0031 | Starter profile display units |
| 0032 | Signed/staged Gateway software updates |
| 0033 | Sensor measurement context score ir spatial interpolation kontrolei |

Migracijos turi checksum istoriją ir advisory lock; jau pritaikyta migracija negali būti redaguojama. API neatidaro HTTP porto, jei migracija nepavyko.

## 8. Saugumas ir prieigos modelis

- session cookie: HttpOnly, Secure produkcijoje, SameSite=Lax;
- slaptažodžiai hash'inami, input ilgis ribojamas prieš brangią KDF;
- auth ir invite turi rate limits;
- CORS leidžia tik explicit origins; browser mutacijos tikrina Origin;
- organization ID imamas iš autentifikuotos sesijos, ne iš kliento kaip authority;
- svetimas object ID slepiamas kaip 404;
- roles: owner/admin/grower/technician/viewer;
- platform admin ir super-admin yra atskira globali privilegija;
- DB, MQTT, ChirpStack, Resend, VAPID ir signing paslaptys nepatenka į frontend;
- factory ir Gateway agent naudoja machine auth, ne žmogaus Clerk sesiją;
- deploy raktas VPS apribotas forced command ir immutable SHA formatui;
- CSV reikšmės escape'inamos, kad duomenys nesulaužytų formato.

Audito išvada: tenant ir secret boundary suprojektuota teisingai. Augimo rizika – in-memory rate limiter netinka kelioms nepriklausomoms API replikoms; tada reikėtų bendro Redis/DB limiterio.

## 9. CI, E2E, deploy ir operacijos

CI darbai:

1. shell ir Compose config validacija;
2. frontend install, lint, architektūros/CSS/domain testai, build ir bundle budget;
3. backend syntax, 210 testų rinkinys, migracijos, gyvas dviejų tenantų testas ir Docker image;
4. Playwright E2E su realia PostgreSQL, API ir production build;
5. accessibility, control-center, mobile ir performance scenarijai.

Deploy:

- kuriami immutable frontend/backend images su Git SHA;
- staging atskirta DB;
- production reikalauja manual environment approval;
- API ir ingest health būtini prieš sėkmę;
- rollback saugo ankstesnius image;
- migracija vykdoma prieš aplikacijos paleidimą.

Monitoringas:

- VPS timer tikrina API, containers, DB, MQTT, diską, ingest freshness, backup ir restore;
- GitHub uptime tikrina iš išorės;
- siunčiamas vienas outage ir vienas recovery laiškas, ne laiškas kas penkias minutes;
- Node offline nėra painiojamas su VPS outage.

Backup:

- kasdieniai NeuroCrop ir ChirpStack custom-format dump;
- checksum ir offsite kopija;
- savaitinis restore į laikiną DB;
- RPO iki 24 h; restore test weekly.

## 10. Dabartinės patikros rezultatai

2026-08-03 lokaliai atlikta be browser peržiūros:

- frontend ESLint – **PASS**;
- architektūros invariants – **PASS**;
- CSS naudojimo patikra – **PASS**, 23 CSS failai, 0 nenaudojamų taisyklių pagal scanner;
- workspace access, metric registry, crop profile, map ir trend testai – **PASS**;
- greenhouse map: 76 testai – **PASS**;
- TypeScript ir production Vite build – **PASS**;
- bundle budget – **PASS**;
- backend syntax – **PASS**;
- backend: 210 testų, 206 pass, 4 integraciniai lokaliai praleisti pagal konfigūraciją, 0 fail – **PASS**.

Build dydžiai:

- initial JS ~137,6 kB gzip;
- initial CSS ~49,1 kB gzip;
- ECharts lazy chunk ~197,7 kB gzip;
- canvas lazy chunk ~93,2 kB gzip.

## 11. Audito išvados ir likusios rizikos

### P1 – prieš platesnį klientų paleidimą

1. **Versionuotas payload kontraktas ir decoder repo.** Dabartinis ChirpStack codec nėra pilnai audituojamas šiame repo; reikia fixture, decoder version ir uplink identity.
2. **Apsispręsti dėl downlink.** Repo nėra production command/ack lifecycle. Jei NeuroCrop tik monitoruoja – tai turi būti aiškiai deklaruota; jei valdys įrangą – reikalingas atskiras saugos projektas.
3. **Uždaryti testinį map route.** `/greenhouse-map-test` neturi būti viešas production route be feature gate.

### P2 – maintainability ir patikimumas

4. **Skaidyti `backend/api.js` (4087 eilutės).** Auth, structure, readings, analytics, export ir Nodes turėtų tapti atskirais route/service moduliais.
5. **Skaidyti didžiausius workspaces.** Trends 1303, Overview 1090, Readings 997 eilučių. Domain model, data hooks, dialogs ir presentation turi būti atskirti.
6. **Vienas bulk API transaction Sections veiksmams.** Dabartinis `Promise.all` gali duoti dalinį rezultatą.
7. **Pašalinti legacy Overview enrichment**, kai backend kontraktas garantuotas visose aplinkose.
8. **Sutvarkyti dokumentacijos neatitikimus.** `NEUROCROP_UX_ARCHITEKTURA.md` vis dar žymi dalį jau realizuoto alert/action lifecycle kaip nepadarytą; README maišo seną ZIP instrukciją su immutable Docker deploy; `AUDIT_PROGRESS.md` turi „fixed locally“ būsenų, kurios jau deployintos.
9. **Bendras rate limiter prieš horizontalų scale.** In-memory limiter veikia vienam API procesui, bet ne kelioms replikoms.
10. **CSS konsolidavimo planas.** 618 kB source CSS ir keli istoriniai globalūs sluoksniai praeina naudojimo testą, bet semantinis override konfliktas juo neaptinkamas. Toliau tvarkyti po workspace, ne masiniu perrašymu.

### P3 – produkto brandos darbai

11. Sensorių calibration metadata ir drift workflow.
12. PAR/PPFD ir DLI vietoje vien momentinio lux sprendimams.
13. Diena/naktis ir augimo fazės profilio ribose.
14. Savaitinė vadovo suvestinė ir patikrinta ekonominė vertė.
15. Rule rekomendacijų tikslumo kalibravimas iš sukauptų before/after rezultatų.

## 12. Galutinis vertinimas

NeuroCrop jau yra pilna tenantinė telemetry ir operacinių sprendimų platforma, o ne vien frontend prototipas. Stipriausios dalys: aiški secret/tenant riba, kanoninis metric registry, versionuotas score, measurement kokybė, realus alert/action lifecycle, saugus device provisioning, migracijų disciplina ir platus testų tinklas.

Didžiausia techninė skola nėra viena trūkstama funkcija. Ji koncentruota trijose vietose: dideli monolitiniai failai, keli laikini compatibility sluoksniai ir nepakankamai repo-versijuota LoRaWAN payload kilmė. Funkcionaliai sistema plati; kitas etapas turėtų būti jos supaprastinimas, decoder auditabilumas ir klientinis kalibravimas, o ne dar daugiau ekranų.

## 13. Pilnas registruotų HTTP funkcijų priedas

Šis priedas yra mechaninė pilnumo kontrolė pagal visas 105 audituotos versijos `app.get/post/patch/delete` registracijas. Automatinis palyginimas patvirtino: dokumente nepraleistas nė vienas registruotas endpoint. „Kodėl“ čia reiškia realizacijos argumentą, o ne nepatikrinamą istorinę autoriaus mintį.

### 13.1 Autentifikacija, registracija ir komanda

| Endpoint | Ką daro / kaip | Argumentas |
|---|---|---|
| `POST /auth/login` | Patikrina credentials, sukuria serverio sesiją ir `httpOnly` cookie | Tokenas neturi būti pasiekiamas JavaScript |
| `POST /auth/logout` | Panaikina aktyvią sesiją ir cookie | Užbaigti prieigą nepasikliaujant vien UI |
| `GET /auth/me` | Grąžina aktyvų vartotoją, roles ir organization kontekstą | Vienas autoritetingas shell bootstrap |
| `POST /auth/change-password` | Patikrina seną ir nustato naują slaptažodį | Apsauga nuo sesiją perėmusio asmens |
| `GET /auth/sessions` | Išvardija vartotojo sesijas | Matomumas, kur account prijungtas |
| `DELETE /auth/sessions/:sessionId` | Atšaukia pasirinktą sesiją | Nuotolinis pamesto įrenginio atjungimas |
| `POST /auth/forgot-password` | Sukuria riboto laiko reset tokeną ir siunčia nuorodą | Atkūrimas neatskleidžiant, ar el. paštas egzistuoja |
| `POST /auth/reset-password` | Vieną kartą panaudoja hashintą tokeną | Pavogta DB neturi atskleisti veikiančių tokenų |
| `POST /auth/register` | Registruoja identity ir sukuria kontroliuojamos prieigos prašymą | Naujas account neturi automatiškai tapti aktyviu tenant |
| `GET /auth/organizations` | Grąžina vartotojo memberships | Multi-organization pasirinkimui |
| `POST /auth/switch-organization` | Pakeičia aktyvų organization kontekstą tik turint membership | Tenant persijungimas be naujo login |
| `GET /team` | Grąžina aktyvios organization narius | Darbų skyrimui ir administravimui |
| `PATCH /team/:userId/role` | Owner/admin keičia tenant role | Least-privilege valdymas tenant ribose |
| `PATCH /organization` | Pervadina aktyvią organization | Tenant savitarna be platform admin |
| `GET /invitations` | Rodo neišnaudotus ir istorinius kvietimus | Prieigos auditas |
| `POST /invitations` | Sukuria role apribotą kvietimą | Žmogus prijungiamas prie esamo tenant, nekuriant naujo |
| `DELETE /invitations/:invitationId` | Atšaukia neišnaudotą kvietimą | Nutraukti klaidingai suteiktą prieigą |
| `GET /auth/invitations/:token` | Viešai patikrina kvietimo būseną, neatskleisdamas paslapčių | Acceptance ekranui prieš login |
| `POST /auth/accept-invite` | Susieja identity su organization ir role | Kontroliuojamas membership sukūrimas |

### 13.2 Struktūra, profiliai, simuliacija ir dashboard

| Endpoint | Ką daro / kaip | Argumentas |
|---|---|---|
| `GET /dashboard` | Viena tenant-scoped užklausa su Areas, Sections, score, coverage ir freshness | Mažiau bootstrap round-trip ir vienas kanoninis modelis |
| `GET /areas` | Grąžina aktyvios organization Areas | Tenant izoliuotas fizinės struktūros sąrašas |
| `POST /areas` | Sukuria Area | Modeliuoti atskirą fizinę vietą |
| `PATCH /areas/:areaId` | Keičia pavadinimą ir metadata | Struktūros koregavimas neperrašant istorijos |
| `PATCH /areas/:areaId/map-status` | Įjungia/išjungia climate map funkciją | Žemėlapis rodomas tik sukonfigūruotoms vietoms |
| `DELETE /areas/:areaId` | Trina Area; gali palikti Sections nepriskirtas | Apsauga nuo kaskadinio verslo duomenų praradimo |
| `GET /sections` | Grąžina visas arba vienos Area Sections | Darbinės zonos ir filtravimas |
| `POST /sections` | Sukuria Section ir susieja profilį/Area | Mažiausias agronominio valdymo vienetas |
| `PATCH /sections/:sectionId` | Keičia Section, profilį ar Area | Reorganizacija išlaikant identity ir istoriją |
| `DELETE /sections/:sectionId` | Pašalina Section pagal DB integralumo taisykles | Kontroliuojamas lifecycle |
| `GET /crop-profiles` | Grąžina tenant profilius ir targets | Viena scoring/alert konfigūracijos kilmė |
| `POST /crop-profiles` | Sukuria profilį iš validuotų metrikų | Skirtingoms kultūroms ir etapams reikia kitų ribų |
| `PATCH /crop-profiles/:id` | Atnaujina profilio targets ir metadata | Kalibravimas nekuriant naujos Section |
| `POST /crop-profiles/:id/duplicate` | Kopijuoja profilį į naują redaguojamą variantą | Saugus eksperimentas nekeičiant naudojamo originalo |
| `DELETE /crop-profiles/:id` | Trina tik saugiai arba reikalauja replacement | Section negali likti su neegzistuojančiu profiliu |
| `POST /simulator/agronomic` | Paleidžia tas pačias serverio taisykles su įvestu scenarijumi | What-if neturi turėti kitos logikos nei production |

### 13.3 Matavimai, analitika ir eksportas

| Endpoint | Ką daro / kaip | Argumentas |
|---|---|---|
| `GET /readings/latest` | Vienai Section pateikia Section aggregate ir paskutines Node reikšmes | Dabartinė būsena su šaltinio atsekamumu |
| `GET /readings/latest-batch` | Kelių Sections latest duomenis grąžina viena užklausa | Pašalina N+1 ir auth/DB kartojimą |
| `GET /history` | Grąžina bounded raw arba rollup eilutę pagal periodą/step | Naršyklė neturi parsisiųsti neribotos istorijos |
| `GET /analytics/section` | Skaičiuoja series, targets, heatmap ir events | Sunkesnė analizė vienodai atliekama serveryje |
| `GET /analytics/dynamics` | Grąžina Section kitimo/variacijos santrauką | Atskirti momentinę reikšmę nuo elgesio laike |
| `GET /analytics/site-comparison` | Palygina Sections/Areas kanoninėmis metrikomis | Aptikti vietos skirtumus neperrašant analizės UI |
| `GET /exports/measurements.csv` | Validuoja periodą, nodes ir metrics; generuoja Node atskirtus stulpelius bei Excel suderinamą CSV | Eksportas turi kurti teisingus grafikus ir negali suplakti skirtingų Nodes |

### 13.4 Actions, Alerts, Interventions ir Push

| Endpoint | Ką daro / kaip | Argumentas |
|---|---|---|
| `GET /actions/today` | Generuoja dabartines prioritizuotas patikras iš readings/profile/rules | Telemetry paversti konkrečiu darbu |
| `POST /actions/today/:actionId/assignment` | Priskiria, perleidžia arba nuima darbą su priority/due date | Atsakomybė turi būti aiški ir audituojama |
| `POST /actions/today/:actionId/feedback` | Fiksuoja start/completed/deferred/failed, snapshot ir execution details | Įrodyti, kas buvo padaryta ir ar padėjo |
| `GET /actions/history` | Grąžina atliktų veiksmų chronologiją | Before/after analizė ir audit trail |
| `DELETE /actions/reset` | Tik owner/admin su explicit confirm išvalo action būsenas | Diagnostinis/administracinis reset neturi įvykti netyčia |
| `GET /actions/overview-summary` | Agreguoja action būsenas Overview ekranui | Overview nereikia perrinkti visos istorijos kliente |
| `GET /alerts` | Filtruoja kanoninius incidentus pagal lifecycle būseną | Viena incidentų tiesa, ne vien UI pranešimai |
| `POST /alerts/:alertId/acknowledge` | Pažymi, kad žmogus incidentą pamatė | Atskirti „matyta“ nuo „sutvarkyta“ |
| `POST /alerts/:alertId/snooze` | Nutildo iki nustatyto laiko | Valdyti triukšmą neprarandant incidento |
| `POST /alerts/:alertId/resolve` | Užbaigia incidentą ir palieka audit informaciją | Aiškus lifecycle galas |
| `GET /interventions` | Grąžina rankinių intervencijų istoriją | Darbai, kurie nėra automatinis action, vis tiek audituojami |
| `POST /interventions` | Užregistruoja intervenciją su kontekstu | Susieti operatoriaus veiksmą su vėlesniais duomenimis |
| `PATCH /interventions/:interventionId/outcome` | Įrašo rezultatą | Mokytis iš faktinio poveikio |
| `GET /push/config` | Grąžina tik viešą VAPID konfigūraciją | Browseriui nereikia private push rakto |
| `POST /push/subscriptions` | Išsaugo tenant/user scoped subscription | Siųsti incidentus tik autorizuotam gavėjui |
| `DELETE /push/subscriptions` | Pašalina endpoint subscription | Atšaukti pranešimus senam įrenginiui |

### 13.5 Nodes ir greenhouse map

| Endpoint | Ką daro / kaip | Argumentas |
|---|---|---|
| `GET /nodes` | Grąžina tenant Nodes, location, health, radio, power, firmware ir last gateway | Vienas inventory/diagnostikos šaltinis |
| `GET /nodes/:devEui/sensors` | Grąžina fizinius/loginius sensorių portus ir kontekstą | Žinoti, ką Node iš tiesų gali matuoti |
| `PATCH /nodes/:devEui/sensors/:port` | Keičia instaliavimo, kalibravimo ir priskyrimo metadata | Neinstaliuotas sensorius neturi atrodyti kaip nulinė reikšmė |
| `POST /nodes/register` | Legacy tenant registracijos kelias | Suderinamumas su ankstesniu provisioning modeliu |
| `POST /nodes/claim` | Priskiria gamykloje sukurtą Node organization | Raktų negeneruoti naršyklėje ir neperrašyti identity |
| `PATCH /nodes/:devEui` | Keičia label, Section, intervalą ir lifecycle metadata | Inventory valdymas išlaikant telemetry ryšį |
| `DELETE /nodes/:devEui` | Archyvuoja/trina pagal pasirinktą history politiką | Sąmoningas kompromisas tarp GDPR/valymo ir istorijos |
| `GET /areas/:areaId/map` | Grąžina layout revision, objektus, Nodes ir live measurements | Vienas erdvinio vaizdo kontraktas |
| `GET /areas/:areaId/map/history` | Parenka istorinį layout ir matavimų frame | Istorija turi naudoti tuo metu galiojusias Node vietas |
| `PATCH /areas/:areaId/map` | Validuoja ir išsaugo naują layout revision | Atsekami plano pakeitimai, ne tylus overwrite |
| `PATCH /areas/:areaId/map/nodes/:devEui/section` | Priskiria Node Section žemėlapio kontekste | Erdvinis ir agronominis modelis turi sutapti |

### 13.6 Platform admin ir organization lifecycle

| Endpoint | Ką daro / kaip | Argumentas |
|---|---|---|
| `GET /platform/integrations` | Rodo redaguoti neleidžiamą Clerk/DB/MQTT/Gateway/email/push būklę, ne paslaptis | Operacinis matomumas neatskleidžiant credentials |
| `GET /platform/users` | Rodo globalų vartotojų sąrašą ir memberships | Super-admin prieigos ir support darbas |
| `PATCH /platform/users/:userId/organization` | Transaction perkelia user, nustato role ir pašalina tikrai tuščią asmeninę org | Neužlaikyti orphan organization ir nepalikti dalinės būsenos |
| `PATCH /platform/users/:userId/status` | Aktyvuoja/deaktyvuoja identity | Skubiai sustabdyti prieigą netrinant audito |
| `DELETE /platform/users/:userId` | Su explicit confirm trina DB ir Clerk identity | Pilnas account lifecycle, saugant nuo atsitiktinio trynimo |
| `GET /platform/organization-requests` | Filtruoja prieigos/organization prašymus | Approval queue |
| `POST /platform/organization-requests/:requestId/approve` | Patvirtina ir sukuria būtiną membership/tenant struktūrą | Kontroliuojama prieiga |
| `POST /platform/organization-requests/:requestId/reject` | Atmeta prašymą su būsena | Aiškus administracinis sprendimas |
| `GET /platform/organizations` | Grąžina visų tenant santrauką | Platformos valdymas |
| `GET /platform/organizations/:organizationId/nodes` | Grąžina pasirinkto tenant Node diagnostiką | Support mato konkretų fleet neperjungdamas identity |
| `GET /platform/organizations/:organizationId/members` | Grąžina tenant narius | Prieigos auditui ir perkėlimui |
| `POST /platform/organizations` | Sukuria organization su default invariantais | Admin valdomas tenant provisioning |
| `PATCH /platform/organizations/:organizationId/archive` | Sustabdo organization nenaikinant duomenų | Grįžtamas offboarding |
| `PATCH /platform/organizations/:organizationId/restore` | Atkuria archyvuotą organization | Grįžtamumas |
| `DELETE /platform/organizations/:organizationId` | Super-admin su confirm atlieka pilną trynimą | Tik sąmoningas negrįžtamas veiksmas |
| `GET /platform/admins` | Grąžina platform admins | Globalių privilegijų auditas |
| `POST /platform/admins` | Suteikia platform admin | Deleguotas platformos administravimas |
| `DELETE /platform/admins/:userId` | Atima platform admin | Least privilege ir incident response |

### 13.7 Gamyklinis Node/Gateway ir Gateway agent

| Endpoint | Ką daro / kaip | Argumentas |
|---|---|---|
| `GET /gateway-factory/health` | Factory autentifikuotas API būklės patikrinimas | Gamybinė stotis turi tikrinti ryšį neprisijungdama kaip user |
| `GET /node-factory/firmware/latest` | Grąžina patvirtinto firmware metadata | Vienas gamyklinis release šaltinis |
| `GET /node-factory/firmware/download` | Atsisiunčia gamyklinį firmware | Flash procesas be viešo artefakto |
| `POST /node-factory/registrations` | Sukuria unikalų Node identity/raktus ir DB įrašą | Credentials gimsta kontroliuojamoje aplinkoje |
| `GET /node-factory/nodes/:devEui` | Patikrina pagaminto Node būseną | QA ir pakartotinio darbo kontrolė |
| `POST /gateway-factory/activations` | Išduoda vienkartinę Gateway aktyvaciją | Bootstrap secret negali būti daugkartinis |
| `POST /gateway-factory/enroll` | Aktyvaciją iškeičia į ilgalaikę Gateway tapatybę | Atskirti gamyklinį ir lauko credential |
| `POST /gateway/heartbeat` | Autentifikuotas agentas pateikia last-seen, versiją ir būklę | Žinoti tikrą Gateway–Node infrastruktūros šviežumą |
| `GET /gateway/update/check` | Agentui pateikia taikomą signed release/policy | Staged rollout, ne aklas auto-update |
| `GET /gateway/update/download` | Autorizuotai pateikia artefaktą | Firmware/software paketas nėra viešas |
| `POST /gateway/update/status` | Agentas įrašo download/install rezultatą | Rollout audit trail ir retry kontrolė |
| `GET /platform/gateway-updates` | Super-admin rodo fleet, versijas, rollout ir klaidas | Centrinis infrastruktūros valdymas |
| `PATCH /platform/gateways/:gatewayId/organization` | Priskiria arba atkabina Gateway tenant | Fleet ownership neturi būti spėjama iš telemetry |
| `DELETE /platform/gateways/:gatewayId` | Su confirm trina Gateway identity | Saugus decommission |
| `POST /platform/gateways/:gatewayId/update` | Suplanuoja individualų update | Remediation nekeičiant viso rollout |
| `PATCH /platform/gateway-updates/policy` | Keičia release kanalą/staged policy | Riboti blast radius |
| `GET /gateway-factory/gateways/:gatewayId` | Factory skaito Gateway provisioning būseną | QA ir atsekamumas |
| `GET /health` | Minimaliai tikrina API/DB readiness ir grąžina statusą | Uptime monitoriui nereikia user sesijos ar verslo duomenų |

## 14. Techninių funkcijų ir modulių registras

Paprasta statinė paieška šiame commit randa apie 970 pavadintų funkcijų/arrow apibrėžimų 137 source failuose; tikslus skaičius priklauso nuo to, ar callback, hook closure ir test fixture laikomi atskira funkcija. Žemiau registruojama kiekviena savarankišką atsakomybę turinti funkcijų šeima. Tūkstančio `map`, event-handler ar formatavimo closure vardų sąrašas būtų klaidinantis: tai nėra tūkstantis produkto gebėjimų ir dauguma neturi atskiro verslo motyvo.

| Modulis / šeima | Funkcijų atsakomybė | Kodėl atskirta |
|---|---|---|
| `src/services/api/client.ts` | base URL, headers, cookie auth, timeout, JSON/error normalizavimas, request dedup/cache, download, 401 signalas | Vienoda transporto semantika visam frontend |
| `src/services/api/neurocropApi.ts` | Tipizuotas vardinis kiekvieno vartotojo API veiksmo fasadas, struktūrinių mutacijų cache invalidacija, route prefetch | UI neturi konstruoti protokolo skirtingais būdais |
| `src/state/dashboardStore.ts` | Shared Areas/Sections/Nodes/Profiles/Actions būsena ir refresh | Išvengti besidubliuojančių fetch bei skirtingų kopijų |
| `src/state/workspaceAccess.ts` | Approval, membership ir pradinio setup gate | Neleisti shell apeiti kontroliuojamos prieigos |
| `src/services/performanceDiagnostics.ts` | PAGE/CODE/API/SERVER laiko įrašai, chronologija, copy/clear, `?perf=1` gate | Matavimais pagrįstas našumo darbas be kliento UI triukšmo |
| `DashboardShell` / `DashboardPage` | Maršrutai, lazy import, preload, stale-chunk recovery, loading overlay, error boundaries, responsive navigation | Viena aplikacijos lifecycle vieta |
| `OverviewWorkspace` | Dashboard modelio normalizavimas, limiting factor, section rows, action workflow, evidence drawer | Viena operacinė prioriteto santrauka |
| `AreasWorkspace` | Area list/filter/CRUD/map status | Fizinių vietų lifecycle |
| `SectionsWorkspace` | Directory/Coverage modeliai, selection, bulk UI, CRUD, readiness | Auginimo zonų paruoštis ir administravimas |
| `NodesWorkspace` + `nodes/model.ts` | Inventory, health, sensors, firmware, last gateway, claim/edit/delete | Hardware būklė atskirta nuo agronominių rodmenų |
| `ReadingsWorkspace` | Latest-batch, category/columns, section/node drill-down, freshness ir trust | Dabartinių matavimų palyginimas |
| `TrendsWorkspace` + shared trend chart/context | Area/Section/Node pasirinkimas, periodas, chart series, target zones, events, CSV modal | Istorinė analizė ir duomenų išvedimas |
| `AlertsWorkspace` | Lifecycle filtrai ir incidentų mutacijos | Incidentas nėra tas pats, kas darbas |
| `ActionsWorkspace` | Assignment, progress, completion, evidence/history | Operacinis darbo workflow |
| `CropProfilesWorkspace` + defaults | Profilio builder, metrics, targets, units, duplicate/delete replacement | Agronominė konfigūracija be kodo keitimo |
| `SimulatorWorkspace` | Scenario input ir serverio rezultatų interpretacija | Saugus what-if be live duomenų mutavimo |
| Settings/Organization/Admin workspaces | Sessions, team, invites, tenant santrauka, approvals, users, orgs, gateways, integrations | Tenant ir platform privilegijų atskyrimas |
| `metricRegistry` frontend/backend | ID, label, unit, validacijos ribos, group, formatting ir sensor mapping | Viena metrikų kalba per UI/API/DB/export |
| `backend/api.js` | Pagrindiniai auth, struktūros, profiles, readings, analytics, export ir Nodes route handleriai | Istoriškai centralizuota API; dabar per didelis monolitas |
| `auth-users`, `clerk-auth`, `team-routes`, `organization-routes`, `password-reset-routes` | Identity sinchronizacija, memberships, approvals, invitations, recovery, platform roles | Auth ir tenant sprendimai turi būti serverio pusėje |
| `validation.js`, `config.js`, `rate-limit.js` | Schema/ribos, environment fail-fast, abuse ribojimas | Nepriimti neaiškios įvesties ir nesaugios konfigūracijos |
| `db.js`, `migrate.js`, `migration-files.js` | Pool/query timing, transaction bazė, checksum migracijos ir lock | DB schema yra versionuotas kontraktas |
| `ingest.js`, `ingest-healthcheck.js` | MQTT connect/readiness, payload normalize/validate/dedup, transaction write, Node diagnostics | Patikimas telemetry įėjimas |
| `telemetry-values.js`, `calculations.js`, `statistics.js` | Valid value extraction, VPD/dew point/AH, percentile/spread/trend | Bendra matematinė semantika |
| `score.js`, `crop-risk.js`, `node-health.js` | Score/coverage/limiting factor, spatial risk episodes, freshness/device state | Atskirti sąlygų kokybę, vienodumą ir įrenginio sveikatą |
| `agronomic-rules.js`, `agronomic-simulator.js`, `today-actions.js` | Interaction rules, evidence, scenario engine, prioritizuotų checks generavimas | Rekomendacijos turi būti paaiškinamos ir testuojamos |
| `workflow-routes.js`, `alert-lifecycle.js`, `push-notifications.js`, `email.js` | Alert recovery/dedup, interventions, push/email pristatymas | Incidento būsena ir pristatymas neturi būti vienas ephemeral toast |
| `measurement-rollups.js`, `measurement-retention.js` | 10/60 min agregatai, batch pruning, advisory lock | Ilga istorija su kontroliuojama DB kaina |
| `greenhouse-map-routes.js` | Tenant map load/save/history, revisions, Node/Section association | Erdvinis modelis ir jo istorija |
| `geometry`, `useMapEditor`, map repositories/components | Coordinate transform, editor state, layout objektai, save/load UI | Žemėlapio mastelis ir edit lifecycle atskirti nuo heatmap |
| Heatmap moduliai | Measurement/confidence grid, IDW/raster interpolation, color scale, contour geometry/canvas render | Skaičiavimas testuojamas nepriklausomai nuo React |
| `gateway-factory-routes.js`, `gateway-updates.js`, `simulated-nodes.js` | Factory provisioning, heartbeat/update rollout, test Node generavimas | Device lifecycle ir test duomenys atskirti nuo žmogaus UI |
| Ops scripts/systemd | Backup, R2 upload, restore test, uptime monitor, recovery email | Veikianti aplikacija apima atkūrimą ir signalą, ne vien build |
| Test modules | Contract, tenant isolation, auth, migrations, map, rules, factory, gateway update ir E2E scenarijai | Užfiksuoti invariantai, o ne tik pavienės render detalės |

## 15. Ko negalima sąžiningai atkurti

Didelė dalis Git istorijos turi bendrines žinutes, pvz. `UPD`, todėl tikslus pirminio autoriaus argumentas kiekvienam ankstesniam sprendimui nėra užrašytas. Šiame audite:

- realizacija ir dabartinis elgesys yra faktai iš kodo;
- aiškūs motyvai paimti iš README, architektūros, modelių ir operacinių dokumentų;
- likę „kodėl“ yra pažymėta audito išvada pagal problemą, kurią mechanizmas sprendžia;
- neišgalvota privati minčių seka ir neapsimetama, kad vėlesnė išvada buvo pirminė autoriaus mintis.

Todėl dokumentas yra pilnas dabartinių produkto ir infrastruktūros funkcijų auditas, bet ne fiktyvi kiekvieno istorinio klavišo paspaudimo rekonstrukcija.
