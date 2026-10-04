# NeuroCrop diagnostikos įgyvendinimas

2026-10-04: agronominė logika sujungta į `backend/agronomy/`; diagnostika ir
kasdienės rekomendacijos naudoja bendrą backend variklį. Naujos ataskaitos saugo
dvikalbes išvadas, įrodymus ir variklio bei katalogo versijas. Frontend pasirenka
kalbą ir atvaizduoja išsaugotą eiliškumą. Senų ataskaitų API atsakymas papildomas
pagal išsaugotus įrodymus, nekeičiant DB snapshot, ir pažymimas kaip dabartinių
taisyklių interpretacija. Plačiau: [agronominis variklis](backend/agronomy/README.md).

2026-09-29. Pakeitimai paruošti vietiniame repozitorijoje; produkcinė DB ir diegimas nekeisti. Pradinio audito ataskaita: `../outputs/NeuroCrop-diagnostikos-auditas-2026-09-29.md`.

## Kur rasti

Šoninis meniu → **Diagnostika** (`/diagnostics`), taip pat nuoroda pagrindinėje apžvalgoje. Skiltys: įžvalgos ir išvados; zonos ir rodikliai; anomalijų istorija; ataskaitos; duomenys ir integracijos. Lietuvių ir anglų kalbos. Skaitymas prieinamas prisijungus; ataskaitas ir ciklus kuria owner/admin/grower, kalibravimą bei įrangos įvykius registruoja owner/admin/technician.

## Audito sričių rezultatas

| Sritis | Įgyvendinimas ir likusios sąlygos |
| --- | --- |
| A. Mikroklimato žemėlapis | Esamas erdvinis žemėlapis išlaikytas; diagnostikoje rodomas dabartinis žemėlapis, kai jis įjungtas objektui. Istorinės išvados atskirtos nuo dabartinio vaizdo. |
| B. Zonų palyginimas | Laiku svertiniai min/mean/max, kitų zonų mediana, bendras šiltnamio max−min nevienodumas, pasikartojimo dienos, probleminių zonų reitingas. Esami bendri Trends grafikai papildyti 14 d. periodu. Galima palyginti iki 6 šiltnamių. |
| C. Anomalijos | Nepriklausomas foninis threshold, rate-of-change ir peer detektorius; UUID epizodai, pradžia, pabaiga, severity, pradiniai ir paskutiniai įrodymai. Patvarios DB eilės įrašai patvirtinami toje pačioje transakcijoje kaip detektoriaus būsena. |
| D. Istorija | 7/14/30 d. diagnostika: laikas žemiau/aukščiau tikslų, nežinomas laikas, aprėptis, valandinis pasikartojimas. Nauji matavimai susieti su nekintančiu zonos/profilio/sensorių kontekstu. Iki migracijos istorija aiškiai pažymėta kaip įvertinta. |
| E. Agronominiai KPI | VPD nebeskaičiuojamas iš null kaip nulio; dienos/nakties vidurkiai pagal apšvietimo grafiką, dienos ekstremumai, CO₂ ir lux integralai. PPFD įvedimas bei dienos integralas mol/m². Lux neverčiamas į išmatuotą DLI. |
| F. Įrangos atsakas | Autentifikuotas idempotentinis įvykių API, rankinio įvykio forma, 30 min prieš/po zonų palyginimas su aprėptimi. Tai aprašomasis pokytis, ne priežastingumo ar energinio efektyvumo įrodymas. Realaus valdiklio adapteriui reikia konkretaus protokolo ir prieigos. |
| G. Ataskaitos | Nekintantys JSON momentiniai vaizdai, biblioteka, CSV, spausdinimas / naršyklės „Save as PDF“, periodinis 7/14/30 d. saugojimas. PDF papildomai turi visų rodiklių suvestinę. Prie įžvalgų saugomos rekomenduojamos patikros. |
| H/K. Produkto UX | Atskiras diagnostikos centras su prioritetinėmis vietomis, įrodymais ir patikromis; esama problemų ir veiksmų apžvalga išlaikyta. Pradinis produkto tekstas pristato belaidę diagnostiką. Ryšys su API nebevadinamas visos sistemos sveikata. |
| I. Patikimumas | Esamos mazgų būklės priemonės papildytos baterijos įtampa. Analizė ignoruoja negaliojančius ir užkešuotus sensorių mėginius; tarpų neprilygina normalioms sąlygoms. Tikra gateway/LoRa būsena priklauso nuo realios integracijos telemetrijos. |
| J. Struktūra | Company → Farm → Area → Section → Node → Sensor. Ūkio sukūrimas ir objekto priskyrimas diagnostikos integracijų skiltyje. |
| L. AI pagrindas | Įvykio/gavimo timestamp, kontekstas, vienetai, ciklas, partija, eksperimentas, stadija, kalibravimo metadata ir valdiklio įvykiai. ML, plant-state/crop model, prognozės, cost optimization ir digital twin dar nėra validuoti modeliai; jų negalima laikyti įdiegtais iš šių duomenų struktūrų. |

