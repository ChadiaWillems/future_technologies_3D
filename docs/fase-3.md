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
| **Live waarde** | Paneel "Regenton": liters en procent, wat het dak levert (L/u), verbruikt, overgelopen, gezondheid van de tuin |
| **Grafiek** | Lijn van de waterstand over de tijd, regen als staafjes, marker op het getoonde moment, rode stip als de ton vol was (alleen met echte data) |
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

De Web Speech API in het Nederlands (`nl-BE`), in [`src/commands.ts`](../src/commands.ts). Een zin wordt eerst genormaliseerd (kleine letters, zonder accenten of leestekens) en daarna op trefwoorden herkend, zodat "Kan je de ton leegmaken?" en "leeg de ton" hetzelfde doen. Getallen als "vijftien uur" of "15 uur" worden beide herkend.

### Commando's

| Zeg bijvoorbeeld | Gevolg |
| --- | --- |
| "zet de regen aan" / "uit" | Regen aan of uit (schakelt naar handmatige modus) |
| "hoeveel water zit er in de ton" | Antwoord met liters, procent en overloop (ook hardop) |
| "hoeveel regen valt er" | Antwoord met de neerslag nu en wat het dak levert |
| "leeg de ton" | Opent het afvoerventiel |
| "open de kraan" / "sluit de kraan" | Tuinkraan aan of uit |
| "zet de tijd op 15 uur" | Springt naar 15:00 (met echte data) |
| "grotere ton" / "kleinere ton" / "zet de ton op 500 liter" | Verandert het tonvolume |
| "pauzeer" / "speel af" | Stopt of hervat de tijd |

### Wat je ziet

Een **logboek** toont per commando wat er gehoord, getypt of gedrukt werd, als welk commando het begrepen werd, en wat het gevolg was. Een zin die niet begrepen wordt, staat er in het rood bij met voorbeelden.

### Terugval

- **Knoppen** voor de belangrijkste commando's; ze gaan door dezelfde herkenner als spraak.
- Een **typveld** waar je een zin kunt intypen.
- Als spraakherkenning niet werkt (andere browser, microfoon geblokkeerd, geen netwerk), staat er een duidelijke melding en blijven de knoppen werken.

### Privacy

In Chrome kan het geluid naar een online dienst gaan voor de herkenning. Dat staat als waarschuwing in het paneel en de microfoon gaat pas aan als je op de knop drukt.

## Getest en niet getest

- **Getest**: alle commando's via het typveld en de knoppen; de simulatie met echte data (Brugge en Singapore) en handmatig; de sliders; het openen van het ventiel.
- **Niet getest**: de echte microfoon. Die was geblokkeerd in de omgeving waarin ik testte. Probeer dit zelf in Chrome of Edge.
