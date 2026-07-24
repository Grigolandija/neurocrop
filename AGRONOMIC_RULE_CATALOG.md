# NeuroCrop agronominių taisyklių katalogas

Versija: 0.1 (mokslinis darbinis katalogas)  
Data: 2026-07-24

## 1. Paskirtis ir ribos

Šis katalogas aprašo bendrą kontroliuojamos aplinkos, šiltnamio ir hidroponikos
taisyklių modelį. Jis nėra universali vienos kultūros auginimo instrukcija.
Konkrečios optimalios, perspėjimo ir kritinės ribos turi būti nustatomos pagal:

- kultūrą ir veislę;
- augimo fazę;
- dienos / nakties režimą ir fotoperiodą;
- auginimo sistemą (dirvožemis, substratas, NFT, DWC ir kt.);
- jutiklio tipą, kalibraciją ir įrengimo vietą;
- vietoje sukauptą augimo, derliaus ir intervencijų rezultatų istoriją.

Taisyklės turi kurti perspėjimą ir rekomendaciją, bet negali aklai valdyti
šildymo, rūgšties, trąšų, CO2 ar laistymo be atskiro saugos valdiklio.

## 2. Trylika agronominių parametrų

| ID | NeuroCrop raktas | Parametras | Pastaba |
|---|---|---|---|
| P01 | `airTemp` | Oro temperatūra | Matuoti augalų lajos aukštyje ir apsaugoti nuo tiesioginės spinduliuotės. |
| P02 | `humidity` | Santykinė oro drėgmė (RH) | Priklauso nuo temperatūros, todėl vertinti kartu su VPD ir rasos tašku. |
| P03 | `vpd` | Oro garų slėgio deficitas | Išvestinis iš P01 ir P02; apibūdina atmosferos vandens paklausą. |
| P04 | `co2` | CO2 koncentracija | Agronominė vertė priklauso nuo šviesos, temperatūros ir stomatų būklės. |
| P05 | `light` | Šviesa | Produkcijoje naudoti PPFD ir DLI; dabartinis `lux` yra tik apytikris signalas. |
| P06 | `leafTemp` | Lapo / lajos temperatūra | Kartu su oro drėgme leidžia skaičiuoti lapo VPD ir kondensacijos riziką. |
| P07 | `dewPointMargin` | Lapo atsarga iki rasos taško | `leafTemp - dewPoint`; išvestinis iš P01, P02 ir P06. |
| P08 | `soilMoisture` | Substrato / dirvožemio drėgmė | Reikia konkretaus substrato kalibracijos ir kelių matavimo vietų. |
| P09 | `soilTemp` | Šaknų zonos / substrato temperatūra | Veikia šaknų augimą, kvėpavimą ir maisto medžiagų paėmimą. |
| P10 | `ec` | Tiekiamo maistinio tirpalo EC | Parodo bendrą jonų koncentraciją, bet ne atskirų elementų balansą. |
| P11 | `ph` | Maistinio tirpalo pH | Veikia elementų tirpumą ir prieinamumą; vertinti po tirpalo susimaišymo. |
| P12 | `soilEc` | Šaknų zonos / substrato EC | Vertinti kartu su P08, P09 ir tiekiamo tirpalo P10. |
| P13 | `waterTemp` | Laistymo / maistinio tirpalo temperatūra | Susijusi su šaknų temperatūra ir ištirpusio deguonies prieinamumu. |

Pastaba: dabartiniame kode yra 12 agronominių metrikų ir `batteryLevel`.
`batteryLevel` nėra auginimo parametras. P07 yra moksliškai prasmingas tryliktas
parametras ir jau gali būti apskaičiuotas iš esamų temperatūros bei RH duomenų.

## 3. Taisyklių žymėjimas

- `LOW`, `OPTIMAL`, `HIGH` reiškia kultūros profilio ribas, ne universalius skaičius.
- `CRITICAL_LOW` ir `CRITICAL_HIGH` reiškia išorinę kritinę profilio ribą.
- `RISING` ir `FALLING` vertinami pagal kultūrai ir jutikliui nustatytą laiko langą.
- `LIGHT_ON` nustatomas pagal PPFD / fotoperiodą, ne vien laikrodį.
- `DARK` reiškia, kad PPFD yra žemiau fotosintezės slenksčio.
- `PERSISTENT` reiškia bent tris patikimus matavimų intervalus.
- Pasitikėjimas `A`: fizikinis ryšys arba stiprus metodinis pagrindas.
- Pasitikėjimas `B`: kontroliuojamų bandymų pagrindas, bet būtina kultūros kalibracija.
- Pasitikėjimas `C`: agronomiškai pagrįsta diagnostinė hipotezė, kurią būtina
  patvirtinti vietos duomenimis arba papildomu matavimu.

## 4. Fizikiniai išvestiniai dydžiai

Oro VPD skaičiuojamas iš oro temperatūros ir RH. Tikslesniam augalo vertinimui
rekomenduojamas lapo VPD:

```text
es(T) = 0.6108 * exp(17.27 * T / (T + 237.3))
ea = es(airTemp) * humidity / 100
airVPD = es(airTemp) - ea
leafVPD = es(leafTemp) - ea
dewPointMargin = leafTemp - dewPoint(airTemp, humidity)
```

Jeigu `dewPointMargin <= 0`, lapo paviršius fiziškai gali kondensuoti drėgmę.
Perspėjimo atsarga virš nulio turi būti kalibruojama pagal jutiklio paklaidą,
erdvinį nevienodumą ir konkrečios ligos rizikos modelį.

## 5. Vieno parametro taisyklės

