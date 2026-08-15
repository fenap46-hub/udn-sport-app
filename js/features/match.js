// match.js — Todo el flujo del modulo "Gestion de partidos"

const POSICIONES = [
  'Portero', 'Defensa central', 'Defensa izquierda', 'Defensa derecha',
  'Lateral izquierdo', 'Lateral derecho', 'Mediocampo', 'Medio izquierdo',
  'Medio derecho', 'Delantero centro', 'Delantero izquierdo', 'Delantero derecho'
];

let currentMatchId = null;
let currentRolMatch = 'Entrenador';
let filtroAlinMatch = 'Todos';
let editingExistingMatch = false;

// Cronometro basado en marcas de tiempo reales (Date.now) para evitar
// desfases si el navegador ralentiza el setInterval en segundo plano.
let crono = { running: false, phase: 'Primer tiempo', accumulatedMs: 0, startTs: null, tickHandle: null, alargue: false };

/* -------- Home del modulo -------- */

async function enterPartidoHome() {
  const n = await db.matches.count();
  const pending = await getPendingMatchesCount();
  document.getElementById('count-partidos').textContent = n;
  document.getElementById('count-partidos-pendientes').textContent = pending;
  document.getElementById('partidos-pendientes-row').style.display = pending > 0 ? 'flex' : 'none';
}

function startNewMatch() {
  editingExistingMatch = false;
  currentMatchId = null;
  crono = { running: false, phase: 'Primer tiempo', accumulatedMs: 0, startTs: null, tickHandle: null, alargue: false };
  document.getElementById('match-rol-nombre').value = '';
  setRolMatch('Entrenador');
  const today = new Date();
  document.getElementById('match-fecha').value = today.toISOString().slice(0, 10);
  document.getElementById('match-hora').value = today.toTimeString().slice(0, 5);
  document.getElementById('match-rival').value = '';
  document.getElementById('match-cancha').value = '';
  document.getElementById('match-sistema').value = '1-3-2-1';
  document.getElementById('match-duracion').value = '25';
  goTo('partido-rol');
}

function setRolMatch(rol) {
  currentRolMatch = rol;
  document.getElementById('match-rol-entrenador').classList.toggle('active', rol === 'Entrenador');
  document.getElementById('match-rol-coordinador').classList.toggle('active', rol === 'Coordinador');
}

function goToMatchConfigFromRol() {
  const nombre = document.getElementById('match-rol-nombre').value.trim();
  if (!nombre) { toast('Escribe el nombre de quien dirige'); return; }
  window.__registradorMatch = { rol: currentRolMatch, nombre };
  goTo('partido-config');
}

/* -------- Config del partido -------- */

async function enterMatchConfig() {
  renderPitch();
}

