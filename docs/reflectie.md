# Reflectie

> **Concept.** Dit is een eerste versie op basis van wat er in het project gebeurde. Herschrijf het in je eigen woorden en vul de stukken tussen [haakjes] aan. Maximum 200 woorden.

**Wat was anders zonder AI?**
[Vul zelf aan: wat zou je zonder hulp trager, anders of niet gedaan hebben? Bijvoorbeeld de procedurele texturen, de WebGPU-ombouw of de spraakparser.]

**Wat werkte niet?**
De transparante muren in "Kijk binnen" bleven ondoorzichtig, want in three.js kan `transparent` niet achteraf aan. De `Sky` van TresJS bestaat niet voor WebGPU en werd een eigen hemelkoepel. SunCalc 2 geeft graden terug in plaats van radialen. Een verkeerd geschreven schaduwinstelling (`shadow-map-size`) liet de hele scène leeg. De echte microfoon kon ik niet testen, alleen de commando's via tekst.

**Grootste vereenvoudiging in de simulatie**
Een vaste afvoercoëfficiënt van 0,8 en uurwaarden van de regen. In het echt hangt wat in de ton komt af van het dak, de bui en de eerste liters die het dak schoonspoelen. Verdamping en lekken ontbreken.
