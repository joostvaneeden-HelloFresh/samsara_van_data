# Samsara voertuigdata in Google Sheets

Google Apps Script dat via de Samsara REST API de voertuigen en hun laatste status
ophaalt en in een Google Sheet zet, zodat hubs het overzicht kunnen bekijken.

Kolommen: naam, kenteken, VIN, merk/model/bouwjaar, hub, tags, vaste bestuurder,
motorstatus, snelheid, brandstof %, kilometerstand, locatie (adres + lat/long) en
tijdstip van de laatste update.

## Setup

1. **API token** – Samsara Dashboard > Settings > Developer > API Tokens > *Add*.
   Geef alleen *read*-rechten op *Vehicles* en *Vehicle Statistics* (en *Drivers* voor de bestuurder).
2. **Sheet** – maak een nieuwe Google Sheet > *Extensies > Apps Script*.
3. Plak de inhoud van `apps_script/Code.gs` in `Code.gs`. Zet via *Projectinstellingen >
   "appsscript.json-manifest tonen"* de inhoud van `apps_script/appsscript.json` erin
   (of gebruik [clasp](https://github.com/google/clasp)).
4. **Token opslaan** – *Projectinstellingen > Scripteigenschappen > Eigenschap toevoegen*:
   `SAMSARA_API_TOKEN` = je token. Zet het token nooit in de code of in git.
5. Herlaad de sheet, kies in het menu **Samsara > Nu verversen** (eerste keer: toestemming geven).
6. **Samsara > Automatisch verversen aanzetten** ververst daarna elke 15 minuten.
7. Deel de sheet met de hubs (alleen *lezen*). Elke hub kan een eigen *filterweergave*
   maken op de kolom *Hub*; de filters blijven staan bij verversen.

## Hub per voertuig

Hubs worden afgeleid van Samsara-tags. Heb je tags als `Hub Utrecht`, zet dan
`HUB_TAG_PREFIX = 'Hub '` bovenin `Code.gs`.

## Aandachtspunten

- De sheet toont de laatste bekende stand, geen live tracking.
- Samsara-limiet van 4 stat-types per request: pas `STAT_TYPES` aan voor andere data
  (bijv. `gpsOdometerMeters`, `batteryMilliVolts`, `engineCoolantTemperatureMilliC`).
- Hubs met alleen leesrechten zien het token niet; het staat in de scripteigenschappen.