function renderPitch() {
  const raw = (document.getElementById('match-sistema').value || '1-3-2-1')
    .split('-').map(n => parseInt(n) || 0).filter(n => n > 0);
  const rows = raw.length ? raw : [1, 3, 2, 1];
  const w = 290, h = 170;
  let dots = '';
  rows.forEach((count, ri) => {
    const y = h - 20 - (ri * (h - 40) / (rows.length - 1 || 1));
    for (let i = 0; i < count; i++) {
      const x = (w / (count + 1)) * (i + 1);
      dots += `<circle cx="${x}" cy="${y}" r="7" fill="#00d4ff"></circle>`;
    }
  });
  document.getElementById('match-pitch-wrap').innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;display:block">
      <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="6" fill="#123a1a" stroke="#1c3352"></rect>
      <line x1="2" y1="${h / 2}" x2="${w - 2}" y2="${h / 2}" stroke="#2a5a3a" stroke-width="1"></line>
      <circle cx="${w / 2}" cy="${h / 2}" r="18" fill="none" stroke="#2a5a3a"></circle>
      <rect x="${w / 2 - 40}" y="${h - 24}" width="80" height="20" fill="none" stroke="#2a5a3a"></rect>
      ${dots}
    </svg>
    <div class="sub" style="text-align:center;margin-top:4px">Sistema: ${rows.join('-')} (${rows.reduce((a, b) => a + b, 0)} jugadores en cancha)</div>
  `;
}

async function submitMatchConfig() {
  const rival = document.getElementById('match-rival').value.trim();
  const fecha = document.getElementById('match-fecha').value;
  const hora = document.getElementById('match-hora').value;
  if (!rival) { toast('Escribe el equipo rival'); return; }
  if (!fecha || !hora) { toast('Completa fecha y hora'); return; }

  const matchData = {
    rival, fecha, hora,
    categoria: document.getElementById('match-cat').value,
    cancha: document.getElementById('match-cancha').value.trim(),
    sistema: document.getElementById('match-sistema').value.trim() || '1-3-2-1',
    duracionTiempo: parseInt(document.getElementById('match-duracion').value) || 25,
    registradorRol: window.__registradorMatch ? window.__registradorMatch.rol : currentRolMatch,
    registradorNombre: window.__registradorMatch ? window.__registradorMatch.nombre : ''
  };

  if (editingExistingMatch && currentMatchId) {
    await updateMatch(currentMatchId, matchData);
  } else {
    currentMatchId = await createMatch(matchData);
    editingExistingMatch = true;
  }
  goTo('partido-alineacion');
}

/* -------- Alineacion -------- */

async function enterAlineacion() {
  filtroAlinMatch = 'Todos';
  document.getElementById('alin-warn').style.display = 'none';
  renderFiltrosAlin();
  await renderListaAlin();
  await renderContadoresAlin();
}

function renderFiltrosAlin() {
  const cats = ['Todos', 'Junior', 'Infantil', 'Juvenil', 'Mixta'];
  document.getElementById('filtros-alin').innerHTML = cats.map(c =>
    `<span class="chip ${filtroAlinMatch === c ? 'active' : ''}" onclick="setFiltroAlinMatch('${c}')">${c}</span>`
  ).join('');
}

function setFiltroAlinMatch(c) {
  filtroAlinMatch = c;
  renderFiltrosAlin();
  renderListaAlin();
}

async function renderContadoresAlin() {
  const lineup = await getLineup(currentMatchId);
  const tit = lineup.filter(l => l.tipo === 'Titular').length;
  const sup = lineup.filter(l => l.tipo === 'Suplente').length;
  const necesarios = (document.getElementById('match-sistema').value || '1-3-2-1')
    .split('-').map(n => parseInt(n) || 0).reduce((a, b) => a + b, 0);
  document.getElementById('contadores-alin').innerHTML = `
    <div class="stat-mini"><div class="v" style="color:var(--green-text)">${tit}</div><div class="l">Titulares</div></div>
    <div class="stat-mini"><div class="v" style="color:var(--amber-text)">${sup}</div><div class="l">Suplentes</div></div>
    <div class="stat-mini"><div class="v" style="color:var(--cyan)">${necesarios}</div><div class="l">Necesarios</div></div>
  `;
}

async function renderListaAlin() {
  const roster = await getRoster();
  const lineup = await getLineup(currentMatchId);
  const lineupByPlayer = {};
  lineup.forEach(l => { lineupByPlayer[l.playerLocalId] = l; });

  const list = roster.filter(p => p.active !== false &&
    (filtroAlinMatch === 'Todos' || filtroAlinMatch === 'Mixta' || p.category === filtroAlinMatch));

  document.getElementById('lista-alin').innerHTML = list.map(p => {
    const sel = lineupByPlayer[p.id];
    return `
      <div class="player-row">
        <div class="top">
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="cat">${p.category}</span>
        </div>
        <div class="status-btns">
          <span class="status-btn ${sel && sel.tipo === 'Titular' ? 'on titular' : ''}"
                onclick="toggleLineup(${p.id}, 'Titular')">Titular</span>
          <span class="status-btn ${sel && sel.tipo === 'Suplente' ? 'on suplente' : ''}"
                onclick="toggleLineup(${p.id}, 'Suplente')">Suplente</span>
        </div>
        ${sel ? `<select onchange="setPosicionLineup(${sel.id}, this.value)">
            <option value="">Posicion en este partido</option>
            ${POSICIONES.map(pos => `<option ${sel.posicion === pos ? 'selected' : ''}>${pos}</option>`).join('')}
          </select>` : ''}
      </div>
    `;
  }).join('');
}

async function toggleLineup(playerLocalId, tipo) {
  const roster = await getRoster();
  const player = roster.find(p => p.id === playerLocalId);
  if (!player) return;
  await setLineupPlayer(currentMatchId, player, tipo);
  await renderListaAlin();
  await renderContadoresAlin();
}

async function setPosicionLineup(lineupId, posicion) {
  await setLineupPosicion(lineupId, posicion);
}

async function iniciarPartido() {
  const lineup = await getLineup(currentMatchId);
  const tit = lineup.filter(l => l.tipo === 'Titular').length;
  if (tit === 0) { document.getElementById('alin-warn').style.display = 'block'; return; }
  goTo('partido-vivo');
}

/* -------- Partido en vivo -------- */

async function enterPartidoVivo() {
  const match = await getMatch(currentMatchId);
  document.getElementById('vivo-rival').textContent = match.rival || 'Rival';
  document.getElementById('vivo-marcador').textContent = `${match.golesUdn} - ${match.golesRival}`;
  document.getElementById('vivo-gol-udn').textContent = match.golesUdn;
  document.getElementById('vivo-gol-rival').textContent = match.golesRival;
  document.getElementById('vivo-fase').textContent = crono.phase.toUpperCase();
  updateCronoDisplay();
  updatePlayBtn();
  updateAlargueBtn();
  updateFaseBtn();
  await renderEventosVivo();
}

function getElapsedMs() {
  return crono.accumulatedMs + (crono.running ? Date.now() - crono.startTs : 0);
}

function fmtCrono(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateCronoDisplay() {
  const el = document.getElementById('vivo-crono');
  if (el) el.textContent = fmtCrono(getElapsedMs());
  const limiteMs = (parseInt(document.getElementById('match-duracion').value) || 25) * 60000;
  const alertaEl = document.getElementById('vivo-alerta-tiempo');
  if (alertaEl) alertaEl.style.display = (getElapsedMs() >= limiteMs && !crono.alargue) ? 'block' : 'none';
}

function toggleCrono() {
  if (crono.running) {
    crono.accumulatedMs += Date.now() - crono.startTs;
    crono.running = false;
    clearInterval(crono.tickHandle);
  } else {
    crono.startTs = Date.now();
    crono.running = true;
    crono.tickHandle = setInterval(updateCronoDisplay, 500);
  }
  updatePlayBtn();
}

function updatePlayBtn() {
  const btn = document.getElementById('btn-vivo-play');
  if (!btn) return;
  btn.innerHTML = crono.running
    ? '<i class="ti ti-player-pause"></i> Pausa'
    : '<i class="ti ti-player-play"></i> Play';
}

async function toggleAlargueMatch() {
  crono.alargue = !crono.alargue;
  updateAlargueBtn();
  await addMatchEvent(currentMatchId, crono.phase, Math.floor(getElapsedMs() / 1000),
    crono.alargue ? 'Alargue' : 'Fin de alargue', '', '');
  await renderEventosVivo();
}

function updateAlargueBtn() {
  const btn = document.getElementById('btn-vivo-alargue');
  const badge = document.getElementById('vivo-alerta-alargue');
  if (!btn) return;
  btn.classList.toggle('alargue-on', crono.alargue);
  if (badge) badge.style.display = crono.alargue ? 'block' : 'none';
  if (!crono.alargue) document.getElementById('vivo-alerta-tiempo').style.display = 'none';
}

async function resetCronoMatch() {
  clearInterval(crono.tickHandle);
  crono.accumulatedMs = 0;
  crono.running = false;
  crono.startTs = null;
  updateCronoDisplay();
  updatePlayBtn();
  document.getElementById('vivo-alerta-tiempo').style.display = 'none';
  await addMatchEvent(currentMatchId, crono.phase, 0, 'Reset cronometro', '', 'Reiniciado manualmente');
  await renderEventosVivo();
}

async function avanzarFaseMatch() {
  if (crono.running) toggleCrono();

  if (crono.phase === 'Primer tiempo') {
    crono.phase = 'Descanso';
    await addMatchEvent(currentMatchId, 'Primer tiempo', Math.floor(getElapsedMs() / 1000), 'Fin del primer tiempo', '', '');
    document.getElementById('btn-vivo-fase').textContent = 'Iniciar 2do tiempo';
  } else if (crono.phase === 'Descanso') {
    crono.phase = 'Segundo tiempo';
    crono.accumulatedMs = 0;
    crono.alargue = false;
    updateCronoDisplay();
    updateAlargueBtn();
    await addMatchEvent(currentMatchId, 'Segundo tiempo', 0, 'Inicio del segundo tiempo', '', '');
    document.getElementById('btn-vivo-fase').textContent = 'Finalizar partido';
  } else {
    goTo('partido-resumen');
    return;
  }
  document.getElementById('vivo-fase').textContent = crono.phase.toUpperCase();
  await renderEventosVivo();
}

function updateFaseBtn() {
  const btn = document.getElementById('btn-vivo-fase');
  if (!btn) return;
  btn.textContent = crono.phase === 'Primer tiempo' ? 'Finalizar 1er tiempo'
    : crono.phase === 'Descanso' ? 'Iniciar 2do tiempo' : 'Finalizar partido';
}

async function golMatch(equipo, delta) {
  const nuevo = await adjustGoles(currentMatchId, equipo, delta);
  if (equipo === 'udn') document.getElementById('vivo-gol-udn').textContent = nuevo;
  else document.getElementById('vivo-gol-rival').textContent = nuevo;
  const match = await getMatch(currentMatchId);
  document.getElementById('vivo-marcador').textContent = `${match.golesUdn} - ${match.golesRival}`;

  if (delta > 0) {
    await addMatchEvent(currentMatchId, crono.phase, Math.floor(getElapsedMs() / 1000),
      equipo === 'udn' ? 'Gol UDN' : 'Gol rival', '', '');
  } else {
    await addMatchEvent(currentMatchId, crono.phase, Math.floor(getElapsedMs() / 1000),
      'Correccion de gol', '', `Se anulo un gol de ${equipo === 'udn' ? 'UDN' : 'rival'}`);
  }
  await renderEventosVivo();
}

async function tarjetaMatch(tipo) {
  await addMatchEvent(currentMatchId, crono.phase, Math.floor(getElapsedMs() / 1000),
    `Tarjeta ${tipo}`, '', '');
  await renderEventosVivo();
}

async function toggleCambioForm() {
  const f = document.getElementById('cambio-form');
  const show = f.style.display === 'none';
  f.style.display = show ? 'block' : 'none';
  document.getElementById('cambio-warn').style.display = 'none';
  if (show) {
    const lineup = await getLineup(currentMatchId);
    const titulares = lineup.filter(l => l.tipo === 'Titular');
    const suplentes = lineup.filter(l => l.tipo === 'Suplente');
    document.getElementById('sel-sale').innerHTML = titulares.length
      ? titulares.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')
      : '<option value="">No hay titulares</option>';
    document.getElementById('sel-entra').innerHTML = suplentes.length
      ? suplentes.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')
      : '<option value="">No hay suplentes</option>';
  }
}

async function confirmarCambio() {
  const saleId = parseInt(document.getElementById('sel-sale').value);
  const entraId = parseInt(document.getElementById('sel-entra').value);
  if (!saleId || !entraId) { document.getElementById('cambio-warn').style.display = 'block'; return; }

  const saleRow = await db.matchLineup.get(saleId);
  const entraRow = await db.matchLineup.get(entraId);
  await db.matchLineup.update(saleId, { tipo: 'Suplente' });
  await db.matchLineup.update(entraId, { tipo: 'Titular' });

  await addMatchEvent(currentMatchId, crono.phase, Math.floor(getElapsedMs() / 1000),
    'Cambio', '', `Sale ${saleRow.name}, entra ${entraRow.name}`);

  document.getElementById('cambio-form').style.display = 'none';
  await renderEventosVivo();
}

async function renderEventosVivo() {
  const events = await getMatchEvents(currentMatchId);
  const wrap = document.getElementById('lista-eventos-vivo');
  wrap.innerHTML = events.slice().reverse().map(e => `
    <div class="event-log-item">${e.tipo}${e.detalle ? ': ' + escapeHtml(e.detalle) : ''} · ${e.tiempo}</div>
  `).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* -------- Penales -------- */

async function enterPenales() {
  const existing = await getPenaltyRounds(currentMatchId);
  if (!existing.length) {
    await addPenaltyRound(currentMatchId);
    await addPenaltyRound(currentMatchId);
    await addPenaltyRound(currentMatchId);
  }
  document.getElementById('pk-ganador').style.display = 'none';
  await renderPenales();
}

async function pkAgregarRonda() {
  await addPenaltyRound(currentMatchId);
  await renderPenales();
}

async function renderPenales() {
  const rounds = await getPenaltyRounds(currentMatchId);
  const t = await getPenaltyTally(currentMatchId);
  document.getElementById('pk-udn').textContent = t.udn;
  document.getElementById('pk-rival').textContent = t.rival;

  const lineup = await getLineup(currentMatchId);
  const titulares = lineup.filter(l => l.tipo === 'Titular').map(l => l.name);
  const usados = rounds.map(r => r.jugadorUdn).filter(Boolean);
  const disponibles = titulares.filter(n => !usados.includes(n));

  document.getElementById('pk-rounds').innerHTML = rounds.map(r => {
    const opciones = [r.jugadorUdn, ...disponibles.filter(n => n !== r.jugadorUdn)].filter((v, i, a) => v && a.indexOf(v) === i);
    return `
      <div class="pk-round">
        <div class="pk-round-label">Ronda ${r.ronda}</div>
        <div class="pk-row">
          <select onchange="pkSetJugador(${r.id}, this.value)">
            <option value="">Jugador UDN...</option>
            ${opciones.map(n => `<option ${r.jugadorUdn === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
          </select>
          <span class="pk-btn gol ${r.resUdn === 'gol' ? 'on' : ''}" onclick="pkSetRes(${r.id}, 'resUdn', 'gol')"><i class="ti ti-check"></i></span>
          <span class="pk-btn fallo ${r.resUdn === 'fallo' ? 'on' : ''}" onclick="pkSetRes(${r.id}, 'resUdn', 'fallo')"><i class="ti ti-x"></i></span>
        </div>
        <div class="pk-row">
          <span class="pk-rival-label">Rival (pateador ${r.ronda})</span>
          <span class="pk-btn gol ${r.resRival === 'gol' ? 'on' : ''}" onclick="pkSetRes(${r.id}, 'resRival', 'gol')"><i class="ti ti-check"></i></span>
          <span class="pk-btn fallo ${r.resRival === 'fallo' ? 'on' : ''}" onclick="pkSetRes(${r.id}, 'resRival', 'fallo')"><i class="ti ti-x"></i></span>
        </div>
      </div>
    `;
  }).join('');
}

