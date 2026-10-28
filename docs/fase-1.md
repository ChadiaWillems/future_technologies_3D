# Fase 1: de regenscène

## Opdracht

> Maak de TresJS-regenscène af: licht met materialen die erop reageren, een wolk boven het huis en een goot naar de regenpijp, en laat het regenen als je op de wolk klikt. Hou het eenvoudig: basisvormen, geen data of API's.

## Wat is er gebouwd

- **Huis** van basisvormen: wanden (doos), dak (piramide), schoorsteen, deur, ramen met kozijn en vensterbank, en een sokkel.
- **Licht en materialen**: een zon (richtingslicht met schaduw) en een hemellicht. Alle materialen zijn `MeshStandardMaterial` (of `MeshPhysicalMaterial` voor glas en porselein), zodat ze op licht reageren. Een basismateriaal doet dat niet.
- **Wolk** boven het huis, gemaakt van overlappende bollen. Klik erop en het gaat regenen; klik nog eens en het stopt. De wolk wordt donkerder als het regent.
- **Goot rond het hele dak** en een **regenpijp** naar de **regenton**.
- **Regen** is een groep druppels die vanuit de wolk valt. Een druppel die het dak raakt, glijdt naar de dichtstbijzijnde rand, valt in de goot, loopt naar de hoek met de regenpijp en valt in de ton.
- De ton **vult zich** en **loopt over** als hij vol is: het water loopt over de rand, langs de buitenkant naar beneden en maakt een plas.

## Hoe werkt de regen

Elke druppel heeft een toestand: *valt*, *glijdt over het dak*, *loopt door de goot*, *valt door de pijp*, *loopt over de rand*. Een functie bepaalt per beeld wat de druppel doet. De hoogte van het dak (een piramide) wordt berekend zodat druppels op het dak blijven liggen.

## Uitbreidingen sinds fase 1

De eerste commit (`ac0cc22`) bevat meer dan alleen fase 1: er zijn later een tuin met kranen, een binnenkant met toilet en gootsteen, en een realistische look (texturen, lucht, mist) bijgekomen.