| ID | Sąlyga | Agronominė interpretacija | Rekomenduojamas atsakas | Lygis | Įrodymai |
|---|---|---|---|---|---|
| S001 | P01 `LOW` ir `PERSISTENT` | Lėtėja fermentinės reakcijos, vystymasis ir augimas; jautriose fazėse galimas šalčio pažeidimas. | Patikrinti šildymą, šalto oro patekimą ir dienos / nakties profilį. | B | E03, E06 |
| S002 | P01 `HIGH` ir `PERSISTENT` | Didėja kvėpavimas ir šiluminio streso rizika; optimali temperatūra priklauso nuo šviesos ir fazės. | Patikrinti vėdinimą, šešėliavimą, aušinimą ir lajos temperatūrą. | B | E03, E06 |
| S003 | P02 `LOW` | Vien RH nepakanka diagnozei, bet dažnai didėja atmosferos džiovinimo jėga. | Vertinti P03 ir P06; nedidinti drėgmės aklai. | A | E01, E02 |
| S004 | P02 `HIGH` | Mažėja garavimo potencialas, o prie vėsaus paviršiaus didėja kondensacijos rizika. | Vertinti P07, oro judėjimą ir naktinį temperatūros kritimą. | A | E02, E13 |
| S005 | P03 `LOW` | Transpiracija ir kalcio pernaša gali būti per maža; labai drėgnoje aplinkoje didėja kondensacijos rizika. | Patikrinti P07, oro judėjimą ir kultūros fiziologinių sutrikimų riziką. | B | E02, E13 |
| S006 | P03 `HIGH` | Didelė atmosferos vandens paklausa gali viršyti šaknų vandens tiekimą ir užverti stomatas. | Vertinti P08 ir P06 prieš keičiant drėkinimą ar drėkinant orą. | B | E03, E04 |
| S007 | P04 `LOW` per `LIGHT_ON` | Esant pakankamai šviesai CO2 gali riboti fotosintezę. | Patikrinti CO2 tiekimą, ventiliaciją, jutiklį ir PPFD. | B | E04, E05 |
| S008 | P04 `HIGH` | Virš kultūros ir PPFD atsako zonos papildomas CO2 duoda mažėjančią naudą; tamsoje tai dažniausiai nuostolis. | Nestiprinti dozavimo, kol nepatikrinti P05, P03 ir dozavimo grafikas. | B | E04, E05 |
| S009 | P05 dienos DLI `LOW` | Trūksta dienos fotonų kiekio, todėl galimas anglies asimiliacijos ir augimo ribojimas. | Tikrinti lempas, fotoperiodą, užtemdymą ir lajos PPFD pasiskirstymą. | B | E05, E06 |
| S010 | P05 momentinis PPFD `HIGH` | Gali atsirasti šviesos prisotinimas ar fotostresas, ypač kai CO2, temperatūra ar vanduo nėra suderinti. | Vertinti P04, P06, P03 ir DLI; nenaudoti vien `lux` ribos. | B | E05, E06 |
| S011 | P06 `LOW` | Galimas šalto oro srautas, per stiprus garinamasis vėsinimas arba šalčio stresas. | Palyginti su P01, P03 ir P07; patikrinti jutiklio matymo lauką. | C | E02, E03 |
| S012 | P06 `HIGH` | Lajos energijos apkrova arba nepakankamas transpiracinis vėsinimas; galimas stomatų užsidarymas. | Palyginti su P01, P03, P05 ir P08. | B | E03, E05 |
| S013 | P07 arti 0 arba `FALLING` | Artėja kondensacija ant lapo; riziką lemia trukmė ir patogeno temperatūros langas. | Didinti atsargą švelniai šildant / sausinant ir gerinant oro maišymą. | A | E02, E14 |
| S014 | P07 `<= 0` ir `PERSISTENT` | Kondensacija fiziškai galima arba tikėtina. | Aukšto prioriteto patikra: lapo drėgnumas, oro judėjimas, šilumos tiltai ir ligų rizika. | A | E02, E14 |
| S015 | P08 `LOW` | Mažėja šaknų zonos vandens prieinamumas; faktinė rizika priklauso nuo P03 ir P12. | Patikrinti laistymo tiekimą, jutiklio vietą ir dryback kreivę. | B | E01, E11 |
| S016 | P08 `HIGH` | Galimas perlaistymas, mažas oro poringumas ir prastas šaknų aprūpinimas deguonimi. | Patikrinti drenažą, laistymo dažnį ir P09 / P13. | B | E08 |
| S017 | P09 `LOW` | Lėtėja šaknų augimas ir maisto medžiagų paėmimas; poveikis priklauso nuo kultūros ir P01. | Patikrinti šaknų zonos šildymą ir P13. | B | E07 |
| S018 | P09 `HIGH` | Didėja šaknų kvėpavimo ir deguonies poreikis; per aukšta temperatūra slopina šaknų augimą. | Tikrinti P13, P08, aeraciją ir šaknų būklę. | B | E07, E08 |
| S019 | P10 `LOW` | Tirpale gali trūkti bendros maisto jonų koncentracijos, tačiau EC neparodo atskirų elementų. | Tikrinti receptą, dozatorius ir laboratorinę tirpalo sudėtį. | B | E09 |
| S020 | P10 `HIGH` | Didėja osmosinis slėgis ir gali būti slopinamas vandens bei maisto medžiagų paėmimas. | Patikrinti receptą, vandens šaltinį ir P12 prieš skiedžiant ar plaunant. | B | E10, E11 |
| S021 | P11 `LOW` | Gali keistis elementų tirpumas ir didėti kai kurių elementų toksiškumo rizika. | Patikrinti zondo kalibraciją, susimaišymo laiką ir rūgšties dozavimą. | B | E09, E10 |
| S022 | P11 `HIGH` | Gali mažėti dalies mikroelementų prieinamumas ir formuotis nuosėdos. | Patikrinti šarmingumą, receptą, zondą ir pH korekcijos sistemą. | B | E09, E10 |
| S023 | P12 `LOW` | Galimas šaknų zonos maisto medžiagų išplovimas ar nepakankamas tiekimas. | Lyginti su P10, P08 ir drenažo EC; nedidinti trąšų iš vieno taško. | C | E09, E12 |
| S024 | P12 `HIGH` | Galimas druskų kaupimasis arba koncentracija džiūstant substratui. | Pirmiausia vertinti P08, P09 ir P10; tik tada spręsti dėl praplovimo. | B | E11, E12 |
| S025 | P13 `LOW` | Šaltas tirpalas gali mažinti šaknų aktyvumą ir sukurti šaknų / antžeminės dalies temperatūrinį disbalansą. | Sulyginti su P09 ir kultūros profiliu; šildyti palaipsniui. | B | E07, E08 |
| S026 | P13 `HIGH` | Šiltame vandenyje mažėja deguonies tirpumas, o šaknų metabolinis poreikis didėja. | Patikrinti aeraciją / DO, rezervuaro šilumos šaltinį ir P09. | B | E08 |