async function pkSetJugador(roundId, val) {
  await updatePenaltyRound(roundId, { jugadorUdn: val });
  await renderPenales();
}

async function pkSetRes(roundId, campo, val) {
  const rounds = await getPenaltyRounds(currentMatchId);
  const row = rounds.find(r => r.id === roundId);
  const nuevo = row[campo] === val ? '' : val;
  await updatePenaltyRound(roundId, { [campo]: nuevo });
  await renderPenales();
}

async function pkFinalizar() {
  const t = await getPenaltyTally(currentMatchId);
  const el = document.getElementById('pk-ganador');
  el.style.display = 'block';
  el.classList.remove('win', 'lose', 'draw');
  if (t.udn > t.rival) {
    el.textContent = `Gana UDN Sport en penales ${t.udn}-${t.rival}`;
    el.classList.add('win');
  } else if (t.rival > t.udn) {
    el.textContent = `Gana el rival en penales ${t.rival}-${t.udn}`;
    el.classList.add('lose');
  } else {
    el.textContent = 'Empate en penales, agrega otra ronda';
    el.classList.add('draw');
  }
}

/* -------- Resumen final -------- */

async function enterResumen() {
  const match = await getMatch(currentMatchId);
  const events = await getMatchEvents(currentMatchId);
  const lineup = await getLineup(currentMatchId);

  document.getElementById('resumen-rival').textContent = match.rival;
  document.getElementById('resumen-marcador').textContent = `${match.golesUdn} - ${match.golesRival}`;
  document.getElementById('match-nota').value = match.nota || '';

  document.getElementById('resumen-stats').innerHTML = `
    <div class="stat-line"><span>Dirige</span><span>${match.registradorRol} ${escapeHtml(match.registradorNombre)}</span></div>
    <div class="stat-line"><span>Sistema usado</span><span>${escapeHtml(match.sistema)}</span></div>
    <div class="stat-line"><span>Eventos registrados</span><span>${events.length}</span></div>
    <div class="stat-line"><span>Jugadores en alineacion</span><span>${lineup.length}</span></div>
  `;
}

