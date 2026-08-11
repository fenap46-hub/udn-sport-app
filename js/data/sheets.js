// sheets.js — Comunicacion con Google Sheets a traves de un Google Apps Script
// publicado como Web App. Ver server/Codigo.gs para el script que hay que
// pegar en Google Apps Script, y README.md para la guia de despliegue paso a paso.

const Sheets = (() => {

  async function getScriptUrl() {
    return getSetting('scriptUrl', '');
  }

  function isConfigured(url) {
    return !!url && url.startsWith('https://script.google.com/');
  }

  // Descarga el roster oficial desde la pestaña "Jugadores" del Sheet
  // y lo guarda en la base local (Dexie).
  async function pullRoster() {
    const url = await getScriptUrl();
    if (!isConfigured(url)) throw new Error('NO_CONFIG');
    if (!navigator.onLine) throw new Error('OFFLINE');

    const res = await fetch(`${url}?action=getRoster`, { method: 'GET' });
    if (!res.ok) throw new Error('HTTP_' + res.status);
    const data = await res.json();
    if (!data || !Array.isArray(data.players)) throw new Error('BAD_RESPONSE');

    await upsertRosterFromRemote(data.players);
    await setSetting('lastRosterSync', new Date().toISOString());
    return data.players.length;
  }

  // Sube una lista de asistencia (evento + cada jugador) a la hoja "Asistencia".
  // Si hay jugadores nuevos marcados como pendientes, tambien los manda
  // a la hoja "Jugadores_Pendientes" para que el administrador los revise.
  async function pushList(listId) {
    const url = await getScriptUrl();
    if (!isConfigured(url)) throw new Error('NO_CONFIG');
    if (!navigator.onLine) throw new Error('OFFLINE');

    const { list, players } = await getListWithPlayers(listId);
    if (!list) throw new Error('LIST_NOT_FOUND');

    const payload = {
      action: 'pushAttendance',
      event: {
        tipo: list.tipo,
        fecha: list.fecha,
        hora: list.hora,
        lugar: list.lugar,
        registradorRol: list.registradorRol,
        registradorNombre: list.registradorNombre
      },
      attendance: players.map(p => ({
        nombre: p.name,
        categoria: p.category,
        estado: p.status || 'Sin registrar',
        nota: p.note || '',
        jugadorNuevo: !!p.isPendingPlayer
      })),
      pendingPlayers: players
        .filter(p => p.isPendingPlayer)
        .map(p => ({
          nombre: p.name,
          categoria: p.category,
          agregadoPor: list.registradorRol + ' ' + list.registradorNombre,
          fecha: list.fecha
        }))
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS en Apps Script
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('HTTP_' + res.status);
    const data = await res.json();
    if (!data || data.ok !== true) throw new Error(data && data.error ? data.error : 'SYNC_FAILED');

    await markListSynced(listId);
    return true;
  }

  // Intenta sincronizar todas las listas pendientes, en orden.
  async function pushAllPending(onProgress) {
    const lists = await getLists();
    const pending = lists.filter(l => l.syncStatus !== 'synced');
    let done = 0, failed = 0;
    for (const l of pending) {
      try {
        await pushList(l.id);
        done++;
      } catch (e) {
        failed++;
      }
      if (onProgress) onProgress(done + failed, pending.length);
    }
    return { done, failed, total: pending.length };
  }

  return { getScriptUrl, isConfigured, pullRoster, pushList, pushAllPending };
})();
