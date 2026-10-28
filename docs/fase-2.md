# Fase 2: echte data stuurt de scène

## Opdracht

> Haal data op van een open API of dataset en laat die je scène sturen, bv. weer en zonne-instraling (Open-Meteo), windsnelheid, neerslag, zonnestand (SunCalc) of een energieprijs.

Omdat dit een **regenproject** is, gebruik ik alleen neerslag en bewolking, plus de zonnestand voor het licht. Zonne-instraling en wind laat ik bewust weg.

## Bronnen

| Bron | Wat | Hoe |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/) | `precipitation` (mm per uur) en `cloud_cover` (%) per uur | `fetch` naar `api.open-meteo.com/v1/forecast`, 1 dag terug en 2 dagen vooruit, `timezone=auto` |
| [SunCalc](https://github.com/mourner/suncalc) | Hoogte en richting van zon en maan, belichting van de maan | Berekening in de browser |

Open-Meteo is gratis en heeft geen sleutel nodig (CC BY 4.0, de bronvermelding staat in het widget). Het antwoord wordt 30 minuten in `localStorage` bewaard. Als het ophalen mislukt, meldt de pagina dat en valt ze terug op de handmatige modus.

## Hoe de data de scène stuurt

| Data | Effect in de scène |
| --- | --- |
| Neerslag (mm/u) | Of het regent (vanaf 0,05 mm/u), hoeveel druppels te zien zijn (280 × neerslag/3, tussen 10% en 100%) en hoeveel water het dak naar de ton stuurt |
| Bewolking (%) | Grijsheid en grootte van de wolk, kleur van de lucht, mist en hoe fel de zon is |
| Zonnestand (SunCalc) | Richting en kleur van de zon en haar schaduwen, dag/nacht/zonsondergang, sterren, maan, verlichte ramen 's nachts |
| Tijd | De tijd loopt als **time-lapse** (standaard 1 uur data = 6 seconden); een tijdsschuif om te springen (en klikken op de grafiek). Pauzeren en hervatten kan met de spraakcommando's "pauzeer" en "speel af" |

Tussen twee uren wordt lineair geïnterpoleerd. De tijden van Open-Meteo zijn lokaal; ze worden met `utc_offset_seconds` omgezet naar echte UTC-tijden voordat SunCalc ze gebruikt.

## Plaatsen

Je kunt elke plaats ter wereld kiezen:

- **Keuzelijst** met zeven vaste plaatsen: Brugge (standaard), Kortrijk, Brussel, Reykjavik, Madrid, Tromsø en Singapore. Singapore is handig om te testen: daar regent het vaak en krachtig.
- **Zoekveld**: typ een plaatsnaam (bv. "Parijs") en kies uit de resultaten. Dat gebruikt de [geocoding-API van Open-Meteo](https://open-meteo.com/en/docs/geocoding-api) (gratis, geen sleutel); alleen de ingetypte naam wordt verstuurd. Accenten maken niet uit ("Tromso" vindt Tromsø).
- **Gebruik mijn locatie**: vraagt je browser om je positie. Dat gebeurt alleen als je op de knop klikt en je browser vraagt toestemming. De coördinaten gaan alleen naar Open-Meteo om het weer daar op te halen.
- **Spraak**: "ga naar Parijs", "zet de plaats op New York" of "toon het weer in Tokio".

De tijdzone komt uit de data (`timezone=auto`), dus de lokale tijd, de zonsopgang en de nacht kloppen voor elke plaats.

## Dingen om op te letten

- SunCalc 2 geeft **graden** terug en meet het azimut vanaf het noorden. Dat verschilt van de oudere versie in veel handleidingen (radialen, vanaf het zuiden).
- Open-Meteo geeft de neerslag als som van het voorgaande uur. De staafjes in de grafiek staan daarom over dat voorgaande uur. Voor het model wordt de waarde gewoon lineair tussen de uren geïnterpoleerd; dat is een vereenvoudiging.
