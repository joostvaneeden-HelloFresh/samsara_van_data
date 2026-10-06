/**
 * Samsara -> Google Sheets: overzicht van de bussen voor de hubs.
 *
 * Haalt via de Samsara REST API (EU) de assets op (GET /assets) en schrijft die
 * naar het tabblad "Bussen".
 *
 * Setup: zie ../README.md
 */

var API_BASE = 'https://api.eu.samsara.com';
var SHEET_NAME = 'Bussen';
var TOKEN_PROPERTY = 'SAMSARA_API_TOKEN';

// Alleen velden die in een echte /assets-response zijn gezien.
var HEADERS = [
  'Naam', 'Kenteken', 'VIN', 'Merk', 'Model', 'Bouwjaar',
  'Hub', 'Type', 'Asset ID', 'Sheet ververst op'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Samsara')
    .addItem('Nu verversen', 'refreshAssets')
    .addItem('Automatisch verversen aanzetten (elke 15 min)', 'installTrigger')
    .addItem('Automatisch verversen uitzetten', 'removeTrigger')
    .addToUi();
}

/** Hoofdfunctie: haalt assets op en schrijft de sheet. */
function refreshAssets() {
  var assets = fetchAll_('/assets', {
    includeExternalIds: 'true',
    includeTags: 'true',
    includeAttributes: 'true'
  });

  // TODO: sensor-ID's van de twee temperatuursensoren per asset ophalen
  // en temperaturen toevoegen (endpoint nog te bevestigen).

  var now = new Date();
  var rows = assets.map(function (a) { return toRow_(a, now); });
  rows.sort(function (a, b) { return String(a[6] + a[0]).localeCompare(String(b[6] + b[0])); });
  writeSheet_(rows);
}

function toRow_(a, now) {
  var hub = (a.tags || []).map(function (t) { return t.name; }).join(', ');
  return [
    a.name || '',
    a.licensePlate || '',
    a.vin || '',
    a.make || '',
    a.model || '',
    a.year || '',
    hub,
    a.type || '',
    a.id,
    now
  ];
}

function writeSheet_(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  // Alleen de data wissen, zodat filters/filterweergaves van hubs behouden blijven.
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.getRange(2, HEADERS.length, rows.length, 1).setNumberFormat('dd-mm-yyyy hh:mm');
  }
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, Math.max(rows.length + 1, 2), HEADERS.length).createFilter();
  }
  sheet.autoResizeColumns(1, HEADERS.length);
}

/** Haalt alle pagina's op van een Samsara list-endpoint. */
function fetchAll_(path, params) {
  var token = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!token) {
    throw new Error('Geen Samsara API token. Zet script property ' + TOKEN_PROPERTY + ' (Projectinstellingen > Scripteigenschappen).');
  }

  var results = [];
  var after = null;
  do {
    var query = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    });
    if (after) { query.push('after=' + encodeURIComponent(after)); }
    var url = API_BASE + path + (query.length ? '?' + query.join('&') : '');

    var body = request_(url, token);
    results = results.concat(body.data || []);
    var p = body.pagination || {};
    after = p.hasNextPage ? p.endCursor : null;
  } while (after);

  return results;
}

/** GET met Bearer-token en simpele retry bij rate limit (429) / 5xx. */
function request_(url, token) {
  for (var attempt = 1; attempt <= 4; attempt++) {
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200) { return JSON.parse(res.getContentText()); }
    if ((code === 429 || code >= 500) && attempt < 4) {
      Utilities.sleep(1000 * Math.pow(2, attempt));
      continue;
    }
    throw new Error('Samsara API ' + code + ' voor ' + url + ': ' + res.getContentText());
  }
}

function installTrigger() {
  removeTrigger();
  ScriptApp.newTrigger('refreshAssets').timeBased().everyMinutes(15).create();
}

function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshAssets') { ScriptApp.deleteTrigger(t); }
  });
}
