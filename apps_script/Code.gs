/**
 * Samsara -> Google Sheets: voertuigoverzicht voor de hubs.
 *
 * Haalt via de Samsara REST API de voertuigen (/fleet/vehicles) en hun laatste
 * status (/fleet/vehicles/stats) op en schrijft die naar het tabblad "Voertuigen".
 *
 * Setup: zie ../README.md
 */

var API_BASE = 'https://api.samsara.com';
var SHEET_NAME = 'Voertuigen';
var TOKEN_PROPERTY = 'SAMSARA_API_TOKEN';

// Optioneel: als je tags per hub gebruikt (bijv. "Hub Utrecht") zet je hier de
// prefix, dan komt de hubnaam in een eigen kolom. Leeg laten = alleen "Tags".
var HUB_TAG_PREFIX = '';

// Max. 4 stat-types per request (Samsara-limiet).
var STAT_TYPES = ['gps', 'obdOdometerMeters', 'fuelPercents', 'engineStates'];

var HEADERS = [
  'Naam', 'Kenteken', 'VIN', 'Merk', 'Model', 'Bouwjaar',
  'Hub', 'Tags', 'Vaste bestuurder',
  'Motor', 'Snelheid (km/u)', 'Brandstof (%)', 'Kilometerstand (km)',
  'Locatie', 'Latitude', 'Longitude', 'Laatste update locatie',
  'Samsara ID', 'Sheet ververst op'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Samsara')
    .addItem('Nu verversen', 'refreshVehicles')
    .addItem('Automatisch verversen aanzetten (elke 15 min)', 'installTrigger')
    .addItem('Automatisch verversen uitzetten', 'removeTrigger')
    .addToUi();
}

/** Hoofdfunctie: haalt data op en schrijft de sheet. */
function refreshVehicles() {
  var vehicles = fetchAll_('/fleet/vehicles', {});
  var stats = fetchAll_('/fleet/vehicles/stats', { types: STAT_TYPES.join(',') });

  var statsById = {};
  stats.forEach(function (s) { statsById[s.id] = s; });

  var now = new Date();
  var rows = vehicles.map(function (v) {
    return toRow_(v, statsById[v.id] || {}, now);
  });
  rows.sort(function (a, b) { return String(a[6] + a[0]).localeCompare(String(b[6] + b[0])); });

  writeSheet_(rows);
}

function toRow_(v, s, now) {
  var tags = (v.tags || []).map(function (t) { return t.name; });
  var hub = '';
  if (HUB_TAG_PREFIX) {
    var match = tags.filter(function (t) { return t.indexOf(HUB_TAG_PREFIX) === 0; })[0];
    hub = match ? match.substring(HUB_TAG_PREFIX.length).trim() : '';
  }
  var gps = s.gps || {};
  var odo = s.obdOdometerMeters;
  var fuel = s.fuelPercents;
  var engine = s.engineStates;
  var driver = v.staticAssignedDriver && v.staticAssignedDriver.name;

  return [
    v.name || '',
    v.licensePlate || '',
    v.vin || '',
    v.make || '',
    v.model || '',
    v.year || '',
    hub,
    tags.join(', '),
    driver || '',
    engine ? engine.value : '',
    gps.speedMilesPerHour != null ? Math.round(gps.speedMilesPerHour * 1.609344) : '',
    fuel ? fuel.value : '',
    odo ? Math.round(odo.value / 1000) : '',
    gps.reverseGeo ? gps.reverseGeo.formattedLocation : '',
    gps.latitude != null ? gps.latitude : '',
    gps.longitude != null ? gps.longitude : '',
    gps.time ? new Date(gps.time) : '',
    v.id,
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
    sheet.getRange(2, 17, rows.length, 1).setNumberFormat('dd-mm-yyyy hh:mm');
    sheet.getRange(2, 19, rows.length, 1).setNumberFormat('dd-mm-yyyy hh:mm');
    sheet.getRange(2, 13, rows.length, 1).setNumberFormat('#,##0');
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
  ScriptApp.newTrigger('refreshVehicles').timeBased().everyMinutes(15).create();
}

function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshVehicles') { ScriptApp.deleteTrigger(t); }
  });
}
