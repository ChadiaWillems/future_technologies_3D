# Fase 3: slim met spraak en simulatie

## Opdracht

**A. Spraak**: Web Speech API (`SpeechRecognition`) of een andere dienst; minstens 3 commando's; toon wat verstaan werd en wat het gevolg was; voorzie knoppen als terugval.

**B. Simulatie met zichtbaar effect**: bereken minstens één grootheid over tijd en toon die in de scène, met een live waarde, een eenvoudige grafiek, een visuele aanwijzing in de scène en minstens één regelbare parameter.

Gekozen grootheid: **het regenwater in de ton** (geen zon of wind: dit is een regenproject).

## B. Simulatie: regenwater

### Model

Zie [`src/rainModel.ts`](../src/rainModel.ts). Per tijdstap van `dt` uur:

```
aanvoer   = neerslag × dakoppervlak × afvoercoëfficiënt × dt
beschikbaar = niveau + aanvoer
verbruik  = min(beschikbaar, verbruik_per_uur × dt)
totaal    = beschikbaar − verbruik
niveau    = min(totaal, tonvolume)
overloop  = max(0, totaal − tonvolume)
```

| Grootheid | Waarde | Waar komt het vandaan |
| --- | --- | --- |
| Neerslag | uit Open-Meteo (mm/u); handmatig 4 mm/u | echte data of een vaste waarde |
| Dakoppervlak | 28,1 m² | het dak van boven gezien: vierkant van 5,3 m |
| Afvoercoëfficiënt | 0,8 | schatting: een deel verdampt of spat weg |
| Tonvolume | 100 tot 600 L, standaard 300 L | slider |
| Verbruik huishouden | 0 tot 60 L/u | slider |
| 1 mm op 1 m² | 1 L | definitie |

Voorbeeld: 6 mm/u × 28,1 m² × 0,8 ≈ 135 L per uur. Dat zag ik ook in de scène (Singapore, 6 mm/u).

Daarnaast zijn er handmatige afnames, met vaste (speelse) snelheden:

| Actie | Snelheid |
| --- | --- |
| Tuinkraan | 15 L/s (1 L water geeft de tuin +1% gezondheid) |
| Gootsteenkraan | 6 L/s |
| Toilet spoelen | 9 L per keer |
| Afvoerventiel | 40 L/s (het water gaat naar de grond en telt niet als verbruik) |

De gezondheid van de tuin stijgt met regen (`0,012 × min(neerslag, 5)` per seconde met echte data, 0,02 per seconde handmatig) en daalt met 0,004 per seconde.

### Tijd

Met echte data speelt de tijd als time-lapse (standaard 1 uur = 6 seconden). Handmatige regen speelt ook zo: 6 seconden per uur. Met echte data geldt: als de tijd pauzeert, stroomt er geen regenwater bij en gebruikt het huishouden niets (de kranen en het ventiel werken wel gewoon).

### Zichtbaar maken

| Wat | Waar |
| --- | --- |
| **Live waarde** | Onderdeel "Regenton" van het widget: liters en procent, wat het dak levert (L/u), verbruikt, overgelopen, gezondheid van de tuin |
| **Grafiek** | Onderdeel "Waterstand en regen" van het widget: waterstand als lijn en vlak, regen als staafjes, marker met het huidige niveau, rode stip als de ton vol was. Beweeg erover voor de waarden; met echte data spring je door erop te klikken. Handmatig toont hij de laatste 12 gesimuleerde uren |
| **In de scène** | Waterniveau in de ton, overloop en plas, **niveaulamp** (groen / oranje / rood / blauw bij overloop), waterstraal bij tuinkraan en afvoerventiel, pompindicator |
| **Regelbaar** | Sliders **Tonvolume** (de ton wordt echt groter of kleiner) en **Verbruik huishouden**, plus de tijdsschuif en de plaats |

### Vereenvoudigingen

- De **afvoercoëfficiënt is constant** (0,8). In het echt hangt die af van het dakmateriaal, de intensiteit van de bui en de eerste liters die het dak schoonspoelen ("first flush").
- Het dakoppervlak is de projectie van boven en de regen valt overal even hard (geen wind, geen schuine regen).
- Open-Meteo geeft **uurwaarden**; daartussen wordt lineair geïnterpoleerd. Korte buien verdwijnen daardoor.
- Geen verdamping uit de ton en geen lekken.
- De druppels in de scène zijn visueel: het water wordt door het model geteld, niet door de druppels.
- De ton is een afgeknotte kegel, maar het niveau wordt als gewoon aandeel van het volume getekend.

## A. Spraak

### Techniek

De Web Speech API in het Nederlands (`nl-BE`), in [`src/commands.ts`](../src/commands.ts). Een zin wordt eerst genormaliseerd (kleine letters, zonder accenten of leestekens) en daarna op trefwoorden herkend, zodat "Kan je de ton leegmaken?" en "leeg de ton" hetzelfde doen. Getallen worden als cijfers of als Nederlandse woorden herkend ("15 uur" of "vijftien uur", "100" of "honderd", "honderdvijftig").