## 6. Dviejų parametrų sąveikos

| ID | Parametrai ir sąlyga | Interpretacija / sprendimo logika | Lygis | Įrodymai |
|---|---|---|---|---|
| I001 | P01 `RISING` + P02 `FALLING` | VPD gali kilti daug greičiau nei rodo kiekviena metrika atskirai; perspėti pagal P03 pokyčio greitį. | A | E01, E02 |
| I002 | P01 `FALLING` + P02 `RISING` | Artėja rasos taškas; prioritetas P07, ypač saulėlydžio ir nakties metu. | A | E02 |
| I003 | P01 `HIGH` + P02 `HIGH` | Aukštas RH nereiškia mažo streso: prie aukštos temperatūros VPD vis tiek gali būti reikšmingas. Naudoti P03. | A | E01, E02 |
| I004 | P01 `LOW` + P02 `HIGH` | Didelė kondensacijos rizika ant dar vėsesnių lapų ir konstrukcijų; tikrinti P07. | A | E02 |
| I005 | P03 `HIGH` + P08 `LOW` | Vienu metu aukšta atmosferos paklausa ir maža šaknų vandens pasiūla: didelė vytimo / stomatų užsidarymo rizika. | B | E01, E03 |
| I006 | P03 `HIGH` + P08 `HIGH` | Vandens substrato zonoje yra, todėl karšti lapai gali rodyti šaknų hipoksiją, hidraulinį ribojimą ar prastą šaknų būklę. | C | E03, E08 |
| I007 | P03 `LOW` + P08 `HIGH` | Mažas garavimo poreikis ir daug vandens: mažinti laistymo impulsus, stebėti drenažą ir šaknų aeraciją. | B | E01, E08 |
| I008 | P03 `LOW` + P08 `LOW` | Substratas sausas, bet dabartinė atmosferos paklausa maža; galimas naktinis dryback arba jutiklio vietos neatitikimas. | C | E01, E12 |
| I009 | P06 > P01 + P03 `HIGH` | Lapas šiltesnis už orą ir didelė vandens paklausa: silpnas transpiracinis vėsinimas / stomatų užsidarymas. | B | E03 |
| I010 | P06 < P01 + P03 `HIGH` | Transpiracinis vėsinimas dar veikia, bet vandens sunaudojimas gali būti didelis; stebėti P08 trendą. | B | E03 |
| I011 | P06 `HIGH` + P05 `HIGH` | Tikėtina didelė spinduliuotės energijos apkrova; vertinti kaip fototerminį stresą, ne vien oro temperatūrą. | B | E05 |
| I012 | P06 `HIGH` + P05 `LOW` | Šviesa nepaaiškina karšto lapo: tikrinti karšto oro srautą, šildymo vamzdžius, zondo vietą ar ligą. | C | E02 |
| I013 | P06 `LOW` + P07 arti 0 | Vėsus lapas pasiekia rasos tašką anksčiau nei oras; kondensacijos signalą teikti pagal lapą. | A | E02 |
| I014 | P01 `HIGH` + P09 `LOW` | Šiltai lajai ir šaltoms šaknims gali trūkti suderinto vandens / maisto paėmimo. | B | E07 |
| I015 | P01 `LOW` + P09 `HIGH` | Šaknų kvėpavimas gali išlikti aukštas, kai antžeminės dalies augimo paklausa maža; tikrinti nakties režimą. | C | E07 |
| I016 | P09 `HIGH` + P08 `HIGH` | Šilta ir prisotinta šaknų zona didina deguonies trūkumo riziką. | B | E08 |
| I017 | P09 `LOW` + P12 `HIGH` | Lėtas paėmimas kartu su didele šaknų zonos druskų koncentracija didina osmosinio ribojimo riziką. | B | E07, E11 |
| I018 | P13 `HIGH` + P10 `HIGH` | Šiltas ir koncentruotas tirpalas: mažesnis O2 prieinamumas bei didesnis osmosinis stresas. | B | E08, E11 |
| I019 | P13 `HIGH` + P11 greitai `DRIFTING` | Temperatūra ir biologiniai / cheminiai procesai gali keisti pH; tikrinti aeraciją, rezervuarą ir zondo kompensaciją. | C | E08, E09 |
| I020 | P10 `HIGH` + P12 `HIGH` | Tiekiamas ir šaknų zonos tirpalas koncentruoti: didelė salinumo rizika. | B | E10, E11 |
| I021 | P10 `OPTIMAL` + P12 `HIGH` | Druskos kaupiasi šaknų zonoje arba nepakanka drenažo / išplovimo. | B | E09, E12 |
| I022 | P10 `LOW` + P12 `HIGH` | Neduoti daugiau trąšų aklai: tikėtinas ankstesnių druskų kaupimasis arba mažas P08. | C | E09, E12 |
| I023 | P12 `RISING` + P08 `FALLING` | Pore tirpalas koncentruojasi substratui džiūstant; dalis EC kilimo gali būti fizikinė, ne naujos druskos. | A | E12 |
| I024 | P12 `FALLING` + P08 `RISING` | Tikėtinas praskiedimas po laistymo; sprendimą priimti tik nusistovėjus matavimui. | A | E12 |
| I025 | P08 `HIGH` + P12 `LOW` | Galimas perlaistymas, maisto medžiagų praskiedimas ar išplovimas. | C | E09, E12 |
| I026 | P08 `LOW` + P12 `HIGH` | Sausas substratas ir koncentruotas pore tirpalas sukuria bendrą vandens bei osmosinį stresą. | B | E11, E12 |
| I027 | P11 `HIGH` + P10 `OPTIMAL/HIGH` | Maisto koncentracijos gali pakakti, bet pH riboja elementų prieinamumą; EC padidinimas problemos neišspręs. | B | E09, E10 |
| I028 | P11 `LOW` + P10 `HIGH` | Galima per didelė rūgšties / druskų apkrova ir elementų toksiškumo rizika. | B | E09, E10 |
| I029 | P11 `DRIFTING` + P10 `FALLING` | Galimas aktyvus selektyvus jonų paėmimas arba tirpalo išsekimas; EC neparodo, kuris elementas keičiasi. | B | E09 |
| I030 | P11 `DRIFTING` + P10 stabilus | Tikrinti šarmingumą, N formų balansą, biologinį aktyvumą ir pH zondo kalibraciją. | C | E09 |
| I031 | P05 `HIGH` + P04 `LOW` | Šviesa yra, bet fotosintezę gali riboti CO2; tai aukšto prioriteto CO2 tiekimo patikra. | B | E05 |
| I032 | P05 `LOW/DARK` + P04 `HIGH` | Maža fotosintetinė nauda ir tikėtinas CO2 švaistymas; tamsoje dozavimą stabdyti saugos valdikliu. | B | E05 |
| I033 | P05 `HIGH` + P04 `HIGH` | Potencialiai didelė asimiliacija, tačiau didėja vandens ir maisto medžiagų paklausa; tikrinti P03 ir P08. | B | E05 |
| I034 | P03 `HIGH` + P04 `HIGH` | CO2 gali tik iš dalies kompensuoti stomatų ribojimą; pirmiausia valdyti vandens balansą ir VPD. | B | E04 |
| I035 | P03 profilyje + P04 `HIGH` | Jei P05 pakanka, sąlygos palankesnės CO2 panaudojimui nei esant ekstremaliam VPD. | B | E04 |
| I036 | P05 `HIGH` + P03 `HIGH` | Kartu didėja lapo energijos ir vandens apkrova; perspėjimą kelti anksčiau nei nuo vienos metrikos. | B | E01, E05 |
| I037 | P05 `LOW` + P03 `LOW` | Mažas momentinis vandens poreikis; laistymo planas turi mažinti impulsus, bet išlaikyti saugų dryback. | B | E01 |
| I038 | P05 `HIGH` + P03 `LOW` | Greitas augimas esant mažai transpiracijai gali didinti kalcio transporto sutrikimų riziką jautriose kultūrose. | B | E13 |
| I039 | P05 dienos DLI `LOW` + P10 `HIGH` | Maža augimo / paėmimo paklausa ir stiprus tirpalas gali skatinti druskų kaupimąsi. | C | E06, E09 |
| I040 | P05 dienos DLI `HIGH` + P10 `LOW` | Didelė augimo paklausa ir silpnas tirpalas gali spartinti maisto medžiagų išsekimą. | C | E06, E09 |
| I041 | P13 daug šaltesnė už P09 | Šaltas laistymo impulsas gali sukelti trumpalaikį šaknų temperatūros šoką; šildyti palaipsniui. | C | E07, E08 |
| I042 | P13 daug šiltesnė už P09 | Šiltas impulsas gali didinti šaknų zonos temperatūrą ir O2 poreikį; tikrinti rezervuaro kontrolę. | C | E07, E08 |
| I043 | P13 `LOW` + P09 `LOW` | Visa šaknų sistema šalta; tikėtinas lėtas vandens ir jonų paėmimas. | B | E07 |
| I044 | P13 `HIGH` + P09 `HIGH` | Visa šaknų sistema šilta; didėja deguonies deficito ir šaknų pažeidimo rizika. | B | E07, E08 |
| I045 | P02 `HIGH` + P07 saugi | Vien aukštas RH dar neįrodo kondensacijos; perspėjimo lygį mažinti, jei lapas aiškiai virš rasos taško. | A | E02 |
| I046 | P02 neaukšta + P07 arti 0 | Kondensacija vis tiek galima ant šalto lapo; RH slenkstis vienas pats yra nesaugus. | A | E02 |
| I047 | P04 `FALLING` + P05 `RISING` | Gali rodyti prasidėjusią aktyvią fotosintezę arba nepakankamą CO2 tiekimą; vertinti kritimo greitį. | B | E05 |
| I048 | P04 `RISING` + P05 `DARK` | Tikėtinas augalų / substrato kvėpavimas arba paliktas dozavimas; patikrinti naktinę ventiliaciją. | B | E05 |
| I049 | P08 kinta, bet P12 ir P09 šoka tuo pačiu momentu | Galimas bendras jutiklio temperatūros / dielektrinis artefaktas; sprendimą atidėti iki stabilizacijos. | A | E12 |
| I050 | P10 kinta kartu su P13, bet dozavimo nebuvo | Patikrinti, ar EC normalizuotas į 25 °C; neinterpretuoti temperatūrinio pokyčio kaip trąšų pokyčio. | A | E15 |

