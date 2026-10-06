/**
 * Samsara -> Google Sheets: overzicht van de bussen voor de hubs.
 *
 * Keten per verversing (3 soorten calls, ongeacht het aantal bussen):
 *   1. GET  /assets                     alle bussen
 *   2. POST /v1/sensors/list            alle sensoren (id + naam)        [nog te bevestigen]
 *   3. POST /v1/sensors/temperature     temperaturen voor alle sensor-ID's in een keer
 * De temperatuurmetingen worden via vehicleId aan het asset gekoppeld; de sensornaam
 * "Zone 1" / "Zone 2" bepaalt de kolom.
 *
 * Setup: zie ../README.md
 */

var API_BASE = 'https://api.eu.samsara.com';
var SHEET_NAME = 'Bussen';
var TOKEN_PROPERTY = 'SAMSARA_API_TOKEN';

var ZONES = ['Zone 1', 'Zone 2'];   // sensornamen in Samsara
var SENSOR_CHUNK = 100;             // sensor-ID's per temperatuur-request

var HEADERS = [
  'Naam', 'Kenteken', 'VIN', 'Merk', 'Model', 'Bouwjaar',
  'Hub', 'Type',
  'Zone 1 (°C)', 'Zone 1 gemeten', 'Zone 2 (°C)', 'Zone 2 gemeten',
  'Asset ID', 'Sheet ververst op'
];
var TIME_HEADERS = ['Zone 1 gemeten', 'Zone 2 gemeten', 'Sheet ververst op'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Samsara')
    .addItem('Nu verversen', 'refreshAssets')
    .addItem('Automatisch verversen aanzetten (elke 15 min)', 'installTrigger')
    .addItem('Automatisch verversen uitzetten', 'removeTrigger')
    .addToUi();
}

/** Hoofdfunctie: haalt assets + temperaturen op en schrijft de sheet. */
function refreshAssets() {
  var assets = fetchAll_('/assets', {
    includeExternalIds: 'true',
    includeTags: 'true',
    includeAttributes: 'true'
  });
  var temps = fetchZoneTemperatures_();   // { vehicleId: { 'Zone 1': {temp, time}, ... } }

  var assetIds = {};
  var now = new Date();
  var rows = assets.map(function (a) {
    assetIds[String(a.id)] = true;
    return toRow_(a, temps[String(a.id)] || {}, now);
  });

  var unmatched = Object.keys(temps).filter(function (id) { return !assetIds[id]; });
  if (unmatched.length) {
    Logger.log('Temperatuurmetingen zonder bijbehorend asset (vehicleId): ' + unmatched.join(', '));
  }

  rows.sort(function (a, b) { return String(a[6] + a[0]).localeCompare(String(b[6] + b[0])); });
  writeSheet_(rows);
}

/**
 * Haalt alle sensoren op, vraagt de temperaturen in een batch op en geeft per
 * vehicleId de meting per zone terug.
 */
function fetchZoneTemperatures_() {
  var sensors = fetchSensors_().filter(function (s) {
    return ZONES.indexOf(s.name) !== -1;
  });

  var byVehicle = {};
  for (var i = 0; i < sensors.length; i += SENSOR_CHUNK) {
    var ids = sensors.slice(i, i + SENSOR_CHUNK).map(function (s) { return s.id; });
    var body = post_('/v1/sensors/temperature', { sensors: ids });
    (body.sensors || []).forEach(function (m) {
      if (m.vehicleId == null || ZONES.indexOf(m.name) === -1) { return; }
      var key = String(m.vehicleId);
      byVehicle[key] = byVehicle[key] || {};
      byVehicle[key][m.name] = {
        // Samsara geeft millicelsius (3296 = 3,296 °C)
        temp: m.ambientTemperature != null ? m.ambientTemperature / 1000 : '',
        time: m.ambientTemperatureTime ? new Date(m.ambientTemperatureTime) : ''
      };
    });
  }
  return byVehicle;
}

/** Alle sensoren (id + naam). Endpoint/respons nog te bevestigen met een echte call. */
function fetchSensors_() {
  var body = post_('/v1/sensors/list', {});
  return body.sensors || [];
}

function toRow_(a, zones, now) {
  var hub = (a.tags || []).map(function (t) { return t.name; }).join(', ');
  var z1 = zones['Zone 1'] || {};
  var z2 = zones['Zone 2'] || {};
  return [
    a.name || '',
    a.licensePlate || '',
    a.vin || '',
    a.make || '',
    a.model || '',
    a.year || '',
    hub,
    a.type || '',
    z1.temp != null ? z1.temp : '', z1.time || '',
    z2.temp != null ? z2.temp : '', z2.time || '',
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
    TIME_HEADERS.forEach(function (h) {
      sheet.getRange(2, HEADERS.indexOf(h) + 1, rows.length, 1).setNumberFormat('dd-mm-yyyy hh:mm');
    });
    ['Zone 1 (°C)', 'Zone 2 (°C)'].forEach(function (h) {
      sheet.getRange(2, HEADERS.indexOf(h) + 1, rows.length, 1).setNumberFormat('0.0');
    });
  }
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, Math.max(rows.length + 1, 2), HEADERS.length).createFilter();
  }
  sheet.autoResizeColumns(1, HEADERS.length);
}

function getToken_() {
  var token = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!token) {
    throw new Error('Geen Samsara API token. Zet script property ' + TOKEN_PROPERTY + ' (Projectinstellingen > Scripteigenschappen).');
  }
  return token;
}

/** Haalt alle pagina's op van een Samsara list-endpoint (GET). */
function fetchAll_(path, params) {
  var token = getToken_();
  var results = [];
  var after = null;
  do {
    var query = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    });
    if (after) { query.push('after=' + encodeURIComponent(after)); }
    var url = API_BASE + path + (query.length ? '?' + query.join('&') : '');

    var body = request_(url, { method: 'get' }, token);
    results = results.concat(body.data || []);
    var p = body.pagination || {};
    after = p.hasNextPage ? p.endCursor : null;
  } while (after);

  return results;
}

/** POST met JSON-body. */
function post_(path, payload) {
  return request_(API_BASE + path, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  }, getToken_());
}

/** Request met Bearer-token en simpele retry bij rate limit (429) / 5xx. */
function request_(url, options, token) {
  var opts = Object.assign({}, options, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    muteHttpExceptions: true
  });
  for (var attempt = 1; attempt <= 4; attempt++) {
    var res = UrlFetchApp.fetch(url, opts);
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
