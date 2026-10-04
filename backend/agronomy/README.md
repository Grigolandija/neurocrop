# Agronominis variklis

Agronominės taisyklės ir sprendimai valdomi backend. API, diagnostika ir
simuliatorius naudoja `index.js`; naršyklė atvaizduoja serverio sprendimus.

## Kur keisti logiką

| Failas | Atsakomybė |
| --- | --- |
| `catalog.js` | Dabartinių ir istorinių sąlygų taisyklės, jų reikalaujami rodikliai, agronominiai paaiškinimai, veiksmai, prioritetai, šaltiniai. |
| `history.js`, `growth.js` | Istorinių matavimų vienalaikiškumas, jutiklių tinkamumas, ribotas rodmenų galiojimas ir epizodų trukmė. |
| `live.js`, `actions.js` | Dabartinių sekcijos rodiklių vertinimas, veiksmų parinkimas ir rezultato patikra. |
| `risks.js` | Rizikos tęstinumas, skirtumai tarp jutiklių ir operacinis prioritetas. |
| `advice.js`, `growth-advice.js`, `evidence.js` | Katalogo taisyklių pritaikymas konkretiems įrodymams ir dvikalbių istorinių išvadų parengimas. |
| `index.js` | Bendri įėjimo taškai ir skaičiavimų, katalogo bei atsakymo formato versijos. |

Kultūros ir stadijos skaitinės ribos lieka kultūros profilyje. Istorinė analizė
naudoja matavimo metu užfiksuotą profilį. Jo nepakeičia dabartinė konfigūracija.
Taisyklės yra sąlygų ir rizikų vertinimas, ne išmokytas ligų ar derliaus modelis.

## Naudojimas

```js
import {
  analyzeHistoricalAgronomy, buildTodayActions, buildCropRisks
} from './agronomy/index.js';

const { agronomy, agronomicInsights } = analyzeHistoricalAgronomy(rows, report);
const actions = buildTodayActions(sectionSnapshots, { limit: 10 });
const risks = buildCropRisks(actions, sectionSnapshots, episodes);
```

Istorinis ir dabartinis vertinimas turi skirtingus duomenų adapterius: dabartinis
vertinimas gauna sekcijos būseną, istorinis – individualius matavimus ir jų
kontekstą. Jų sąlygų ir apšvietimo interpretacijų nesutapatiname mechaniškai.
Keičiant agronominę žinią, kataloge reikia peržiūrėti abu jos taikymo būdus ir
pridėti scenarijus abiem laiko langams.

Istorinė išvada pateikia `title`, `meaning`, `action`, `verify`, `evidence`,
`limits`, `source`, `priority`, `ruleId` ir struktūrinius `evidenceDetails`.
Prie išvadų grąžinamos `engineVersion`, `catalogVersion`, `schemaVersion` ir
`origin`. `lt` ir `en` sąrašai turi tuos pačius identifikatorius ir prioritetus.
Frontend kalbos pasirinkimas neperskaičiuoja nei išvados, nei jos vietos sąraše.

## Įrodymų ribos ir ataskaitos

- Trūkstami, išjungti, pasenę ir simuliuoti istoriniai rodmenys nepagrindžia rizikos.
- Skirtingų jutiklių nesutampantys matavimai nepagrindžia vienalaikės sąveikos.
- Jutiklių stebėjimo trukmės nesumuojamos kaip praėjęs šiltnamio laikas.
- Skirtingos stadijos ir istorinės ribos išlaiko atskiras išvadas.
- 30 stebėtų minučių yra ataskaitos įtraukimo filtras, ne biologinės žalos riba.
- Duomenų kokybė nėra statistinė diagnozės tikimybė. Jos nevadiname modelio tikslumu.

Naujos išsaugotos ataskaitos saugo ir skaičiavimus, ir dvikalbes išvadas, ir
variklio bei katalogo versijas. Atvėrimas jų neperinterpretuoja.

Senų ataskaitų, kurios neturi `agronomicInsights`, API atsakymą papildo
`withAgronomicInsights()`. Naudojami tik tos ataskaitos išsaugoti įrodymai;
matavimai iš naujo neužklausiami, duomenų bazės snapshot neperrašomas.
`origin: 'legacy-report'` ir UI pastaba atskiria dabartinių taisyklių paaiškinimus
nuo originalios ataskaitos. Senos VPD suvestinės negali pagrįsti vienalaikės
substrato drėgmės, nepertraukiamų epizodų ar kultūros stadijos.

Keičiant skaičiavimų reikšmę atnaujinti `AGRONOMY_ENGINE_VERSION`; keičiant
taisykles ir rekomendacijas – `AGRONOMY_CATALOG_VERSION`. Laužant API formato
suderinamumą atnaujinti `AGRONOMY_SCHEMA_VERSION` ir frontend sutartį.

Ankstesni `backend/agronomic-rules.js`, `today-actions.js`, `crop-risk.js` ir
diagnostikos agronomijos failai liko tik kaip suderinamumo eksportai. Juose
naujų taisyklių nerašyti.

## Patikra

Iš projekto šaknies:

```bash
node --test backend/tests/agronomy-engine.test.mjs backend/tests/diagnostic-agronomy.test.mjs backend/tests/diagnostic-growth-risks.test.mjs
pnpm test:diagnostics
```

Backend bendri testai papildomai tikrina dabartines sąveikas, rizikų tęstinumą ir
simuliatoriaus naudojamą adapterį. `diagnostics-db.test.mjs` tikrina pilną
ataskaitos surinkimą ir jos nekintamumą po profilio pakeitimo.

Diegti backend prieš atnaujinant frontend. Šis pakeitimas nekeičia DB schemos.