## 7. Trijų ir daugiau parametrų sąveikos

| ID | Parametrai ir sąlyga | Agronominė diagnozė / rekomendacija | Lygis | Įrodymai |
|---|---|---|---|---|
| M001 | P05 `HIGH` + P04 `LOW` + P01/P03 profilyje | Anglies tiekimas tikėtinai yra pagrindinis momentinis fotosintezės ribotuvas. Tikrinti CO2 tiekimą ir ventiliacijos nuostolius. | B | E04, E05 |
| M002 | P05 `HIGH` + P04 `HIGH` + P03 `HIGH` + P08 `LOW` | Didelis fotosintezės potencialas negali kompensuoti bendro atmosferos ir šaknų vandens streso. Prioritetas vandens balansui, ne papildomam CO2. | B | E03, E04 |
| M003 | P05/P04 aukšti + P01/P03/P08/P10/P11 profilyje | Aukšto produktyvumo langas; perspėjimo nereikia, bet prognozuoti spartesnį vandens ir maisto medžiagų sunaudojimą. | B | E04, E05, E09 |
| M004 | `DARK` + P04 `HIGH/RISING` + P02 `RISING` | Tikėtinas kvėpavimas ir uždara erdvė arba paliktas dozavimas. Patikrinti dozavimo grafiką ir naktinę oro apykaitą. | B | E05 |
| M005 | Aušra: P05 `RISING` + P03 `RISING` + P08 `FALLING` | Vandens paklausa pradeda viršyti pasiūlą. Rekomenduoti patikrinti pirmo laistymo laiką pagal dryback, ne vien laikrodį. | B | E01, E03 |
| M006 | Saulėlydis: P01 `FALLING` + P02 `RISING` + P07 `FALLING` | Aukšta artėjančios kondensacijos rizika. Ankstyvas švelnus sausinimas / oro maišymas geriau nei reakcija po kondensacijos. | A | E02, E14 |
| M007 | Naktis + P03 `LOW` + P08 `HIGH` + P13/P09 `HIGH` | Maža transpiracija, šlapia ir šilta šaknų zona: tikrinti perlaistymą, aeraciją ir šaknų ligų riziką. | B | E08 |
| M008 | P05 `HIGH` + P01 `HIGH` + P03 `LOW` + spartus augimas | Kalcio pernaša į jaunus audinius gali neatsilikti nuo augimo; jautrioms lapinėms kultūroms tipburn rizika. | B | E13 |
| M009 | P05 `HIGH` + P01/P06 `HIGH` + P03 `HIGH` + P08 `LOW` | Kombinuotas šviesos, karščio ir vandens stresas; aukščiausias agronominis prioritetas. | B | E01, E03, E05 |
| M010 | P06 `HIGH` + P08 `HIGH` + P12 neaukštas | Karštas lapas, nors vandens yra: nepatarti aklai laistyti; tikrinti šaknų deguonį, ligas, srautą ir oro judėjimą. | C | E03, E08 |
| M011 | P06 `HIGH` + P08 `LOW` + P12 `HIGH` | Lapas perkaista dėl bendro hidraulinio ir osmosinio streso. Reikia kontroliuoto rehidratavimo ir šaknų EC patikros. | B | E03, E11 |
| M012 | P06 `LOW` + P03 `HIGH` + P08 `FALLING` | Transpiracinis vėsinimas aktyvus, tačiau dryback spartėja; perspėti apie artėjantį vandens deficitą, ne apie esamą lapo perkaitimą. | B | E03 |
| M013 | P10 profilyje + P12 `RISING` per kelis ciklus + P08 dryback didelis | Druskos koncentruojasi / kaupiasi šaknų zonoje. Peržiūrėti drenažo frakciją, impulsų dydį ir išplovimo strategiją. | B | E09, E12 |
| M014 | P10 `HIGH` + P12 dar `LOW` + P08 ką tik `RISING` | Tikėtinas šviežias fertirigacijos impulsas; palaukti susimaišymo ir šaknų zonos atsako prieš perspėjant apie salinumą. | C | E09, E12 |
| M015 | P11 `HIGH` + P12 `HIGH` + P08 `LOW` | Vienu metu pH prieinamumo, druskų ir vandens stresas. Reikia tirpalo / drenažo mėginio ir zondų patikros. | B | E09, E10, E12 |
| M016 | P11 profilyje + P10 `HIGH` + P12 `HIGH` | pH tinkamas, bet osmosinė apkrova didelė; pH korekcija nepadės. Vertinti koncentraciją ir drenažą. | B | E10, E11 |
| M017 | P13 `HIGH` + P09 `HIGH` + P08 `HIGH` + P11 `DRIFTING` | Šilta, šlapia ir chemiškai nestabili šaknų zona: tikrinti DO, biofilmą, recirkuliaciją, patogenus ir zondus. | C | E08, E09 |
| M018 | P13 `LOW` + P10 `HIGH` + P11 `HIGH` | Šaltas koncentruotas tirpalas ir aukštas pH gali slopinti paėmimą bei skatinti dalies junginių nusėdimą. | B | E08, E10 |
| M019 | P04 greitai `FALLING` + P05 `HIGH` + P01/P03 profilyje | Tikėtina aktyvi fotosintezė; jei CO2 krenta žemiau profilio, didinti tiekimą tik įvertinus ventiliaciją. | B | E05 |
| M020 | P04 `HIGH` + P05 `DARK` + P02/P07 blogėja | CO2 dozavimas neturi agronominės naudos, o uždara drėgna aplinka didina kondensacijos riziką. | B | E02, E05 |
| M021 | P05 `HIGH` + P03 profilyje + P06 gerokai virš P01 | VPD tinkamas, bet lapas neatsivėsina: tikrinti oro judėjimą / storą ribinį sluoksnį ir lajos tankį. | C | E03, E13 |
| M022 | P03 `HIGH` + P08 `HIGH` + P06 `HIGH` + P13/P09 `HIGH` | Atmosferos paklausa didelė, bet šaknys gali būti fiziologiškai ribojamos šilumos ar deguonies. Prioritetas šaknų funkcijai. | C | E03, E08 |
| M023 | P03 `HIGH` + P08 `LOW` + P12 `HIGH` + P10 profilyje | Ne tiekiamo tirpalo receptas, o per didelis dryback kelia šaknų EC ir vandens stresą. Koreguoti drėkinimo ritmą. | B | E11, E12 |
| M024 | P03 `LOW` + P08 `HIGH` + P12 `LOW` + P05 `LOW` | Maža paklausa ir per didelis vandens tiekimas skiedžia šaknų zoną. Mažinti impulsus, stebėti dryback ir deguonį. | C | E01, E09 |
| M025 | P05 `HIGH` + P03 `LOW` + P04 `HIGH` + P10/P11 profilyje | Labai spartaus augimo langas, bet kalcio pernaša gali būti ribota dėl mažos transpiracijos; kultūrai jautriai tipburn stebėti jaunus audinius. | B | E13 |
| M026 | P05 `HIGH` + P03 `HIGH` + P04 `LOW` + P08 `LOW` | Vienu metu riboja CO2 ir vanduo; CO2 didinimas nėra pirmas veiksmas, kol neatkurtas vandens balansas. | B | E03, E04 |
| M027 | P01 `HIGH` + P06 dar aukštesnė + P07 saugi + P08 profilyje | Kondensacijos nėra, bet yra šiluminė lajos apkrova; vėsinimo / šešėliavimo patikra svarbiau už sausinimą. | C | E03, E05 |
| M028 | P01 `LOW` + P06 dar žemesnė + P07 arti 0 + P02 `HIGH` | Lokali šalto paviršiaus kondensacija tikėtina net jei vidutinė patalpos temperatūra priimtina. Ieškoti šalto oro srauto. | A | E02 |
| M029 | P10 `LOW` + P12 `LOW` + P11 profilyje + P05/DLI `HIGH` | Tikėtinas bendras maisto medžiagų trūkumas dėl didelės paklausos, bet prieš dozavimą patikrinti tirpalo sudėtį. | C | E06, E09 |
| M030 | P10 `HIGH` + P12 `HIGH` + P11 ne profilyje + P05/DLI `LOW` | Didelė koncentracija, blogas prieinamumas ir maža augimo paklausa: aukšta maitinimo strategijos korekcijos svarba. | B | E09, E10 |
| M031 | P13 `HIGH` + P10 `HIGH` + P11 profilyje + P09 `HIGH` | Net tinkamas pH nepašalina šilumos, mažesnio DO ir osmosinės apkrovos. Vertinti aeraciją ir koncentraciją. | B | E08, E11 |
| M032 | P13 profilyje + P10/P11 profilyje + P12 `HIGH` + P08 `LOW` | Tiekimo sistema gera, problema lokalizuota substrate: dryback, nepakankamas drenažas arba nevienodas laistymas. | B | E09, E12 |