## Svarbi metodika

- Naudojami pirminiai matavimai. Reikšmė tęsiama daugiausia du tikėtinus konkretaus sensoriaus periodus (ne daugiau kaip 2 h); po to laikas nežinomas. Už ribų procentas – stebėtų mazgų minučių dalis, ne šiltnamio sieninio laikrodžio procentas.
- Aprėpties vardiklis konservatyvus: visas pasirinktas periodas kiekvienam istorijoje stebėtam ar dabartiniam priskyrimui. Perkėlus mazgą aprėptis gali būti sumažinta abiejose zonose. Tai nėra tikslus įrengimo laiko modelis.
- Reitingui reikia ≥50 % aprėpties. Sisteminio skirtumo įžvalgai: ≥60 min palyginimo, ≥50 % palyginto laiko virš fiksuoto skirtumo slenksčio ir ≥2 pasikartojimo dienos. Peer langai 5 min, bent 4,5 min duomenų; lyginami tik persidengiantys tos pačios Area matavimai. Reitingas aprašo nuokrypius, ne apskaičiuotą derliaus nuostolį.
- Dienos/nakties fazę nustato užfiksuoto profilio apšvietimo grafikas. Be grafiko šie KPI nežinomi. CO₂ ppm·h ir lux·h – **mazgų integralų suma**, todėl jos didėja su mazgų skaičiumi; tai ne normalizuotas plotinis poveikis.
- PPFD integralas pateikiamas atskirai kiekvienam mazgui ir kalendorinei dienai. Nepilna diena ir aprėptis matomos. Tikras PAR jutiklis bei jo kalibravimas būtini; vien programinė PPFD įvestis nėra įdiegtas jutiklis.
- Kontekstas fiksuojamas **gavimo/įrašymo metu**. Vėluojančiam matavimui prieš ankstesnį zonos/profilio pakeitimą istorinė konfigūracija neatkuriama. Detektorius vėluojančiais paketais neatsuka gyvos būsenos; jie patenka į retrospektyvinę analizę.
- Istoriniai epizodai kaupiami nuo migracijos, seno laikotarpio epizodai neatsukami. Atgijus signalui sukuriamas naujas epizodas; duomenų tarpas nėra pasveikimas. Trumpas peer/rate epizodas nėra sisteminis agronominis pažeidimas.
- Esami `/history` ir `/analytics/section` grafikai išlaiko ankstesnį agregavimo modelį; naujoji diagnostika yra pirminių matavimų trukmės ir užfiksuoto konteksto analizės vieta.
- Kalibravimo koeficientai saugomi kaip metadata ir automatiškai nepakeičia jau užregistruotų matavimų. Auginimo ciklo istorija fiksuojama naujuose kontekstuose. Kalibravimo ir ciklų informaciniai sąrašai naudoja dabartinį objektų priskyrimą.
- Vieno periodo limitas 300 000 matavimų (viršijus 422); istorijoje iki 2 000 epizodų su truncation indikacija; įrangos atsako lentelėje paskutiniai 100 įvykių. Ataskaitų biblioteka – paskutinės 100 organizacijos ataskaitų. Dideliems ūkiams reikės foninio ataskaitų vykdymo ir indeksuoto agregavimo.

## API

Visi endpointai naudoja esamą naudotojo autentifikaciją ir organizacijos apribojimą; controller-events nėra viešas webhook. Adapteris turi naudoti galiojančią integracijos autentifikaciją, o ne perduoti organizacijos ID užklausoje.

