# Regenwater-scène

Een 3D-scène (TresJS / Three.js) over **regenwater opvangen**: regen valt van een wolk op het dak van een huis, loopt via de dakgoot en de regenpijp in een regenton, en dat water gebruik je voor de tuin en het huis. De scène wordt gestuurd door **echte neerslagdata** en kan je bedienen met **spraak**.


## Starten

Je hebt Node.js nodig.

```bash
npm install
```

```bash
npm run dev
```

Open de link die Vite toont (meestal <http://localhost:5173>). Je hebt internet nodig voor de weerdata; zonder internet valt de pagina terug op de handmatige modus.

Productiebuild: `npm run build`, en bekijken met `npm run preview`.

> Een live link (GitHub Pages, Netlify, …) is er nog niet: zie [Live link](#live-link).

## Wat kan je doen?

| Doen | Effect |
| --- | --- |
| Klik op de **wolk** (handmatige modus) | Het begint of stopt met regenen |
| Knop **Echte data** | Echte neerslag en bewolking van Open-Meteo sturen de scène; de tijd loopt als time-lapse |
| Plaats kiezen, **Pauze**, **Nu**, tijdsschuif | Een andere plek of een ander moment bekijken |
| Klik op de **tuinkraan** op de ton | De tuin krijgt water en het niveau zakt |
| Klik op het **afvoerventiel** onderaan de ton | De ton loopt leeg |
| **Kijk binnen** en klik op het toilet of de gootsteenkraan | Water uit de ton wordt in huis gebruikt (met pomp) |
| Sliders **Tonvolume** en **Verbruik huishouden** | De ton wordt groter of kleiner; het huishouden gebruikt constant water |
| **Spreek een commando**, de knoppen of het typveld | Zie [spraakcommando's](docs/fase-3.md#a-spraak) |

De lamp op de paal bij de ton toont het niveau: groen = genoeg, oranje = bijna leeg, rood = leeg, blauw = loopt over.

## Bronnen van data

- **Neerslag en bewolking per uur**: [Open-Meteo](https://open-meteo.com/) (gratis, geen sleutel, licentie CC BY 4.0). We vragen 1 dag terug en 2 dagen vooruit op (72 uur). Het antwoord wordt 30 minuten in `localStorage` bewaard.
- **Zon en maan**: [SunCalc](https://github.com/mourner/suncalc) (berekening, geen data-aanvraag). Dit bepaalt alleen het licht: dag, nacht, zonsondergang, sterren en maan.

Alleen de gekozen plaats (breedte- en lengtegraad) gaat naar Open-Meteo. Spraakherkenning van de browser kan het geluid naar een online dienst sturen (Chrome); er staat een waarschuwing in het paneel.

## Model en formules

De waterstand in de ton (zie [`src/rainModel.ts`](src/rainModel.ts)):

```
aanvoer   = neerslag (mm/u) × dakoppervlak (m²) × afvoercoëfficiënt × tijd (u)
totaal    = niveau + aanvoer − verbruik
niveau    = min(totaal, tonvolume)
overloop  = max(0, totaal − tonvolume)
```

- 1 mm regen op 1 m² is 1 liter.
- Dakoppervlak ≈ 28,1 m² (het dak van boven gezien: een vierkant van 5,3 m).
- Afvoercoëfficiënt = 0,8 (een deel verdampt of spat weg).
- Tonvolume 100 tot 600 L (standaard 300 L), verbruik 0 tot 60 L/u.

Meer uitleg, de overige constanten en de vereenvoudigingen staan in [docs/fase-3.md](docs/fase-3.md).

## Opbouw van de code

| Bestand | Wat |
| --- | --- |
| `src/App.vue` | Panelen (ton, grafiek, sliders, spraak, echte data) en de canvas |
| `src/components/Landscape.vue` | De 3D-scène: huis, tuin, ton, regen, lucht en licht |
| `src/components/RainChart.vue` | Grafiek van waterstand en neerslag |
| `src/rainModel.ts` | Het rekenmodel van de ton |
| `src/liveData.ts`, `src/liveController.ts` | Open-Meteo ophalen, tussen de uren interpoleren, SunCalc |
| `src/commands.ts` | Spraakherkenning en de commando's |
| `src/waterState.ts` | Gedeelde toestand van scène en panelen |
| `src/textures.ts` | Alle texturen worden in code getekend (geen afbeeldingen) |

Techniek: Vue 3, TresJS 5 met `WebGPURenderer` (valt automatisch terug op WebGL2), Three.js, TypeScript, Vite.


## Documentatie per fase

- [Fase 1: scène met licht, wolk, goot en regen](docs/fase-1.md)
- [Fase 2: echte data stuurt de scène](docs/fase-2.md)
- [Fase 3: slim met spraak en simulatie](docs/fase-3.md)
- [Reflectie](docs/reflectie.md)
- [AI-verantwoording](docs/ai-verantwoording.md)


## Bronvermelding

Weerdata door [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0). Zonnestand door [SunCalc](https://github.com/mourner/suncalc) (BSD).
