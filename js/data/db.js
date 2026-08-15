// db.js — Base de datos local offline (Dexie.js sobre IndexedDB)
// Todo lo que la app necesita para funcionar sin internet vive aqui.

const db = new Dexie('UDNSportDB');

db.version(1).stores({
  // Roster oficial del club, cacheado desde Google Sheets
  roster: '++id, remoteId, name, category, active',

  // Cada evento con asistencia tomada (una "lista")
  lists: '++id, tipo, fecha, hora, lugar, registradorRol, registradorNombre, syncStatus, createdAt, updatedAt',

  // Registro de asistencia por jugador, ligado a una lista
  attendance: '++id, listId, playerLocalId, name, category, status, note, isPendingPlayer',

  // Jugadores nuevos agregados desde el celular, pendientes de validar por el administrador
  pendingPlayers: '++id, name, category, addedBy, addedAt, listId, syncStatus',

  // Configuracion simple clave/valor (URL del Apps Script, ultimo sync, etc.)
  settings: '&key'
});

db.version(2).stores({
  roster: '++id, remoteId, name, category, active',
  lists: '++id, tipo, fecha, hora, lugar, registradorRol, registradorNombre, syncStatus, createdAt, updatedAt',
  attendance: '++id, listId, playerLocalId, name, category, status, note, isPendingPlayer',
  pendingPlayers: '++id, name, category, addedBy, addedAt, listId, syncStatus',
  settings: '&key',

  // Modulo 2: Gestion de partidos
  // Un partido completo (config + resultado final)
  matches: '++id, rival, categoria, fecha, hora, cancha, sistema, duracionTiempo, registradorRol, registradorNombre, golesUdn, golesRival, resultado, nota, syncStatus, createdAt, updatedAt',

  // Jugadores que participaron en un partido especifico (titular/suplente + posicion de ese dia)
  matchLineup: '++id, matchId, playerLocalId, name, category, tipo, posicion',

  // Eventos cronologicos del partido: goles, tarjetas, cambios, alargue
  matchEvents: '++id, matchId, tiempo, segundos, tipo, jugador, detalle, orderIndex',

  // Tanda de penales, una fila por ronda
  matchPenalties: '++id, matchId, ronda, jugadorUdn, resUdn, resRival'
});

/* ---------------- Settings helpers ---------------- */

async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

/* ---------------- Roster helpers ---------------- */

async function getRoster() {
  return db.roster.orderBy('name').toArray();
}

async function upsertRosterFromRemote(remotePlayers) {
  // remotePlayers: [{id, name, category, active}, ...] venido de Google Sheets
  await db.transaction('rw', db.roster, async () => {
    for (const p of remotePlayers) {
      const existing = await db.roster.where('remoteId').equals(p.id).first();
      if (existing) {
        await db.roster.update(existing.id, {
          name: p.name,
          category: p.category,
          active: p.active !== false
        });
      } else {
        await db.roster.add({
          remoteId: p.id,
          name: p.name,
          category: p.category,
          active: p.active !== false
        });
      }
    }
  });
}

// Reemplaza TODO el roster local por el que viene de Sheets. Se usa en
// lugar de upsertRosterFromRemote para evitar que queden mezclados los
// 9 jugadores de muestra (los que trae la app antes de la primera
// sincronizacion) junto con el roster real del club.
async function replaceRosterFromRemote(remotePlayers) {
  await db.transaction('rw', db.roster, async () => {
    await db.roster.clear();
    await db.roster.bulkAdd(remotePlayers.map(p => ({
      remoteId: p.id,
      name: p.name,
      category: p.category,
      active: p.active !== false
    })));
  });
}

async function seedDemoRosterIfEmpty() {
  const count = await db.roster.count();
  if (count > 0) return;
  const demo = [
    { name: 'Juan Martinez', category: 'Junior' },
    { name: 'Lucas Sanchez', category: 'Junior' },
    { name: 'Mateo Vega', category: 'Junior' },
    { name: 'Emilia Torres', category: 'Infantil' },
    { name: 'Diego Ramos', category: 'Infantil' },
    { name: 'Sofia Paredes', category: 'Infantil' },
    { name: 'Andres Salazar', category: 'Juvenil' },
    { name: 'Carla Nunez', category: 'Juvenil' },
    { name: 'Pablo Cordero', category: 'Juvenil' }
  ];
  await db.roster.bulkAdd(demo.map(p => ({ ...p, remoteId: null, active: true })));
}