## 8. Laiko, trendo ir patikimumo taisyklės

| ID | Taisyklė | Paskirtis | Lygis | Įrodymai |
|---|---|---|---|---|
| T001 | Agronominį perspėjimą kurti tik po `PERSISTENT`, išskyrus ekstremalią kritinę ribą ar P07 `<= 0`. | Apsauga nuo vieno triukšmingo matavimo. | A | E02, E15 |
| T002 | Perspėjimą uždaryti tik grįžus į profilio vidų su histereze ir bent trimis matavimais. | Apsauga nuo būsenos mirgėjimo. | A | E02 |
| T003 | P01/P02/P03 vertinti ne tik reikšmę, bet ir pokyčio greitį per 10–30 min. | Staigus VPD šuolis gali būti žalingesnis nei toks pats stabilus vidurkis. | B | E16 |
| T004 | Skaičiuoti VPD svyravimo amplitudę ir ciklų dažnį. | Vienodas vidutinis VPD gali slėpti dažnus stomatų režimo pokyčius. | B | E16 |
| T005 | P05 perspėjimą augimui grįsti DLI, fotoperiodu ir PPFD pasiskirstymu, ne momentiniu `lux`. | Teisingas dienos šviesos dozės vertinimas. | A | E05, E06 |
| T006 | Po šviesos įjungimo CO2 taisyklėms taikyti adaptacijos / tiekimo uždelsimą. | Atskiria normalų rytinį CO2 kritimą nuo tiekimo gedimo. | B | E05 |
| T007 | P08 vertinti kaip dienos dryback: startas, minimumas, amplitudė, naktinis atsistatymas. | Laistymo strategijai svarbesnė kreivė nei vienas procentas. | B | E01, E12 |
| T008 | Po laistymo impulso tikėtis P08 kilimo; jei nekilo per sistemos atsako langą, tikrinti tiekimą arba jutiklio vietą. | Aptinka užsikimšimą, tuščią liniją ar nepasiekiamą šaknų zoną. | C | E12 |
| T009 | P12 vertinti tik po nustatyto susimaišymo laiko po laistymo. | Apsauga nuo trumpalaikio praskiedimo / koncentracijos artefakto. | A | E12 |
| T010 | P10 ir P11 vertinti po dozavimo maišymo uždelsimo ir su temperatūros kompensacija. | Apsauga nuo klaidingų automatinių korekcijų. | A | E15 |
| T011 | Kaupti P07 `<= warning` minučių sumą per naktį ir pasikartojančių naktų skaičių. | Ligos riziką labiau lemia drėgnumo trukmė nei vien momentas. | B | E14 |
| T012 | P03 perskaičiuoti serveryje iš P01/P02 ir lyginti su node pateiktu VPD. | Aptinka dekoderio, vienetų ar firmware skaičiavimo klaidą. | A | E02 |
| T013 | P07 skaičiuoti pagal P06, o jei P06 nėra – rodyti mažesnio pasitikėjimo oro rasos taško atsargą. | Kondensuojasi paviršius, ne abstraktus oras. | A | E02 |
| T014 | P06 reakciją po laistymo / VPD korekcijos tikrinti per 10–60 min., ne po kelių sekundžių. | Fiziologinio atsako patvirtinimas. | B | E03 |
| T015 | P09 ir P13 taisyklėms taikyti lėtesnį 20–120 min. atsako langą. | Šaknų zonos šiluminė inercija didesnė nei oro. | B | E07, E08 |
| T016 | P10/P11/P12 zondams registruoti kalibracijos datą, nuokrypį ir neįtikėtinai lėtą driftą. | Ilgalaikis zondo driftas neturi tapti agronomine išvada. | A | E15 |
| T017 | Jei tas pats pokytis vienu metu matomas visose Sections, pirmiau tikrinti bendrą HVAC / fertirigacijos sistemą. | Atskiriama sisteminė ir lokali priežastis. | C | E02 |
| T018 | Jei nukrypsta viena Section, o gretimos lieka stabilios, pirmiau tikrinti lokalią įrangą, laistymą ir jutiklį. | Mažina nereikalingą viso šiltnamio korekciją. | C | E02 |
| T019 | Dienai ir nakčiai, augimo fazėms bei kultūroms naudoti atskiras ribas. | Viena universali riba biologiškai neteisinga. | A | E02, E06 |
| T020 | Jei trūksta būtino sąveikos parametro, nerodyti užtikrintos diagnozės; rodyti „galima priežastis“ ir kokį matavimą surinkti. | Neleidžia taisyklei apsimesti žinančia priežastį. | A | E02 |
| T021 | Atmesti neįmanomus P01/P02/P03/P07 derinius pagal fizikines formules. | Aptinka vienetų, laiko žymų ar sensorių poravimo klaidas. | A | E02 |
| T022 | Naudoti vienodo laiko lango medianas ir neporuoti skirtingų laikų P01, P02 bei P06. | Išvestiniai dydžiai turi būti skaičiuojami iš sinchroniškų matavimų. | A | E02 |
| T023 | P08/P12 taisykles patvirtinti bent dviem reprezentatyviomis šaknų zonos vietomis arba rodyti mažą erdvinį pasitikėjimą. | Substratas ir laistymas erdviškai nevienodi. | B | E12 |
| T024 | Naujam profiliui pradėti nuo stebėjimo režimo ir 2–4 savaites kaupti bazinę variaciją prieš automatinį veiksmų siūlymą. | Vietinė kalibracija prieš aktyvų Rule Engine. | C | E02 |
| T025 | Kiekvienai rekomendacijai saugoti prieš / po reikšmes, atliktą veiksmą ir rezultatą. | Leidžia empiriškai kalibruoti taisyklių tikslumą ir ekonominę vertę. | A | E02 |
| T026 | Vienos sėkmingos intervencijos nelaikyti priežastiniu įrodymu; reikalauti pakartojimų arba kontrolinės Section. | Apsauga nuo klaidingo priežastingumo ir sezoniškumo. | A | E02 |

