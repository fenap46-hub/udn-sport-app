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
  await db.attendance.update(attendanceId, { status });
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
