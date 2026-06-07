import { db } from './firebase.js';
import { iniciarSesion, cerrarSesion, escucharAuth } from './auth.js';
import {
  collection, doc, setDoc, getDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── DOM refs ──────────────────────────────────────
const loginSection      = document.getElementById('login-section');
const adminSection      = document.getElementById('admin-section');
const loginForm         = document.getElementById('login-form');
const loginError        = document.getElementById('login-error');
const logoutBtn         = document.getElementById('logout-btn');
const buscarInput       = document.getElementById('buscar-numero');
const resultadoDiv      = document.getElementById('resultado-busqueda');
const statsVendidos     = document.getElementById('stats-vendidos');
const statsDisponibles  = document.getElementById('stats-disponibles');
const statsTotal        = document.getElementById('stats-total');
const inactividadOverlay = document.getElementById('inactividad-overlay');
const inactividadCuenta  = document.getElementById('inactividad-cuenta');
const btnMantenerSesion  = document.getElementById('btn-mantener-sesion');
const inputTotal        = document.getElementById('input-total');
const btnGuardarConfig  = document.getElementById('btn-guardar-config');
const configStatus      = document.getElementById('config-status');

// ── Estado global ─────────────────────────────────
let totalBoletos = 2000;
const vendidosMap = new Map();
let unsubscribeFirestore = null;

const CONFIG_DOC = doc(db, 'config', 'sorteo');

// ── Cierre por inactividad ────────────────────────
const INACTIVIDAD_TIMEOUT = 10 * 60 * 1000; // 10 min sin actividad
const INACTIVIDAD_AVISO   = 60 * 1000;      // aviso 60 seg antes del cierre

let timerInactividad    = null;
let timerCierre         = null;
let cuentaAtrasInterval = null;
let inactividadActiva   = false;
let avisandoInactividad = false; // true mientras el modal de aviso está visible

const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

function resetearInactividad() {
  // Ignorar eventos de usuario mientras el aviso está en pantalla
  if (!inactividadActiva || avisandoInactividad) return;
  clearTimeout(timerInactividad);
  programarInactividad();
}

function programarInactividad() {
  timerInactividad = setTimeout(mostrarAvisoInactividad, INACTIVIDAD_TIMEOUT - INACTIVIDAD_AVISO);
}

function mostrarAvisoInactividad() {
  avisandoInactividad = true;
  inactividadOverlay?.classList.remove('hidden');
  let segundos = Math.floor(INACTIVIDAD_AVISO / 1000);
  if (inactividadCuenta) inactividadCuenta.textContent = segundos;

  clearInterval(cuentaAtrasInterval);
  cuentaAtrasInterval = setInterval(() => {
    segundos--;
    if (inactividadCuenta) inactividadCuenta.textContent = Math.max(0, segundos);
    if (segundos <= 0) clearInterval(cuentaAtrasInterval);
  }, 1000);

  // Cerrar sesión automáticamente al expirar el aviso
  timerCierre = setTimeout(async () => {
    clearInterval(cuentaAtrasInterval);
    await cerrarSesion();
  }, INACTIVIDAD_AVISO);
}

function ocultarAvisoInactividad() {
  inactividadOverlay?.classList.add('hidden');
}

function iniciarInactividad() {
  inactividadActiva = true;
  avisandoInactividad = false;
  EVENTOS_ACTIVIDAD.forEach(ev =>
    document.addEventListener(ev, resetearInactividad, { passive: true })
  );
  programarInactividad();
}

function detenerInactividad() {
  inactividadActiva = false;
  avisandoInactividad = false;
  clearTimeout(timerInactividad);
  clearTimeout(timerCierre);
  clearInterval(cuentaAtrasInterval);
  ocultarAvisoInactividad();
  EVENTOS_ACTIVIDAD.forEach(ev =>
    document.removeEventListener(ev, resetearInactividad)
  );
}

btnMantenerSesion?.addEventListener('click', () => {
  // El usuario confirmó que sigue activo — resetear todo manualmente
  clearTimeout(timerCierre);
  clearInterval(cuentaAtrasInterval);
  ocultarAvisoInactividad();
  avisandoInactividad = false;
  programarInactividad();
});

// ── Configuración de boletos ──────────────────────
async function cargarConfig() {
  try {
    const snap = await getDoc(CONFIG_DOC);
    if (snap.exists() && snap.data().total) {
      totalBoletos = snap.data().total;
    }
  } catch (err) {
    console.error('Error al cargar config:', err);
  }
  actualizarUIConfig();
}

function actualizarUIConfig() {
  if (inputTotal)    inputTotal.value = totalBoletos;
  if (statsTotal)    statsTotal.textContent = totalBoletos;
  if (buscarInput) {
    buscarInput.placeholder = `Ingresá un número del 1 al ${totalBoletos}`;
    buscarInput.max = totalBoletos;
  }
  statsDisponibles.textContent = totalBoletos - vendidosMap.size;
}

btnGuardarConfig?.addEventListener('click', async () => {
  const val = parseInt(inputTotal?.value);

  if (isNaN(val) || val < 1 || val > 99999) {
    mostrarConfigStatus('Ingresá un número entre 1 y 99.999.', 'error');
    return;
  }

  btnGuardarConfig.disabled = true;
  btnGuardarConfig.textContent = 'Guardando...';

  try {
    await setDoc(CONFIG_DOC, { total: val });
    totalBoletos = val;
    actualizarUIConfig();
    mostrarConfigStatus('Total actualizado correctamente.', 'ok');
    setTimeout(() => { if (configStatus) configStatus.textContent = ''; }, 3000);
  } catch (err) {
    mostrarConfigStatus('Error al guardar: ' + err.message, 'error');
  } finally {
    btnGuardarConfig.disabled = false;
    btnGuardarConfig.textContent = 'Guardar';
  }
});

function mostrarConfigStatus(msg, tipo) {
  if (!configStatus) return;
  configStatus.textContent = msg;
  configStatus.className = `config-status ${tipo}`;
}

// ── Auth ──────────────────────────────────────────
escucharAuth((user) => {
  if (user) {
    loginSection.classList.add('hidden');
    adminSection.classList.remove('hidden');
    iniciarPanel();
  } else {
    detenerInactividad();
    loginSection.classList.remove('hidden');
    adminSection.classList.add('hidden');
    loginForm?.reset();
    loginError.textContent = '';
    const btn = loginForm?.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }
  }
});

