# Matavimų atsekamumas ir mazgų priėmimas

## Duomenų priėmimas

Migracija `0041_uplink_provenance.sql` prideda `uplink_events`,
`node_acceptance_runs` ir mazgo deklaruojamą pranešimų intervalą.
Migracija vykdoma įprastu API / ingest paleidimo procesu. Senų matavimų kilmės
įrašai neatkuriami ir jų versijos nėra spėjamos.

Kiekvienas registruoto, nearchyvuoto fizinio mazgo priimtas paketas išsaugo:

- tinklo gavimo, pasirinkto matavimo ir DB įrašo sukūrimo laiką;
- ChirpStack `deduplicationId`, `fCnt` ir `fPort`, jeigu pateikti;
- originalius `data` baitus base64 formatu, jeigu pateikti ir tinkami;
- deklaruotą firmware ir `object.decoder_version`, jeigu pateikti;
- serverio normalizavimo versiją;
- rodiklių reikšmes ir jų priėmimo arba atmetimo priežastis;
- jutiklių kokybės požymius, įrenginio klaidas ir gateway radijo metaduomenis;
- organizaciją, zoną ir šiltnamį įrašo priėmimo metu.

Duomenų šaltinio žymos, prisijungimo raktai ir savavališki dekoduoto objekto
laukai nekopijuojami. Base64 turinys yra pirminis jutiklio pranešimas, ne
LoRaWAN tinklo raktai. Kai dekoderio versijos nėra pakete, API grąžina `null`.

Vieno mazgo priėmimas serializuojamas. Matavimas, mazgo naujausia būsena ir
kilmės įrašas įrašomi viena DB transakcija. Klaida grąžina visą transakciją,
o patvarus MQTT buferis išlaiko paketą pakartotiniam bandymui. Tas pats šaltinio
įvykis nekeičia jau įrašyto rezultato. Atskiras pranešimas tuo pačiu matavimo
laiku gauna `measurement_duplicate` rezultatą; skaitiklis vienas pats nėra
deduplikavimo raktas, nes po įrenginio paleidimo gali pasikartoti.

Atsekamumo įrašai valomi dalimis pagal `MEASUREMENT_RETENTION_DAYS` (numatyta
35 dienos), skaičiuojant nuo kilmės įrašo sukūrimo. Gamybinės patikros rezultatas
išsaugo savo įrodymų kopiją ir lieka prieinamas išvalius pirminį paketą.
`normalizer_version` būtina pakeisti keičiant priėmimo / normalizavimo semantiką.

## Kliento API ir UI

- `GET /nodes/:devEui/uplinks`: iki 20 paskutinių pranešimų su vertinimo įrodymais.
- `GET /nodes/:devEui/uplinks/:eventId`: vienas įrašas su base64 turiniu.

Abu keliai reikalauja vartotojo autentifikacijos. Dabartinis mazgo savininkas ir
įrašo organizacija turi sutapti su sesijos organizacija. Perkėlus mazgą kitam
klientui, ankstesnio kliento pranešimai naujam klientui neatskleidžiami.
Nepriskirto gamyklinio mazgo duomenys klientų API nėra matomi.
Naujo matavimo `uplink_event_id` tiesiogiai nurodo jį sukūrusį paketą.
Pasibaigus atsekamumo saugojimo terminui ši nuoroda gali tapti `NULL`;
senų matavimų nuorodos taip pat lieka `NULL`.

Mazgo puslapyje pateikiamas ryšio paaiškinimas ir išskleidžiama pranešimų
istorija. Ji kraunama tik ją atvėrus. Simuliuojamiems mazgams fizinių pranešimų
atsekamumo skiltis nerodoma.

Ryšio paaiškinimas remiasi mazgo deklaruojamu intervalu, o jo nesant — profilio
intervalu. Gateway būsena vertinama pagal paskutinius žinomus būsenos
pranešimus. Trūkstant įrodymų nenurodoma tariamai nustatyta gedimo priežastis.
Praėjusių intervalų skaičius nėra prarastų paketų skaičius. Jutiklių gavimo
patikra nepatvirtina matavimo kalibravimo tikslumo.

## Gamybinė patikra

Autentifikacija ta pati, kaip esamų `/node-factory/*` kelių.

1. Programa patikrina UF2 SHA-256, įrašo firmware ir per USB perskaito DevEUI
   bei versiją. Aktyvaus mazgo firmware atnaujinimas taip pat pereina patikrą.
2. `POST /node-factory/nodes/:devEui/acceptance` pradeda 10 minučių bandymą:

   ```json
   {
     "firmwareVersion": "2.1.7-factory",
     "firmwareSha256": "<64 SHA-256 simboliai iš serverio manifesto>",
     "usbVerified": true,
     "expectedSensors": ["sht45"]
   }
   ```