Iš viso šiame kataloge: **134 taisyklės** (26 vieno parametro, 50 porinių,
32 daugiaparametrės ir 26 laiko / kokybės taisyklės).

## 9. Prioriteto nustatymo principas

Taisyklės prioritetas neturėtų būti vien visų nukrypimų suma:

1. Pirmiausia vertinti tiesioginę žalos riziką: kondensacija, ekstremali
   temperatūra, bendras vandens ir osmosinis stresas.
2. Tada vertinti ribojantį veiksnį: kuris domenas labiausiai riboja augimą.
3. Koreliuotas metrikas grupuoti, kad P01, P02 ir P03 nesukurtų trijų atskirų
   perspėjimų dėl tos pačios klimato būklės.
4. Vienu metu rodyti vieną pagrindinę rekomendaciją ir iki dviejų patikrinimų.
5. Jei diagnozė `C` lygio, rekomenduoti patikrą, o ne kategorišką valdymo veiksmą.

Siūlomi domenai:

| Domenas | Parametrai |
|---|---|
| Klimatas ir vandens paklausa | P01, P02, P03, P06, P07 |
| Anglis ir šviesa | P04, P05 |
| Šaknų vanduo ir temperatūra | P08, P09, P13 |
| Mityba ir salinumas | P10, P11, P12 |