/* ---------------- Lists / attendance helpers ---------------- */

async function createList(eventData) {
  const now = new Date().toISOString();
  const listId = await db.lists.add({
    ...eventData,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now
  });

  const roster = await getRoster();
  const rows = roster.filter(p => p.active !== false).map(p => ({
    listId,
    playerLocalId: p.id,
    name: p.name,
    category: p.category,
    status: null,
    note: '',
    isPendingPlayer: false
  }));
  if (rows.length) await db.attendance.bulkAdd(rows);
  return listId;
}

async function getLists() {
  return db.lists.orderBy('createdAt').reverse().toArray();
}

async function getListWithPlayers(listId) {
  const list = await db.lists.get(listId);
  const players = await db.attendance.where('listId').equals(listId).toArray();
  return { list, players };
}

async function updateListMeta(listId, eventData) {
  await db.lists.update(listId, { ...eventData, updatedAt: new Date().toISOString() });
}

async function setAttendanceStatus(attendanceId, status) {
  const registeredAt = status ? new Date().toISOString() : null;
  await db.attendance.update(attendanceId, { status, registeredAt });
  const row = await db.attendance.get(attendanceId);
  if (row) await db.lists.update(row.listId, { syncStatus: 'pending', updatedAt: new Date().toISOString() });
}

async function setAttendanceNote(attendanceId, note) {
  await db.attendance.update(attendanceId, { note });
}

async function addPlayerToList(listId, name, category) {
  const now = new Date().toISOString();
  const attendanceId = await db.attendance.add({
    listId,
    playerLocalId: null,
    name,
    category,
    status: null,
    note: '',
    isPendingPlayer: true
  });
  await db.pendingPlayers.add({
    name,
    category,
    addedBy: (await db.lists.get(listId))?.registradorNombre || '',
    addedAt: now,
    listId,
    syncStatus: 'pending'
  });
  await db.lists.update(listId, { syncStatus: 'pending', updatedAt: now });
  return attendanceId;
}

async function markListSynced(listId) {
  await db.lists.update(listId, { syncStatus: 'synced' });
  const pending = await db.pendingPlayers.where('listId').equals(listId).toArray();
  for (const p of pending) {
    await db.pendingPlayers.update(p.id, { syncStatus: 'synced' });
  }
}

async function getPendingListsCount() {
  return db.lists.where('syncStatus').equals('pending').count();
}

async function deleteList(listId) {
  await db.transaction('rw', db.lists, db.attendance, db.pendingPlayers, async () => {
    await db.attendance.where('listId').equals(listId).delete();
    await db.pendingPlayers.where('listId').equals(listId).delete();
    await db.lists.delete(listId);
  });
}

async function deleteAllSyncedLists() {
  const synced = await db.lists.where('syncStatus').equals('synced').toArray();
  for (const l of synced) await deleteList(l.id);
  return synced.length;
}

/* ================= MODULO 2: Gestion de partidos ================= */

async function createMatch(matchData) {
  const now = new Date().toISOString();
  return db.matches.add({
    ...matchData,
    golesUdn: 0,
    golesRival: 0,
    resultado: '',
    nota: '',
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now
  });
}

async function updateMatch(matchId, changes) {
  await db.matches.update(matchId, { ...changes, updatedAt: new Date().toISOString() });
}

async function getMatch(matchId) {
  return db.matches.get(matchId);
}

async function getMatches() {
  return db.matches.orderBy('createdAt').reverse().toArray();
}

async function getPendingMatchesCount() {
  return db.matches.where('syncStatus').equals('pending').count();
}

/* ---- Alineacion ---- */

async function setLineupPlayer(matchId, player, tipo) {
  // player: {id (roster local id), name, category}
  const existing = await db.matchLineup
    .where('matchId').equals(matchId)
    .and(r => r.playerLocalId === player.id)
    .first();

  if (existing && existing.tipo === tipo) {
    // tocar el mismo tipo de nuevo = quitar de la alineacion
    await db.matchLineup.delete(existing.id);
    return null;
  }
  if (existing) {
    await db.matchLineup.update(existing.id, { tipo });
    return existing.id;
  }
  return db.matchLineup.add({
    matchId, playerLocalId: player.id, name: player.name, category: player.category,
    tipo, posicion: ''
  });
}

