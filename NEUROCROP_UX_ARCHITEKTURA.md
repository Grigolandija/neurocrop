# NeuroCrop UX architektūra

Atnaujinta: 2026-07-21

## Produkto pažadas

NeuroCrop nėra sensorių dashboard. Tai kasdienio sprendimo sistema, kuri turi padėti augintojui greitai atsakyti:

1. Kur dabar reikia dėmesio?
2. Kodėl tai svarbu?
3. Ką konkrečiai daryti?
4. Ar veiksmas davė rezultatą?
5. Ar duomenimis galima pasitikėti?

Pagrindinis kelias:

`ūkio būklė -> prioritetas -> veiksmas -> patikrinimas -> rezultatas`

## Pagrindiniai vartotojai

### Augintojas / operatorius

- Ryte peržiūri visą ūkį.
- Palygina sekcijas ir pastebi išimtis.
- Atlieka arba atideda siūlomą veiksmą.
- Patikrina, ar sąlygos pagerėjo.

### Ūkio vadovas

- Vertina rizikų trukmę ir darbų atlikimą.
- Lygina Areas ir Sections.
- Tikrina sistemos sukurtą ekonominę naudą.

### Techninis administratorius

- Registruoja ir prižiūri node.
- Tvarko Areas, Sections, crop profiles ir vartotojus.
- Sprendžia duomenų bei hardware patikimumo problemas.

Techniniai darbai neturi dominuoti augintojo kasdienėje navigacijoje.

## Ekranų atsakomybės

### Today

Vienas viso ūkio pradinis ekranas. Rodo Areas ir Sections būklę, svarbiausią viso ūkio prioritetą, iki trijų veiksmų, pasirinktos sekcijos kontekstą ir duomenų patikimumą.

Priėmimo kriterijus: per 10 sekundžių vartotojas supranta, kur eiti ir ką tikrinti pirmiausia.

### Compare sections

Vienoje vietoje lygina vienos Area sekcijų matavimus. Numatytasis vaizdas rodo ne daugiau kaip šešis svarbiausius parametrus. Kiti parametrai pasiekiami per grupes arba `All parameters`.

Priėmimo kriterijus: vartotojas be horizontalaus slinkimo pamato svarbiausius skirtumus įprastame ekrane.

### Trends

Padeda atskirti momentinį šuolį nuo ilgalaikės problemos ir patikrinti veiksmo rezultatą. Grafikai rodomi su tikslinėmis juostomis ir veiksmų žymomis.

### Areas / Sections

Struktūros ir auginimo konteksto konfigūravimas. Tai nėra kasdienės būklės stebėjimo ekranai.

### Sensor nodes

Techninė registracija, ryšys, baterija, sensoriai ir diagnostika. Agronominės problemos čia neklasifikuojamos kaip hardware gedimai.

### Alerts / Actions

Rodomi tik tada, kai backend palaiko patikimą gyvavimo ciklą: atidarytas, patvirtintas, paskirtas, atidėtas, išspręstas ir automatiškai atsistatęs. Neveikiantis arba tik lokaliai saugomas modulis pagrindinėje navigacijoje nerodomas.

## Informacijos hierarchija

1. Sprendimas arba rizika.
2. Vieta ir skubumas.
3. Dabartinė reikšmė bei tikslas.
4. Rekomenduojamas veiksmas.
5. Duomenų patikimumas.
6. Techninės detalės pagal poreikį.

Spalva padeda skenuoti, bet svarbus veiksmas ir jo vieta visada pateikiami tekstu. Santrumpos naudojamos tik ten, kur jos įprastos profesionaliam augintojui, ir turi paaiškinimą.

## Įgyvendinimo etapai

### 1 etapas - kasdienio darbo pagrindas

- [x] Atskirti kasdienę ir konfigūravimo navigaciją.
- [x] Overview pervadinti į Today.
- [x] Viso ūkio prioritetą atskirti nuo pasirinktos sekcijos score.
- [x] Compare sections numatytai rodyti svarbiausius parametrus.
- [x] Paslėpti neveikiantį Alerts maršrutą ir pašalinti neveikiančius veiksmus.

### 2 etapas - veiksmų centras

- [ ] Backend alert gyvavimo ciklas ir paskyrimas darbuotojui.
- [ ] Viena sujungta Actions / Alerts eilė pagal skubumą ir poveikį.
- [ ] Mobilus veiksmo atlikimo režimas.
- [ ] Veiksmo rezultatas su matavimais prieš ir po.

### 3 etapas - įrodoma vertė

- [ ] Savaitinė vadovo suvestinė.
- [ ] Rizikos laikas, sutaupyta energija, vanduo, CO2 ir darbo laikas.
- [ ] Naudingų, klaidingų ir neaiškių rekomendacijų grįžtamasis ryšys.
- [ ] Kliento rolėms pritaikyti numatytieji vaizdai.

## Ko vengti

- Nerodyti neveikiančių mygtukų ar maršrutų.
- Nemaišyti viso ūkio prioriteto su pasirinktos sekcijos score.
- Nerodyti visų galimų parametrų vien todėl, kad jie egzistuoja duomenų modelyje.
- Nedubliuoti tos pačios būsenos tekstu, spalva ir keliomis kortelėmis.
- Neperkelti backend ar hardware terminų į pagrindinį augintojo darbo kelią.