## 10. Būtini produkto patobulinimai prieš pilną įgyvendinimą

1. `lux` pakeisti arba papildyti PAR/PPFD jutikliu ir serveryje skaičiuoti DLI.
2. Į backend įtraukti `dewPoint`, `dewPointMargin` ir, kai yra P06, `leafVPD`.
3. Crop profile papildyti dienos / nakties bei augimo fazės ribomis.
4. Kiekvienai taisyklei saugoti `evidenceLevel`, `requiredMetrics`,
   `persistence`, `cooldown`, `verificationWindow` ir versiją.
5. Įdėti jutiklių kalibracijos, temperatūros kompensacijos ir erdvinio
   pasitikėjimo metaduomenis.
6. Vėlesniame hardware etape pridėti oro greitį, lapo drėgnumą ir ištirpusį
   deguonį. Be jų dalis kondensacijos, tipburn ir šaknų hipoksijos diagnozių
   lieka `C` lygio.

## 11. Mokslinių įrodymų šaltiniai

### E01 – evapotranspiracija kaip kelių veiksnių sistema

FAO-56 Penman–Monteith metodas: radiacija, oro temperatūra, drėgmė / garų
slėgis ir oro judėjimas kartu lemia evapotranspiracinę paklausą.

https://www.fao.org/4/X0490E/x0490e08.htm

### E02 – šiltnamio aplinkos matavimo metodika

