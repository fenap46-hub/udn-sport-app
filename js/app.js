// app.js — Navegacion principal y utilidades de interfaz.

let editingExisting = false;
let currentListId = null;
let currentFilter = 'Todos';
let currentRol = 'Entrenador';

const screenTitles = {
  menu:        ['UDN Sport', 'Menu principal'],
  partido:     ['Gestion de partidos', 'Modulo en desarrollo'],
  'asis-home': ['Control de asistencia', 'Elige una opcion'],
  rol:         ['Nuevo registro', 'Quien esta registrando'],
  step1:       ['Nuevo registro', 'Datos del evento'],
  step2:       ['Registro de asistencia', 'Lista de jugadores'],
  listas:      ['Listas guardadas', 'Toca una para ver o editar'],
  config:      ['Configuracion', 'Conexion con Google Sheets']
};

const backMap = {
  'asis-home': 'menu',
  partido: 'menu',
  rol: 'asis-home',
  step1: 'rol',
  step2: () => editingExisting ? 'listas' : 'step1',
  listas: 'asis-home',
  config: 'menu'
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('scr-' + id).classList.add('active');

  const [title, sub] = screenTitles[id];
  document.getElementById('hdr-title').textContent = title;
  document.getElementById('hdr-sub').textContent = sub;
  document.getElementById('back-btn').classList.toggle('show', id !== 'menu');
  document.getElementById('settings-btn').style.display = id === 'menu' ? 'flex' : 'none';

  window.__currentScreen = id;
}

async function goTo(id) {
  if (id === 'asis-home') await refreshAsisHomeCount();
  if (id === 'step2') await enterStep2();
  if (id === 'listas') await renderListas();
  if (id === 'config') await enterConfig();
  showScreen(id);
}

function goBack() {
  const cur = window.__currentScreen;
  let target = backMap[cur] || 'menu';
  if (typeof target === 'function') target = target();
  goTo(target);
}

function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function updateConnDot() {
  const dot = document.getElementById('conn-dot');
  if (!dot) return;
  dot.classList.toggle('online', navigator.onLine);
  dot.classList.toggle('offline', !navigator.onLine);
}
window.addEventListener('online', updateConnDot);
window.addEventListener('offline', updateConnDot);

async function refreshAsisHomeCount() {
  const n = await db.lists.count();
  const pending = await getPendingListsCount();
  document.getElementById('count-listas').textContent = n;
  document.getElementById('count-pendientes').textContent = pending;
  document.getElementById('pendientes-row').style.display = pending > 0 ? 'flex' : 'none';
  await renderRosterFreshness();
}

async function renderRosterFreshness() {
  const el = document.getElementById('roster-freshness');
  if (!el) return;
  const last = await getSetting('lastRosterSync', null);
  const rosterCount = await db.roster.count();

  if (!last) {
    el.innerHTML = `<i class="ti ti-alert-triangle"></i> Nunca se ha sincronizado el roster. Ve a Configuracion.`;
    el.className = 'roster-freshness warn';
    return;
  }

  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  const when = days === 0 ? 'hoy' : days === 1 ? 'hace 1 dia' : `hace ${days} dias`;
  el.textContent = `Jugadores (${rosterCount}) actualizados: ${when}`;
  el.className = 'roster-freshness' + (days >= 7 ? ' warn' : '');
}

/* -------- Inicio -------- */

async function initApp() {
  await seedDemoRosterIfEmpty();
  updateConnDot();
  showScreen('menu');

  document.getElementById('back-btn').addEventListener('click', goBack);
  document.getElementById('settings-btn').addEventListener('click', () => goTo('config'));

  // registrar service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Sincronizacion silenciosa: si hay internet y el enlace de Sheets ya
  // esta configurado, intenta traer el roster mas reciente en segundo
  // plano al abrir la app, sin bloquear ni interrumpir al entrenador.
  trySilentRosterSync();
}

async function trySilentRosterSync() {
  if (!navigator.onLine) return;
  const url = await Sheets.getScriptUrl();
  if (!Sheets.isConfigured(url)) return;
  try {
    await Sheets.pullRoster();
  } catch (e) {
    // Fallo silencioso: si algo sale mal (sin señal, error del script),
    // simplemente se sigue usando el roster que ya estaba guardado.
  }
}

document.addEventListener('DOMContentLoaded', initApp);