async function setLineupPosicion(lineupId, posicion) {
  await db.matchLineup.update(lineupId, { posicion });
}

async function getLineup(matchId) {
  return db.matchLineup.where('matchId').equals(matchId).toArray();
}

async function deleteLineupPlayer(lineupId) {
  await db.matchLineup.delete(lineupId);
}

/* ---- Eventos ---- */

async function addMatchEvent(matchId, tiempo, segundos, tipo, jugador, detalle) {
  const count = await db.matchEvents.where('matchId').equals(matchId).count();
  return db.matchEvents.add({ matchId, tiempo, segundos, tipo, jugador: jugador || '', detalle: detalle || '', orderIndex: count });
}

async function getMatchEvents(matchId) {
  return db.matchEvents.where('matchId').equals(matchId).sortBy('orderIndex');
}

/* ---- Goles (ajustan el contador directo en el partido) ---- */

async function adjustGoles(matchId, equipo, delta) {
  const match = await db.matches.get(matchId);
  if (equipo === 'udn') {
    const nuevo = Math.max(0, (match.golesUdn || 0) + delta);
    await db.matches.update(matchId, { golesUdn: nuevo });
    return nuevo;
  } else {
    const nuevo = Math.max(0, (match.golesRival || 0) + delta);
    await db.matches.update(matchId, { golesRival: nuevo });
    return nuevo;
  }
}

/* ---- Penales ---- */

async function addPenaltyRound(matchId) {
  const count = await db.matchPenalties.where('matchId').equals(matchId).count();
  return db.matchPenalties.add({ matchId, ronda: count + 1, jugadorUdn: '', resUdn: '', resRival: '' });
}

async function updatePenaltyRound(roundId, changes) {
  await db.matchPenalties.update(roundId, changes);
}

async function getPenaltyRounds(matchId) {
  return db.matchPenalties.where('matchId').equals(matchId).sortBy('ronda');
}

async function getPenaltyTally(matchId) {
  const rounds = await getPenaltyRounds(matchId);
  const udn = rounds.filter(r => r.resUdn === 'gol').length;
  const rival = rounds.filter(r => r.resRival === 'gol').length;
  return { udn, rival };
}

/* ---- Finalizar / guardar ---- */

async function finalizeMatch(matchId, nota) {
  const match = await db.matches.get(matchId);
  let resultado = match.golesUdn > match.golesRival ? 'Ganado' : match.golesUdn < match.golesRival ? 'Perdido' : 'Empatado';

  if (match.golesUdn === match.golesRival) {
    const t = await getPenaltyTally(matchId);
    if (t.udn !== t.rival) {
      resultado = (t.udn > t.rival ? 'Ganado' : 'Perdido') + ` (penales ${t.udn}-${t.rival})`;
    }
  }

  await db.matches.update(matchId, {
    resultado,
    nota: nota || '',
    updatedAt: new Date().toISOString()
  });
  return resultado;
}

async function markMatchSynced(matchId) {
  await db.matches.update(matchId, { syncStatus: 'synced' });
}

async function deleteMatch(matchId) {
  await db.transaction('rw', db.matches, db.matchLineup, db.matchEvents, db.matchPenalties, async () => {
    await db.matchLineup.where('matchId').equals(matchId).delete();
    await db.matchEvents.where('matchId').equals(matchId).delete();
    await db.matchPenalties.where('matchId').equals(matchId).delete();
    await db.matches.delete(matchId);
  });
}

async function deleteAllSyncedMatches() {
  const synced = await db.matches.where('syncStatus').equals('synced').toArray();
  for (const m of synced) await deleteMatch(m.id);
  return synced.length;
}

async function getMatchFull(matchId) {
  const match = await db.matches.get(matchId);
  const lineup = await getLineup(matchId);
  const events = await getMatchEvents(matchId);
  const penalties = await getPenaltyRounds(matchId);
  return { match, lineup, events, penalties };
}