- `GET /diagnostics/areas/:areaId?days=7&to=<ISO>&timeZone=Europe/Vilnius`
- `GET /diagnostics/comparison?areaIds=a,b&days=7`
- `GET/POST /diagnostic-reports`; POST: `{areaId,days,to?,timeZone?}`
- `GET /diagnostic-reports/:id`, `GET /diagnostic-reports/:id/export.csv`
- `GET/POST /diagnostics/areas/:areaId/schedule`; POST: `{enabled,days,timeZone}`
- `GET/POST /diagnostics/farms`; POST: `{name}`
- `POST /diagnostics/areas/:areaId/farm`; `{farmId}`
- `POST /diagnostics/controller-events`; `{areaId,sectionId?,occurredAt,source:'controller'|'manual',deviceId,channel,state:{...},externalId}`. Pasikartojantis `(organization,deviceId,externalId)` ignoruojamas; UTC ISO įvykio laikas. Negalima rankinio įrašo pateikti kaip faktinės automatinės integracijos.
- `POST /diagnostics/calibrations`; `{nodeId,port,calibratedAt,expiresAt?,reference,uncertainty?,coefficients?}`
- `POST /diagnostics/cycles`; `{sectionId,crop,cultivar?,batchId?,experimentId?,stage?,startsAt,endsAt?}`
- Telemetrijoje PPFD: canonical `ppfd`, sensoriaus key `par_probe`, µmol/m²/s. Pasirinktinis `object.measured_at` arba `deviceMeasuredAt` atskiria matavimo ir gavimo laikus.

## Diegimas

1. Atsarginė DB kopija ir staging patikra su realios DB dydžiu. Migracijos prideda stulpelius, indeksus ir matavimų trigerius; įvertinti užrakinimo laiką. Senų migracijų nekeisti.
2. Sustabdyti įrašymo procesus arba diegti per esamą kontroliuojamą migracijų procedūrą. Paleisti `cd backend && npm run migrate` (0038 ir 0039). Paleisti naują API ir ingest versiją, paskui frontend.
3. Foninis monitorius paleidžiamas API procese kas 60 s (pirmas vykdymas po 5 s). Kelioms kopijoms naudojamas PostgreSQL advisory lock, ataskaitoms – unikalus schedule key. Stebėti `[diagnostics]` klaidas, eilės dydį ir DB apkrovą. Be veikiančio API proceso periodinės ataskaitos nekuriamos; el. paštu jos nesiunčiamos.
4. Tikrame objekte patikrinti sensorių scope, intervalus, profilių ribas, apšvietimo grafiko laiko juostą, zonų priskyrimus, įrangos įvykių laikus. Istorinių zonų/profilių negalima patikimai išgalvoti ar tyliai užpildyti.
5. Produkcinės integracijos patikra būtina prieš komercinį paleidimą. Šiame darbe nebuvo realaus valdiklio, naujo PAR sensoriaus, energijos skaitiklio, derliaus duomenų ar produkcinės DB prieigos.

## Patikrinimai

- `pnpm test`: frontend architektūros, CSS ir 106 vienetų testai.
- `pnpm build`, `pnpm lint`; `cd backend && npm test`.
- Papildomas tikros PostgreSQL semantikos testas PGlite: `DIAGNOSTIC_PGLITE_MODULE=<file URL į PGlite dist/index.js> node --test backend/tests/diagnostics-db.test.mjs`. Pritaiko visas migracijas, tikrina originalų kontekstą, organizacijų izoliaciją, epizodų idempotenciją ir momentinės ataskaitos nekintamumą. PGlite nėra pridėtas kaip produkto dependency.
- `e2e/diagnostics.spec.ts`: aiškiai sintetinė API fixture; navigacija, įrodymai, saugojimas ir atvėrimas, mobilus išdėstymas, JS klaidos. Reikia vietinio Vite su tuščiu `VITE_CLERK_PUBLISHABLE_KEY`; tai nėra produkcinio autentifikavimo ar realaus valdiklio integracijos testas.

## Diagnostikos peržiūros pertvarkymas (2026-09-30)