3. `GET /node-factory/nodes/:devEui/acceptance/:id` vertina naujus paketus ir
   grąžina `pending`, `passed` arba `failed` bei atskirų tikrinimų rezultatus.

Pradiniai privalomi rodikliai yra nauji SHT45 temperatūros ir drėgmės matavimai.
Papildomi jutikliai nurodomi `expectedSensors`; SHT45 patikros pašalinti negalima.
Firmware ir kontrolinė suma turi atitikti patikrintą serverio leidimą. Dabartinis
USB leidimo priesagas `-factory` turintis pavadinimas atitinka dekoderio
pranešamą semantinę versiją be šios priesagos; leidimo teikėjas gali nurodyti
atskirą `telemetryVersion` kitiems formatams.

Sėkmei reikia bandymo metu gauto ir įrašyto paketo su naujais matavimais,
atitinkančia firmware versija, aptiktais numatytais jutikliais ir be aktyvių
deklaruotų klaidų. Ankstesnė „online“ būsena, cache reikšmės, netinkamos reikšmės,
neatpažinta versija arba po termino gautas paketas sėkmės nepatvirtina.
Vėliau perskaičius rezultatą, galutinė būsena nekeičiama. Naujas bandymas
ankstesnį nebaigtą bandymą pažymi `superseded`.

Windows programos šaltiniai yra vietiniame privačiame `node-factory/windows-app`
kataloge, kuris sąmoningai ignoruojamas Git. Jie pakeisti atskirai; įprastas
frontend/backend diegimas Windows programos neatnaujina. Reikia atskiro privataus
Windows leidimo. Vietoje paruoštas `NeuroCropNodeFactory-ACCEPTANCE-v2.1.0-win-x64.exe`
ir jo `.sha256`; ankstesni EXE neperrašyti. Programa prieš programuodama tikrina,
ar backend palaiko priėmimo protokolo versiją 1, ir neleidžia programuoti su
nepatvirtinta atsargine firmware kopija. Pirmiausia diegiamas naujas backend.
Šių šaltinių ir vykdomųjų failų negalima automatiškai įtraukti
į viešą repo ar frontend paketą. Gamybinę programą reikia praktiškai patikrinti
Windows kompiuteryje su tikru mazgu ir gateway.

## Patikros ir diegimas

`backend/tests/telemetry-support-db.test.mjs` CI naudoja PostgreSQL. Vietinis
bandymas gali naudoti izoliuotą PGlite per `DIAGNOSTIC_PGLITE_MODULE`. Tikrinami
migracijų vykdymas, atominis įrašymas su priverstine klaida, pakartotinis
pristatymas, organizacijų atskyrimas, gamybinės patikros terminas ir valymas.
`e2e/node-support.spec.ts` tikrina išskleidimą, užklausos klaidą ir pakartojimą,
LT/EN bei telefono vaizdą su testiniais duomenimis.

Šiam pakeitimui reikia backend (API ir ingest) bei frontend atnaujinimo.
Produkcinio serverio šie vietiniai bandymai nekeičia. Po diegimo reikia
patvirtinti naujo tikro paketo įrašą ir kliento skiltyje matomą jo vertinimą.
Tai nepatvirtina paketų, prarastų iki patvaraus MQTT priėmimo, atkūrimo.

## Izoliuotas srauto bandymas, 2026-10-15

Pakartojamas scenarijus: `backend/scripts/benchmark-ingest.mjs`. Jis visada
kuria naują PGlite bazę atmintyje ir nesijungia prie serverio ar `PG*` nustatytos
bazės. `BENCHMARK_PGLITE_MODULE` nurodo atskirai įdiegto testavimo modulio
`dist/index.js` kelią; ši biblioteka nėra produkcinė projekto priklausomybė.

1000 imituojamų mazgų priskirti vienai organizacijai ir zonai. Per tris
nuoseklius pliūpsnius įrašoma po vieną temperatūros / drėgmės paketą iš
100, 500 ir 1000 mazgų. Vykdomas tikras ingest handler ir DB trigeriai.

| Mazgų / paketų | Pliūpsnio trukmė | Paketų per sekundę | Vieno paketo P95 |
| --- | --- | --- | --- |
| 100 | 312 ms | 321 | 5,68 ms |
| 500 | 1437 ms | 348 | 4,17 ms |
| 1000 | 2665 ms | 375 | 3,69 ms |

Patvirtinta: 1600 matavimų, 1600 kilmės įrašų, visos 1600 nuorodų sutampa.
Tai vietinis atminties DB bandymas, ne produkcijos pajėgumo pažadas. Nevertinti
LoRaWAN, MQTT, VPS diskas ir tinklas, foniniai taisyklių darbuotojai bei API / UI
užklausų apkrova. Produkcijos riboms nustatyti reikia atskiro staging bandymo su
realiomis PostgreSQL sąlygomis ir reprezentatyvia istorija.
