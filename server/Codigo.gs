/**
 * UDN SPORT - Codigo.gs
 * -----------------------------------------------------------------------
 * Este script se pega en Google Apps Script (dentro del Google Sheet del
 * club) y se publica como "Web App". La app del celular le habla a traves
 * de HTTP (GET para bajar el roster, POST para subir asistencia).
 *
 * Ver README.md en la raiz del proyecto para la guia de instalacion paso
 * a paso (Extensiones > Apps Script > pegar este codigo > Implementar).
 * -----------------------------------------------------------------------
 */

// Nombres de las pestañas que este script espera encontrar / crear.
const SHEET_JUGADORES = 'Jugadores';
const SHEET_ASISTENCIA = 'Asistencia';
const SHEET_PENDIENTES = 'Jugadores_Pendientes';

/* ----------------------------- GET ------------------------------------
 * Uso: <URL_DEL_SCRIPT>?action=getRoster
 * Devuelve el roster oficial de la pestaña "Jugadores".
 * ---------------------------------------------------------------------*/
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getRoster') {
    return jsonResponse({ ok: true, players: getRosterFromSheet() });
  }

  return jsonResponse({ ok: false, error: 'ACCION_NO_RECONOCIDA' });
}

/* ----------------------------- POST -----------------------------------
 * Uso: POST con body JSON { action: "pushAttendance", event, attendance, pendingPlayers }
 * Escribe una fila por jugador en "Asistencia" y, si aplica, agrega
 * filas en "Jugadores_Pendientes" para que el administrador las revise.
 * ---------------------------------------------------------------------*/
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'JSON_INVALIDO' });
  }

  if (payload.action === 'pushAttendance') {
    try {
      writeAttendance(payload.event, payload.attendance);
      if (payload.pendingPlayers && payload.pendingPlayers.length) {
        writePendingPlayers(payload.pendingPlayers);
      }
      return jsonResponse({ ok: true });
    } catch (err) {
      return jsonResponse({ ok: false, error: String(err) });
    }
  }

  return jsonResponse({ ok: false, error: 'ACCION_NO_RECONOCIDA' });
}

/* ----------------------------- Helpers --------------------------------*/

function getSs() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(name, headers) {
  const ss = getSs();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getRosterFromSheet() {
  const sheet = getOrCreateSheet(SHEET_JUGADORES, ['ID', 'Nombre', 'Categoria', 'Activo']);
  const data = sheet.getDataRange().getValues();
  const players = [];
  for (let i = 1; i < data.length; i++) {
    const [id, nombre, categoria, activo] = data[i];
    if (!nombre) continue;
    players.push({
      id: String(id || i),
      name: nombre,
      category: categoria || 'Junior',
      active: activo === undefined || activo === '' ? true : activo === true || String(activo).toLowerCase() === 'si'
    });
  }
  return players;
}

function writeAttendance(event, attendanceRows) {
  const sheet = getOrCreateSheet(SHEET_ASISTENCIA, [
    'Fecha', 'Hora', 'Lugar', 'Tipo Evento', 'Rol Registrador', 'Nombre Registrador',
    'Jugador', 'Categoria', 'Estado', 'Nota', 'Jugador Nuevo', 'Fecha Sincro'
  ]);
  const now = new Date();
  const rows = attendanceRows.map(p => [
    event.fecha, event.hora, event.lugar, event.tipo,
    event.registradorRol, event.registradorNombre,
    p.nombre, p.categoria, p.estado, p.nota,
    p.jugadorNuevo ? 'Si' : 'No', now
  ]);
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function writePendingPlayers(pendingPlayers) {
  const sheet = getOrCreateSheet(SHEET_PENDIENTES, [
    'Nombre', 'Categoria sugerida', 'Agregado por', 'Fecha evento', 'Fecha deteccion', 'Revisado'
  ]);
  const now = new Date();
  const rows = pendingPlayers.map(p => [p.nombre, p.categoria, p.agregadoPor, p.fecha, now, 'No']);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