Pagrindinėje peržiūroje pasirenkamas tik šiltnamis ir periodas. Visų rodiklių pastebėjimai surikiuoti kartu. Drėgmė ir VPD toje pačioje zonoje sugrupuoti, išsaugant atskirus faktus; palyginimo ir ribų pažeidimo išvados neprarandamos. Prioritetas yra aiški euristika (severity, stebėto laiko dalis, pasikartojimas, normalizuotas nuokrypis, aprėptis ir istorinio konteksto tikrumas), ne derliaus nuostolių prognozė.

Pasirinkus pastebėjimą rodomas istorinio plano variantas periodo pabaigoje ir konkretaus jutiklio grafikas. Planas bei grafiko duomenys įrašomi į ataskaitos snapshot. Plano pakeitimai periodo viduryje ir backfill kilmė pažymimi. Nepridedama gyvų matavimų prie istorinės ataskaitos. Artimiausias durų/lango/įrangos objektas nurodomas tik patvirtintai jutiklio vietai; geometrinis atstumas iki objektų centrų nėra priežasties įrodymas.

Grafikas: valandos pirminių mėginių vidurkis ir min/max, tame lange nekintančios užfiksuotos profilio ribos. Kai valandoje ribos keičiasi ar jų nėra, tikslų juosta nerodoma. Tuščios valandos nejungiamos. Kitų zonų palyginimas yra jų valandinių medianų mediana; jis nepakeičia 5 min diagnostinio peer skaičiavimo. Trukmės skaičiuojamos ankstesniu riboto reikšmės tęstinumo metodu ir rodomos tik vienam jutikliui. Grafiko limitas 60 000 valandinių taškų visai ataskaitai, viršijimas pažymimas. Senos ataskaitos neturi naujų grafiko ir plano laukų ir lieka nekintančios.

Šiam pertvarkymui reikia atnaujinti ir backend, ir frontend. Papildomų DB migracijų po 0039 nereikia. Pakeitimai vietiniai, diegimas šio darbo metu nevykdytas.

## Paprastas vaizdas ir išsamesnė analizė (2026-10-01)

Pirmame ekrane rodomas vienas problemų sąrašas be iš anksto atverto plano ar grafiko. Išvada atveriama vietoje paspaudus „Plačiau“; planas ir grafikas turi atskirą išskleidimą. Ataskaitos atidarymas pradeda nuo suskleisto vaizdo.

Naujas `explanations` laukas iš pirminių matavimų skaičiuoja atskirai kiekvienam jutikliui ir rodikliui:
- laiką žemiau/aukščiau jo užfiksuotų ribų, nenutrūkstamų epizodų skaičių, ilgiausią epizodą ir jo pradžią/pabaigą;
- didžiausią nukrypimą su faktine reikšme, tuo metu galiojusia riba ir timestamp;
- dienų skaičių bei tris vietinio paros laiko valandas, kuriose sukaupta daugiausia nuokrypio laiko;
- kitų tos pačios Area jutiklių faktus stipriausio nukrypimo momentu; bent du tinkamas ribas turintys kiti jutikliai būtini vietinio/bendresnio nukrypimo hipotezei. Tai vieno konkretaus momento palyginimas, ne teiginys apie visą periodą;
- to paties paketo kitų rodiklių vidurkius per nukrypimus ir kitu stebėtu laiku. Abiem grupėms reikia bent 60 min; vidurkiai nerodo priežastingumo, o paros laikas gali būti confounder;
- abiejų periodo pusių už ribų praleisto stebėto laiko procentus. Palyginimui reikia bent 50 % abiejų pusių aprėpties, patvirtinto konteksto ir vienodų ribų. Pakeistas profilis negali automatiškai tapti „pagerėjimu“.

Trūkstami ir užkešuoti matavimai nekuria epizodų, konteksto pakeitimas ir duomenų tarpas nutraukia seno matavimo galiojimą. Ribotas reikšmės tęstinumas yra įvertinimas tarp realių mėginių, ne nepertraukiamas fizinis matavimas. Patikros parenkamos pagal istorinių ribų tikrumą ir palyginimo mastą, o tiksli priežastis be papildomų duomenų neįvardijama kaip faktas. Senos ataskaitos be `explanations` lauko nepapildomos išgalvota analize. Reikia backend ir frontend atnaujinimo; naujos DB migracijos nereikia.
