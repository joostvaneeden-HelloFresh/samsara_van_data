# Samsara busdata in Google Sheets

Google Apps Script dat via de Samsara REST API (EU: `https://api.eu.samsara.com`) de
assets (bussen) ophaalt en in een Google Sheet zet, zodat hubs het overzicht kunnen bekijken.

Huidige kolommen (uit `GET /assets`): naam, kenteken, VIN, merk, model, bouwjaar,
hub (= tagnaam, bijv. "Bleiswijk"), type, asset ID, tijdstip van verversen.

**Nog te doen:** per asset de sensor-ID's van de twee temperatuursensoren ophalen en de
temperaturen toevoegen (zie `TODO` in `apps_script/Code.gs`).

## Setup

1. **API token** in Samsara (Settings > Developer > API Tokens), alleen leesrechten.
   Deel het token nooit in chat of in git.
2. Nieuwe Google Sheet > *Extensies > Apps Script*; plak `apps_script/Code.gs` en
   (via *Projectinstellingen > manifest tonen*) `apps_script/appsscript.json`.
3. *Projectinstellingen > Scripteigenschappen*: `SAMSARA_API_TOKEN` = je token.
4. Menu **Samsara > Nu verversen** (eerste keer toestemming geven), daarna
   **Automatisch verversen aanzetten** (elke 15 minuten).
5. Deel de sheet met de hubs (alleen lezen); elke hub kan een filterweergave op de kolom *Hub* maken.
