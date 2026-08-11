// attendance.js — Todo el flujo del modulo "Control de asistencia"

/* -------- Paso 0: rol -------- */

function startNewList() {
  editingExisting = false;
  currentListId = null;
  document.getElementById('rol-nombre').value = '';
  setRol('Entrenador');
  const today = new Date();
  document.getElementById('in-fecha').value = today.toISOString().slice(0, 10);
  document.getElementById('in-hora').value = today.toTimeString().slice(0, 5);
  document.getElementById('in-tipo').value = 'Entrenamiento';
  document.getElementById('in-tipo-otro').style.display = 'none';
  document.getElementById('in-lugar').value = '';
  goTo('rol');
}

function setRol(rol) {
  currentRol = rol;
  document.getElementById('rol-btn-entrenador').classList.toggle('active', rol === 'Entrenador');
  document.getElementById('rol-btn-coordinador').classList.toggle('active', rol === 'Coordinador');
}

function goToStep1FromRol() {
  const nombre = document.getElementById('rol-nombre').value.trim();
  if (!nombre) { toast('Escribe el nombre de quien registra'); return; }
  window.__registrador = { rol: currentRol, nombre };
  goTo('step1');
}

function toggleTipoOtro() {
  const v = document.getElementById('in-tipo').value;
  document.getElementById('in-tipo-otro').style.display = v === 'Otro' ? 'block' : 'none';
}

/* -------- Paso 1: datos del evento -> crear o actualizar lista -------- */

async function submitEventData() {
  const tipoSel = document.getElementById('in-tipo').value;
  const tipo = tipoSel === 'Otro' ? (document.getElementById('in-tipo-otro').value.trim() || 'Otro') : tipoSel;
  const fecha = document.getElementById('in-fecha').value;
  const hora = document.getElementById('in-hora').value;
  const lugar = document.getElementById('in-lugar').value.trim();

  if (!fecha || !hora) { toast('Completa fecha y hora del evento'); return; }

  const eventData = {
    tipo, fecha, hora, lugar,
    registradorRol: window.__registrador ? window.__registrador.rol : currentRol,
    registradorNombre: window.__registrador ? window.__registrador.nombre : ''
  };

  if (editingExisting && currentListId) {
    await updateListMeta(currentListId, eventData);
  } else {
    currentListId = await createList(eventData);
    editingExisting = true;
  }
  goTo('step2');
}

/* -------- Paso 2: lista de jugadores -------- */

async function enterStep2() {
  currentFilter = 'Todos';
  document.getElementById('add-form').classList.remove('show');
  document.getElementById('step2-label').textContent = editingExisting ? 'Editando lista' : 'Registro de asistencia';
  await renderStep2Summary();
  renderFilterChips();
  await renderPlayers();
}

async function renderStep2Summary() {
  const list = await db.lists.get(currentListId);
  if (!list) return;
  document.getElementById('evt-summary').textContent =
    `${list.tipo} · ${formatFecha(list.fecha)} ${list.hora} · ${list.lugar || 'sin lugar'} · ${list.registradorRol} ${list.registradorNombre}`;
}

function formatFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function renderFilterChips() {
  const cats = ['Todos', 'Junior', 'Infantil', 'Juvenil'];
  const wrap = document.getElementById('filters');
  wrap.innerHTML = cats.map(c =>
    `<span class="chip ${currentFilter === c ? 'active' : ''}" onclick="setFilter('${c}')">${c}</span>`
  ).join('');
}

function setFilter(c) {
  currentFilter = c;
  renderFilterChips();
  renderPlayers();
}

async function renderPlayers() {
  const rows = await db.attendance.where('listId').equals(currentListId).toArray();
  const filtered = currentFilter === 'Todos' ? rows : rows.filter(r => r.category === currentFilter);
  const wrap = document.getElementById('players');

  if (!filtered.length) {
    wrap.innerHTML = `<div class="empty-state"><i class="ti ti-users"></i><p>No hay jugadores en esta categoria.</p></div>`;
    return;
  }

  wrap.innerHTML = filtered.map(p => `
    <div class="player-row">
      <div class="top">
        <span class="name">${escapeHtml(p.name)}${p.isPendingPlayer ? '<span class="pending-tag">NUEVO</span>' : ''}</span>
        <span class="cat">${p.category}</span>
      </div>
      <div class="status-btns">
        ${['P', 'A', 'J'].map(s => `
          <span class="status-btn ${s.toLowerCase()} ${p.status === s ? 'on' : ''}"
                onclick="setStatus(${p.id}, '${s}')">${s}</span>
        `).join('')}
      </div>
      <input class="note-input" placeholder="Nota (opcional)" value="${escapeAttr(p.note || '')}"
             oninput="setNote(${p.id}, this.value)">
    </div>
  `).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }

async function setStatus(attendanceId, status) {
  const row = await db.attendance.get(attendanceId);
  const newStatus = row.status === status ? null : status; // toca de nuevo para deshacer
  await setAttendanceStatus(attendanceId, newStatus);
  await renderPlayers();
}

let noteDebounce = {};
function setNote(attendanceId, value) {
  clearTimeout(noteDebounce[attendanceId]);
  noteDebounce[attendanceId] = setTimeout(() => setAttendanceNote(attendanceId, value), 300);
}

function toggleAddForm() {
  document.getElementById('add-form').classList.toggle('show');
}

async function confirmAddPlayer() {
  const name = document.getElementById('new-player-name').value.trim();
  const cat = document.getElementById('new-player-cat').value;
  if (!name) { toast('Escribe el nombre del deportista'); return; }
  await addPlayerToList(currentListId, name, cat);
  document.getElementById('new-player-name').value = '';
  document.getElementById('add-form').classList.remove('show');
  await renderPlayers();
  toast('Jugador agregado. Quedara marcado como "pendiente de validar" al sincronizar.');
}

async function saveCurrentList() {
  await db.lists.update(currentListId, { syncStatus: 'pending', updatedAt: new Date().toISOString() });
  editingExisting = true;
  toast('Lista guardada en el celular');
  goTo('listas');
}

/* -------- Listas guardadas -------- */

async function renderListas() {
  const lists = await getLists();
  const wrap = document.getElementById('listas-wrap');
  const empty = document.getElementById('listas-empty');

  if (!lists.length) {
    empty.style.display = 'block';
    wrap.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  const badgeFor = (status) => {
    if (status === 'synced') return ['synced', 'Sincronizado'];
    if (status === 'syncing') return ['syncing', 'Sincronizando...'];
    return ['pending', 'Pendiente'];
  };

  wrap.innerHTML = lists.map(l => {
    const [cls, label] = badgeFor(l.syncStatus);
    return `
      <div class="list-item">
        <div class="head" onclick="openList(${l.id})">
          <div class="info">
            <div class="t">${escapeHtml(l.tipo)}</div>
            <div class="d">${formatFecha(l.fecha)} · ${l.hora} · ${escapeHtml(l.lugar || 'sin lugar')}</div>
          </div>
          <span class="badge ${cls}">${label}</span>
        </div>
        <button class="btn btn-ghost btn-sm btn-block-gap" onclick="syncSingleList(${l.id})">
          <i class="ti ti-refresh"></i> Sincronizar
        </button>
      </div>`;
  }).join('');
}

async function openList(listId) {
  currentListId = listId;
  editingExisting = true;
  const list = await db.lists.get(listId);

  const tiposFijos = ['Entrenamiento', 'Partido', 'Minga'];
  document.getElementById('in-tipo').value = tiposFijos.includes(list.tipo) ? list.tipo : 'Otro';
  document.getElementById('in-tipo-otro').style.display = tiposFijos.includes(list.tipo) ? 'none' : 'block';
  document.getElementById('in-tipo-otro').value = tiposFijos.includes(list.tipo) ? '' : list.tipo;
  document.getElementById('in-fecha').value = list.fecha;
  document.getElementById('in-hora').value = list.hora;
  document.getElementById('in-lugar').value = list.lugar || '';
  window.__registrador = { rol: list.registradorRol, nombre: list.registradorNombre };

  goTo('step2');
}

async function syncSingleList(listId) {
  const url = await Sheets.getScriptUrl();
  if (!Sheets.isConfigured(url)) { toast('Primero configura el enlace de Google Sheets (icono de ajustes)'); return; }
  if (!navigator.onLine) { toast('Sin conexion a internet. Se sincronizara cuando haya senal.'); return; }

  await db.lists.update(listId, { syncStatus: 'syncing' });
  await renderListas();
  try {
    await Sheets.pushList(listId);
    toast('Lista sincronizada con Google Sheets');
  } catch (e) {
    await db.lists.update(listId, { syncStatus: 'pending' });
    toast('No se pudo sincronizar: ' + friendlyError(e));
  }
  await renderListas();
}

function friendlyError(e) {
  const msg = e && e.message;
  if (msg === 'OFFLINE') return 'sin conexion';
  if (msg === 'NO_CONFIG') return 'falta configurar el enlace';
  return 'intenta de nuevo';
}
