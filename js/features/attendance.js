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
    await updateListMeta(currentListId,