Rekomenduojama drėgmę vertinti per VPD, o kondensaciją – pagal paviršiaus
temperatūrą ir rasos tašką; taip pat pabrėžiamas jutiklių išdėstymas,
kalibracija ir sinchroniškas aplinkos parametrų registravimas.

https://pmc.ncbi.nlm.nih.gov/articles/PMC4567830/

### E03 – VPD, vandens transportas ir pomidorų produktyvumas

Kontroliuojamas šiltnamio bandymas parodė VPD poveikį vandens būklei,
stomatoms, fotosintezei, biomasės formavimui ir produktyvumui.

https://pmc.ncbi.nlm.nih.gov/articles/PMC5339896/

### E04 – VPD ir CO2 sąveika

Pomidorų bandyme VPD ir CO2 veikė vandens sunaudojimą, stomatų funkciją,
fotosintezę ir derlių kartu, todėl CO2 negali būti vertinamas izoliuotai.

https://pmc.ncbi.nlm.nih.gov/articles/PMC6581957/

### E05 – PPFD ir CO2 sąveika

Kontroliuojamas pomidorų bandymas parodė, kad CO2 nauda priklauso nuo PPFD,
o padidėjęs PPFD taip pat keičia lapo temperatūrą ir transpiraciją.

https://pmc.ncbi.nlm.nih.gov/articles/PMC8705473/

### E06 – DLI, PPFD ir fotoperiodas

Salotų bandymas parodė, kad vienodas DLI, paskirstytas skirtingu PPFD ir
fotoperiodu, sukelia skirtingą momentinį fotosistemos atsaką; todėl momentinis
šviesos rodmuo nepakeičia DLI ir fotoperiodo.

https://pmc.ncbi.nlm.nih.gov/articles/PMC7570151/

### E07 – šaknų zonos temperatūra

Kontroliuojamas hidroponinių salotų bandymas su 15, 25 ir 35 °C šaknų zonos
temperatūromis parodė reikšmingus šaknų, antžeminės biomasės ir pigmentų
skirtumus.

https://pmc.ncbi.nlm.nih.gov/articles/PMC10667003/

### E08 – tirpalo temperatūra, vandens chemija ir deguonis

Šiltnamio matavimo metodika nurodo, kad vandens temperatūra veikia augimą ir
ištirpusių dujų, įskaitant O2, kiekį. Hidroponikos tyrimai rodo, kad šaknų
aplinkos deguonis ir temperatūra turi būti vertinami kartu.

https://pmc.ncbi.nlm.nih.gov/articles/PMC4567830/
https://pmc.ncbi.nlm.nih.gov/articles/PMC12687340/

### E09 – EC, pH ir maisto medžiagų dinamika

Recirkuliacinės hidroponikos tyrimai rodo, kad vien EC nepateikia atskirų
elementų sudėties, o pH, EC, temperatūra ir augalo fazė kartu veikia jonų
dinamiką bei paėmimą.

https://pmc.ncbi.nlm.nih.gov/articles/PMC11214494/
https://pmc.ncbi.nlm.nih.gov/articles/PMC5423622/

### E10 – pH ir elementų prieinamumas

Kontroliuojamas hidroponinis bandymas parodė, kad pH pakeitė makro- ir
mikroelementų koncentracijas šaknyse bei lapuose net esant tiekiamoms maisto
medžiagoms.

https://pmc.ncbi.nlm.nih.gov/articles/PMC7465443/

### E11 – VPD ir salinumo sąveika

Pomidorų ir agurkų hidroponinis bandymas parodė nuo genotipo priklausomą VPD ir
šaknų zonos salinumo sąveiką vandens sunaudojimui, maisto medžiagų paėmimui ir
biomasei.

https://pmc.ncbi.nlm.nih.gov/articles/PMC12142428/

### E12 – substrato drėgmės, EC ir temperatūros matavimo sąveika

Jutiklių kalibravimo tyrimai parodė, kad substrato EC ir temperatūra gali
keisti dielektrinių drėgmės zondų rodmenis, o in-situ EC priklauso nuo
drėgmės ir temperatūros.

https://doi.org/10.1016/j.scienta.2006.12.013
https://doi.org/10.21273/HORTSCI.41.1.210

### E13 – VPD, šviesa, oro judėjimas ir kalcio sutrikimai

Kontroliuojamos aplinkos salotų tyrimai sieja tipburn su kalcio pernaša,
transpiracija, šviesa, temperatūra, RH / VPD ir oro judėjimu.

https://pmc.ncbi.nlm.nih.gov/articles/PMC12699602/

### E14 – temperatūra, lapo drėgnumo trukmė ir ligos

Šiltnamio agurkų bandymuose ligos pradžios prognozei naudota temperatūros suma
ir lapo drėgnumo trukmė; vien momentinis RH nėra pakankamas ligos signalas.

https://pmc.ncbi.nlm.nih.gov/articles/PMC12146626/

### E15 – EC ir pH matavimo temperatūrinė kompensacija

EC paprastai normalizuojamas į 25 °C, o pH matavime būtina skirti elektrodo
temperatūros kompensaciją nuo paties tirpalo pH pokyčio dėl temperatūros.

https://www.ars.usda.gov/pacific-west-area/riverside-ca/agricultural-water-efficiency-and-salinity-research-unit/docs/about/frequently-asked-questions-about-salinity/page-7/
https://www.emerson.com/is/content/emerson/en/measurement-instrumentation/technical/products/liquid-analysis/documents/manual-theory-and-practice-of-ph-measurement.pdf

### E16 – VPD svyravimų poveikis

Kontroliuojamas salotų bandymas parodė, kad dideli ir dažni VPD svyravimai gali
mažinti stomatų laidumą, fotosintezę ir augimą net esant panašiam vidutiniam VPD.

https://pmc.ncbi.nlm.nih.gov/articles/PMC8049605/
