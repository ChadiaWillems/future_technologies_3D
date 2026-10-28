# AI-verantwoording (fase 2 en 3)

## Tool

**Claude Code** in de Claude-desktopapp (Code-tab), met de modellen Claude Opus 5.5 en later Claude Sonnet 5.5. Claude Code las en schreef de bestanden in dit project, draaide `eslint`, `vite build` en de dev-server en testte de scène in een ingebouwde browser.

De code in dit project is door de AI geschreven. Ik heb de richting bepaald, de resultaten bekeken en bijgestuurd. *[Vul zelf aan wat je zelf nog aanpaste, controleerde of herschreef.]*

## Prompts

De belangrijkste opdrachten die ik gaf (licht ingekort):

**Fase 2**

1. "haal data op van een open API of dataset en laat die je scène sturen, bv. weer en zonne-instraling (Open-Meteo), windsnelheid, neerslag, zonnestand (SunCalc) of een energieprijs"
2. "sinds dit een 'regen' project is is enkel die info nuttig dus alle andere info moet er niet op staan"

**Fase 3**

3. "denk hier nu eens over na:" gevolgd door de opdracht van fase 3 (spraak en simulatie)
4. "enkel regenwater?"
5. "nee, mijn focus is regen dus niets van zonne-opbrengst of wind"

**Eerder (fase 1 en uitbreidingen)**

6. De opdracht voor fase 1 (licht, wolk, goot en regen bij een klik op de wolk, zonder data of API's)
7. "let the rain fall from the roof into the gutter", "put the drain around the whole house, connect the drain to the rain ton and show the rain filling the ton, make the house look like a real house"
8. "make the rain ton bigger, it can also be too full and overflow" en "let it literally flow over"
9. "is there a way that we can use this rainwater in the house?", gevolgd door "all 3? but start with the garden tap ... make the house little bigger (not the ton) and give it a garden"
10. "make the whole project look more realistic" en "kan je dit zo maken dat het ook werkt met WebGPU of zoiets?"
11. "kunnen we ook locatie veranderen? en dan niet enkel de lijst die je nu hebt staan maar meer?"
12. "dit soort spraakcommando's zouden ook geaccepteerd mogen worden: zet de ton volume op 100" (tonvolume en huishoudverbruik per spraak)
13. "zet de knop van de spreek commando ook rechts, maar zet het in de bovenste widget als een icon", daarna "doe dit dan weg" (het Spraak-paneel met knoppen en typveld)
14. "geef dit project een zin zoals 'hey ...' dat aangezet kan worden dat je zo commando's kan starten"
15. "verander alle widgets naar één widget met locatie, regenton info en dan de grafiek aub met tussentitels & doe deze knoppen weg, doe de 'hey regenton' met een toggle switch ipv een check blokje"
16. "hoe stop ik dat automatisch spelen, dat mag niet...", daarna "laat het de live tijd volgen, maar dat je het wel kan aanpassen"
17. "doe dit zinnetje in het grijzig aub" (de melding over de tijd)
18. "maak de grafiek van de afgelopen 3 dagen, niet dat de volgende dag al getoont kan worden" en "toon het uur wel" (uurmarkeringen en het tijdstip bij de marker)

## Wat de AI voorstelde en wat ik bijstuurde

| Voorstel van de AI | Mijn keuze |
| --- | --- |
| In fase 2 bouwde de AI ook zonnepanelen, windeffecten, temperatuur en zonne-instraling (voorbeelden uit de opdracht) | Weggehaald: het project gaat over regen, dus alleen regen-informatie op het scherm (prompt 2 en 5) |
| Voor fase 3 het regenwater als grootheid kiezen | Bevestigd (prompt 4 en 5) |

De AI heeft daarnaast zelf het hele paneel in het Nederlands gezet, passend bij de Nederlandse spraakcommando's. Dat was niet door mij gevraagd.

## Wat er fout ging en hoe het is opgelost

- **Een schaduwinstelling** (`shadow-map-size`) werd als `shadow.map.size` gelezen en liet de hele scène leeg. Opgelost met `shadow-mapSize-width` en `-height`.
- **Doorzichtige muren** voor "Kijk binnen" werkten niet, omdat `transparent` in three.js achteraf niet meer aan te zetten is zonder het materiaal te hercompileren. Het materiaal is nu altijd transparant en alleen de dekking verandert.
- **De `Sky` van TresJS** bestaat niet in de WebGPU-versie. Vervangen door een eigen hemelkoepel met een kleurverloop.
- **SunCalc 2** werkt met graden en meet het azimut vanaf het noorden. De omzetting naar de scène is daarop aangepast en gecontroleerd (26° zonnehoogte rond de middag eind oktober in Brugge).
- **`npm run build` faalde** door een verouderde `manualChunks`-instelling in de template van Vite. Aangepast.
- **Een tijdcommando noemde een verouderd tijdstip** in het antwoord. Aangepast zodat het de nieuwe tijd meteen berekent.

## Wat ik zelf controleerde

- De scène draait echt op WebGPU (gecontroleerd met `getContext('webgpu')`).
- De zonnehoogte en het regenverloop klopten met Open-Meteo (Brugge en Singapore).
- Alle spraakcommando's werken met getypte zinnen en de activeringszin "Hey Regenton" werkt met een nagebootste spraakherkenner. De microfoon zelf is **niet** getest in deze omgeving. *[Test dit zelf in Chrome of Edge en noteer het resultaat.]*