### Commando's

| Zeg bijvoorbeeld | Gevolg |
| --- | --- |
| "zet de regen aan" / "uit" | Regen aan of uit (schakelt naar handmatige modus) |
| "hoeveel water zit er in de ton" | Antwoord met liters, procent en overloop (ook hardop) |
| "hoeveel regen valt er" | Antwoord met de neerslag nu en wat het dak levert |
| "leeg de ton" | Opent het afvoerventiel |
| "open de kraan" / "sluit de kraan" | Tuinkraan aan of uit |
| "zet de tijd op 15 uur" | Springt naar 15:00 (met echte data) |
| "zet de ton volume op 100", "tonvolume 450", "zet de ton op vijfhonderd liter" | Zet het tonvolume (100 tot 600 L, in stappen van 50; een ander getal wordt afgerond en dat staat in het antwoord) |
| "grotere ton" / "kleinere ton" | Tonvolume 100 L groter of kleiner |
| "zet het verbruik op 30", "huishoudverbruik 25 liter per uur" | Zet het verbruik van het huishouden (0 tot 60 L/u, stappen van 5) |
| "meer verbruik" / "minder verbruik" / "geen verbruik" | Verbruik 10 L/u hoger of lager, of op 0 |
| "pauzeer" / "speel af" | Stopt of hervat de tijd |
| "ga naar Parijs", "zet de plaats op New York", "toon het weer in Tokio" | Zoekt de plaats op en laadt daar de echte regen (de eerste treffer van de zoekdienst) |

### Wat je ziet

Een **logboek** (bovenaan het widget, onder de schakelaar) toont per commando wat er verstaan werd, als welk commando het begrepen werd, en wat het gevolg was. Het verschijnt pas zodra je iets gezegd hebt. Een zin die niet begrepen wordt, staat er in het rood bij met voorbeelden.

### Twee manieren om te spreken

1. **Microfoonknop**: het microfoon-icoon rechtsboven in het widget. Klik, zeg één commando en de microfoon gaat weer uit. Tijdens het luisteren wordt het icoon rood en pulseert het, en onder de titel staat wat er verstaan wordt.
2. **"Hey Regenton"**: zet de schakelaar "Zeg \"Hey Regenton\" om een commando te starten" aan. De microfoon blijft dan aan en wacht op de activeringszin.
   - "Hey Regenton, leeg de ton" werkt in één adem. Zeg je alleen "Hey Regenton", dan hoor je een korte piep, wordt het icoon rood ("Ja? Zeg je commando…") en wordt je volgende zin het commando. Na 8 seconden stilte vervalt dat.
   - Varianten die de herkenner vaak geeft worden ook aanvaard ("hey regen ton", "hoi regenton", "hallo regentom"). Er moet altijd een begroeting voor staan, zodat een gewone zin als "het regent op de ton" niets doet.
   - Alles wat je zegt zonder de activeringszin wordt genegeerd: het wordt niet getoond en niet bewaard.
   - Browsers beëindigen een lange luistersessie na een tijdje; de pagina start die vanzelf opnieuw zolang de modus aan staat. Bij een geweigerde microfoon of een niet bereikbare spraakdienst gaat de modus uit, met een melding.
   - In deze modus werkt het icoon als "ik ga nu praten": het slaat de activeringszin over.

De herkenning van de activeringszin staat los van de browser in [`src/wakeWord.ts`](../src/wakeWord.ts), de luistermodus in [`src/commands.ts`](../src/commands.ts).

### Zonder microfoon

Er zijn geen knoppen of typveld meer voor de commando's (die zijn op mijn verzoek weggehaald). Werkt spraakherkenning niet (andere browser, microfoon geblokkeerd, geen netwerk), dan staat er een melding en kun je de scène nog steeds bedienen met de knoppen en sliders van het widget zelf: regen, tonvolume, verbruik, kranen, het ventiel, de plaats en de tijd.

### Privacy

In Chrome kan het geluid naar een online dienst gaan voor de herkenning. Dat staat als waarschuwing in het widget zodra de microfoon aan staat. "Hey Regenton" staat standaard uit: dan staat de microfoon alleen aan als je zelf op het icoon klikt.

## Getest en niet getest

- **Getest**: alle commando's met getypte zinnen (via een tijdelijke testingang, die inmiddels uit de interface is); de simulatie met echte data (Brugge en Singapore) en handmatig; de sliders; het openen van het ventiel. De activeringszin is getest met een nagebootste spraakherkenner: aanzetten, gewone zinnen negeren, de zin alleen en met commando, 8 seconden verlopen, automatisch herstarten en een geweigerde microfoon.
- **Niet getest**: de echte microfoon, ook niet "Hey Regenton". Die was geblokkeerd in de omgeving waarin ik testte. Probeer dit zelf in Chrome of Edge en let op hoe goed "Hey Regenton" wordt verstaan; de varianten zijn een schatting.
