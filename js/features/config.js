// config.js — Pantalla donde el club pega el enlace de su Google Apps Script
// y puede forzar la descarga del roster oficial de jugadores.

async function enterConfig() {
  const url = await Sheets.getScriptUrl();
  document.getElementById('cfg-url').value = url || '';
  const last = await getSetting('lastRosterSync', null);
  document.getElementById('cfg-last-sync').textContent = last
    ? 'Ultima actualizacion de jugadores: ' + new Date(last).toLocaleString()
    : 'Aun no se ha sincronizado con Google Sheets';
  const rosterCount = await db.roster.count();
  document.getElementById('cfg-roster-count').textContent = rosterCount;
}

async function saveScriptUrl() {
  const url = document.getElementById('cfg-url').value.trim();
  if (url && !url.startsWith('https://script.google.com/')) {
    toast('El enlace debe empezar con https://script.google.com/');
    return;
  }
  await setSetting('scriptUrl', url);
  toast('Enlace guardado');
}

async function syncRosterNow() {
  if (!navigator.onLine) { toast('Sin conexion a internet'); return; }
  const url = await Sheets.getScriptUrl();
  if (!Sheets.isConfigured(url)) { toast('Primero guarda el enlace de Google Sheets'); return; }
  toast('Actualizando lista de jugadores...');
  try {
    const n = await Sheets.pullRoster();
    toast(`Roster actualizado: ${n} jugadores`);
    await enterConfig();
  } catch (e) {
    toast('No se pudo actualizar: revisa el enlace o tu conexion');
  }
}

async function syncAllPendingNow() {
  if (!navigator.onLine) { toast('Sin conexion a internet'); return; }
  const url = await Sheets.getScriptUrl();
  if (!Sheets.isConfigured(url)) { toast('Primero guarda el enlace de Google Sheets'); return; }
  toast('Sincronizando listas pendientes...');
  const result = await Sheets.pushAllPending();
  if (result.total === 0) { toast('No hay listas pendientes'); return; }
  toast(`Sincronizadas ${result.done} de ${result.total}${result.failed ? ' (' + result.failed + ' fallaron)' : ''}`);
  await refreshAsisHomeCount();
}
