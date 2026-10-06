# Samsara busdata in Google Sheets

Google Apps Script dat via de Samsara REST API (EU: `https://api.eu.samsara.com`) de
assets (bussen) ophaalt en in een Google Sheet zet, zodat hubs het overzicht kunnen bekijken.

Kolommen: naam, kenteken, VIN, merk, model, bouwjaar, hub (= tagnaam, bijv. "Bleiswijk"),
type, temperatuur + meettijd van **Zone 1** en **Zone 2** (°C), asset ID, tijdstip van verversen.

Per verversing 3 calls, ongeacht het aantal bussen: `GET /assets`, alle sensoren ophalen en
één batch `POST /v1/sensors/temperature`. Metingen worden via `vehicleId` aan het asset-ID
gekoppeld; de sensornaam ("Zone 1"/"Zone 2") bepaalt de kolom.

**Nog te bevestigen met een echte call:** het endpoint voor "alle sensoren"
(`fetchSensors_` in `Code.gs`, nu `POST /v1/sensors/list`) en dat `vehicleId` gelijk is aan het asset-ID.
Metingen zonder passend asset komen in het uitvoerlogboek van het script.

## Setup

1. **API token** in Samsara (Settings > Developer > API Tokens), alleen leesrechten.
   Deel het token nooit in chat of in git.
2. Nieuwe Google Sheet > *Extensies > Apps Script*; plak `apps_script/Code.gs` en
   (via *Projectinstellingen > manifest tonen*) `apps_script/appsscript.json`.
3. *Projectinstellingen > Scripteigenschappen*: `SAMSARA_API_TOKEN` = je token.
4. Menu **Samsara > Nu verversen** (eerste keer toestemming geven), daarna
   **Automatisch verversen aanzetten** (elke 15 minuten).
5. Deel de sheet met de hubs (alleen lezen); elke hub kan een filterweergave op de kolom *Hub* maken.