async function guardarPartido() {
  const nota = document.getElementById('match-nota').value.trim();
  const resultado = await finalizeMatch(currentMatchId, nota);

  document.getElementById('resumen-resultado').textContent = resultado;

  const auto = document.getElementById('chk-autosync-match').checked;
  if (auto && navigator.onLine) {
    const url = await Sheets.getScriptUrl();
    if (Sheets.isConfigured(url)) {
      try {
        await Sheets.pushMatch(currentMatchId);
        toast('Partido guardado y sincronizado');
        goTo('partido-historial');
        return;
      } catch (e) {
        toast('Guardado localmente; no se pudo sincronizar todavia');
      }
    }
  } else {
    toast('Partido guardado en el celular');
  }
  goTo('partido-historial');
}

/* -------- Historial -------- */

async function renderHistorialPartidos() {
  const matches = await getMatches();
  const wrap = document.getElementById('historial-partidos-wrap');
  const empty = document.getElementById('historial-partidos-empty');

  if (!matches.length) {
    empty.style.display = 'block';
    wrap.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  wrap.innerHTML = matches.map(m => {
    const cls = m.syncStatus === 'synced' ? 'synced' : m.syncStatus === 'syncing' ? 'syncing' : 'pending';
    const label = m.syncStatus === 'synced' ? 'Sincronizado' : m.syncStatus === 'syncing' ? 'Sincronizando...' : 'Pendiente';
    return `
      <div class="list-item">
        <div class="head" onclick="openMatch(${m.id})">
          <div class="info">
            <div class="t">UDN Sport vs ${escapeHtml(m.rival)}</div>
            <div class="d">${formatFecha(m.fecha)} · ${m.golesUdn}-${m.golesRival} · ${m.resultado || 'En curso'}</div>
          </div>
          <span class="badge ${cls}">${label}</span>
        </div>
        <div class="row btn-block-gap">
          <button class="btn btn-ghost btn-sm" onclick="syncSingleMatch(${m.id})">
            <i class="ti ti-refresh"></i> Sincronizar
          </button>
          <button class="btn btn-danger-outline btn-sm" onclick="confirmDeleteMatch(${m.id})">
            <i class="ti ti-trash"></i> Eliminar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function openMatch(matchId) {
  currentMatchId = matchId;
  editingExistingMatch = true;
  const match = await getMatch(matchId);

  document.getElementById('match-rival').value = match.rival;
  document.getElementById('match-cat').value = match.categoria;
  document.getElementById('match-fecha').value = match.fecha;
  document.getElementById('match-hora').value = match.hora;
  document.getElementById('match-cancha').value = match.cancha || '';
  document.getElementById('match-sistema').value = match.sistema;
  document.getElementById('match-duracion').value = match.duracionTiempo;
  window.__registradorMatch = { rol: match.registradorRol, nombre: match.registradorNombre };

  crono = { running: false, phase: 'Primer tiempo', accumulatedMs: 0, startTs: null, tickHandle: null, alargue: false };

  goTo('partido-alineacion');
}

async function syncSingleMatch(matchId) {
  const url = await Sheets.getScriptUrl();
  if (!Sheets.isConfigured(url)) { toast('Primero configura el enlace de Google Sheets'); return; }
  if (!navigator.onLine) { toast('Sin conexion a internet'); return; }

  await db.matches.update(matchId, { syncStatus: 'syncing' });
  await renderHistorialPartidos();
  try {
    await Sheets.pushMatch(matchId);
    toast('Partido sincronizado con Google Sheets');
  } catch (e) {
    await db.matches.update(matchId, { syncStatus: 'pending' });
    toast('No se pudo sincronizar: ' + friendlyMatchError(e));
  }
  await renderHistorialPartidos();
}

async function syncAllPendingMatchesNow() {
  const url = await Sheets.getScriptUrl();
  if (!Sheets.isConfigured(url)) { toast('Primero configura el enlace de Google Sheets'); return; }
  if (!navigator.onLine) { toast('Sin conexion a internet'); return; }
  toast('Sincronizando partidos pendientes...');
  const result = await Sheets.pushAllPendingMatches();
  if (result.total === 0) { toast('No hay partidos pendientes'); return; }
  toast(`Sincronizados ${result.done} de ${result.total}${result.failed ? ' (' + result.failed + ' fallaron)' : ''}`);
  await renderHistorialPartidos();
}

async function confirmDeleteMatch(matchId) {
  const match = await getMatch(matchId);
  const isSynced = match && match.syncStatus === 'synced';
  const warning = isSynced
    ? 'Este partido ya esta sincronizado (los datos ya estan seguros en Sheets). ¿Eliminarlo del celular?'
    : 'Este partido TODAVIA NO se ha sincronizado. Si lo eliminas ahora, se pierde para siempre. ¿Eliminarlo de todas formas?';
  if (!confirm(warning)) return;
  await deleteMatch(matchId);
  toast('Partido eliminado');
  await renderHistorialPartidos();
  await enterPartidoHome();
}

async function deleteAllSyncedMatchesNow() {
  const n = await deleteAllSyncedMatches();
  toast(n ? `${n} partido(s) sincronizado(s) eliminado(s)` : 'No hay partidos sincronizados para eliminar');
  await renderHistorialPartidos();
  await enterPartidoHome();
}

function friendlyMatchError(e) {
  const msg = e && e.message;
  if (msg === 'OFFLINE') return 'sin conexion';
  if (msg === 'NO_CONFIG') return 'falta configurar el enlace';
  return 'intenta de nuevo';
}

function formatFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