// ── Regex de email RFC-5321 simplificado ──────────
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// Login
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn      = loginForm.querySelector('button[type="submit"]');

  loginError.textContent = '';

  if (!EMAIL_REGEX.test(email)) {
    loginError.textContent = 'Ingresá un email válido.';
    return;
  }
  if (password.length < 6) {
    loginError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Ingresando...';

  try {
    await iniciarSesion(email, password);
  } catch (err) {
    loginError.textContent = traducirError(err.code);
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

// Logout
logoutBtn?.addEventListener('click', async () => {
  await cerrarSesion();
});

// ── Búsqueda de número ────────────────────────────
buscarInput?.addEventListener('input', () => {
  const val = buscarInput.value.trim();
  if (!val) { resultadoDiv.innerHTML = ''; return; }

  const num = parseInt(val);
  if (isNaN(num) || num < 1 || num > totalBoletos) {
    resultadoDiv.innerHTML = `<p class="busqueda-error">Número inválido (1 – ${totalBoletos})</p>`;
    return;
  }

  mostrarResultado(num);
});

function mostrarResultado(num) {
  const id = String(num);
  const estado = vendidosMap.has(id) ? 'vendido' : 'disponible';
  const etiqueta = estado === 'vendido' ? 'Vendido' : 'Disponible';
  const accion   = estado === 'vendido' ? 'Marcar como disponible' : 'Marcar como vendido';

  resultadoDiv.innerHTML = `
    <div class="resultado-card ${estado}">
      <span class="resultado-numero">${String(num)}</span>
      <span class="resultado-estado">${etiqueta}</span>
      <button class="btn-toggle" data-id="${id}" data-estado="${estado}">${accion}</button>
    </div>
  `;

  resultadoDiv.querySelector('.btn-toggle')?.addEventListener('click', toggleNumero);
}

async function toggleNumero(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const estadoActual = btn.dataset.estado;
  const nuevoEstado = estadoActual === 'vendido' ? 'disponible' : 'vendido';

  btn.disabled = true;
  btn.textContent = 'Guardando...';

  resultadoDiv.querySelector('.busqueda-error')?.remove();

  try {
    await setDoc(doc(db, 'numeros', id), { id: Number(id), estado: nuevoEstado });

    if (nuevoEstado === 'vendido') {
      vendidosMap.set(id, 'vendido');
    } else {
      vendidosMap.delete(id);
    }
    statsVendidos.textContent = vendidosMap.size;
    statsDisponibles.textContent = totalBoletos - vendidosMap.size;
    mostrarResultado(Number(id));
  } catch (err) {
    const errorEl = document.createElement('p');
    errorEl.className = 'busqueda-error';
    errorEl.textContent = 'Error al guardar: ' + err.message;
    resultadoDiv.appendChild(errorEl);
    btn.disabled = false;
    btn.textContent = estadoActual === 'vendido' ? 'Marcar como disponible' : 'Marcar como vendido';
  }
}

// ── Panel principal ───────────────────────────────
function iniciarPanel() {
  cargarConfig();
  iniciarInactividad();

  if (unsubscribeFirestore) unsubscribeFirestore();

  const numerosRef = collection(db, 'numeros');

  unsubscribeFirestore = onSnapshot(numerosRef, (snapshot) => {
    vendidosMap.clear();
    snapshot.forEach((docSnap) => {
      if (docSnap.data().estado === 'vendido') {
        vendidosMap.set(docSnap.id, 'vendido');
      }
    });

    statsVendidos.textContent = vendidosMap.size;
    statsDisponibles.textContent = totalBoletos - vendidosMap.size;

    const val = buscarInput?.value.trim();
    if (val) {
      const num = parseInt(val);
      if (!isNaN(num) && num >= 1 && num <= totalBoletos) mostrarResultado(num);
    }
  });
}

function traducirError(code) {
  const mapa = {
    'auth/invalid-email':       'Email inválido.',
    'auth/user-not-found':      'Usuario no encontrado.',
    'auth/wrong-password':      'Contraseña incorrecta.',
    'auth/invalid-credential':  'Credenciales incorrectas.',
    'auth/too-many-requests':   'Demasiados intentos. Intentá más tarde.',
  };
  return mapa[code] || 'Error al iniciar sesión.';
}
