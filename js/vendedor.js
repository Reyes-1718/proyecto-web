import { db, auth } from './firebase.js';
import { iniciarSesion, cerrarSesion, escucharAuth } from './auth.js';
import { escapeHTML } from './sanitizar.js';
import {
  collection, doc, getDoc, setDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp, runTransaction, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── DOM refs ──────────────────────────────────────
const loginSection       = document.getElementById('login-section');
const vendedorSection    = document.getElementById('vendedor-section');
const loginForm          = document.getElementById('login-form');
const loginError         = document.getElementById('login-error');
const logoutBtn          = document.getElementById('logout-btn');
const vNombreDisplay     = document.getElementById('v-nombre-display');
const vBuscarInput       = document.getElementById('v-buscar-numero');
const vResultadoDiv      = document.getElementById('v-resultado');
const vStatsPendientes   = document.getElementById('v-stats-pendientes');
const vStatsVendidos     = document.getElementById('v-stats-vendidos');
const vStatsGanancias    = document.getElementById('v-stats-ganancias');
const vListaBoletos      = document.getElementById('v-lista-boletos');
const inactividadOverlay = document.getElementById('inactividad-overlay');
const inactividadCuenta  = document.getElementById('inactividad-cuenta');
const btnMantenerSesion  = document.getElementById('btn-mantener-sesion');

// ── Estado ────────────────────────────────────────
let vendedorData  = null;
let configData    = { total: 100, precio: 0 };
const unsubscribes = [];

// ── Inactividad ───────────────────────────────────
const INACTIVIDAD_TIMEOUT = 10 * 60 * 1000;
const INACTIVIDAD_AVISO   = 60 * 1000;

let timerInactividad    = null;
let timerCierre         = null;
let cuentaAtrasInterval = null;
let inactividadActiva   = false;
let avisandoInactividad = false;

const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

function resetearInactividad() {
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
  clearTimeout(timerCierre);
  clearInterval(cuentaAtrasInterval);
  ocultarAvisoInactividad();
  avisandoInactividad = false;
  programarInactividad();
});

// ── Auth ──────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

escucharAuth(async (user) => {
  if (user) {
    try {
      const snap = await getDoc(doc(db, 'vendedores', user.uid));
      if (!snap.exists() || snap.data().estado !== 'activo') {
        await cerrarSesion();
        loginError.textContent = 'Tu cuenta no está habilitada como vendedor.';
        return;
      }
      vendedorData = { uid: user.uid, ...snap.data() };
    } catch (err) {
      loginError.textContent = 'Error al verificar acceso: ' + err.message;
      await cerrarSesion();
      return;
    }

    loginSection.classList.add('hidden');
    vendedorSection.classList.remove('hidden');
    iniciarPanelVendedor();
    iniciarInactividad();
  } else {
    detenerInactividad();
    unsubscribes.forEach(u => u());
    unsubscribes.length = 0;
    vendedorData = null;
    loginSection.classList.remove('hidden');
    vendedorSection.classList.add('hidden');
    loginForm?.reset();
    loginError.textContent = '';
    const btn = loginForm?.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
  }
});

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
    loginError.textContent = traducirError(err.code) || 'Error al iniciar sesión.';
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

logoutBtn?.addEventListener('click', async () => {
  await cerrarSesion();
});

// ── Panel principal ───────────────────────────────
async function iniciarPanelVendedor() {
  if (vNombreDisplay) vNombreDisplay.textContent = vendedorData.nombre;

  // Cargar config (total y precio)
  try {
    const configSnap = await getDoc(doc(db, 'config', 'sorteo'));
    if (configSnap.exists()) configData = { ...configData, ...configSnap.data() };
  } catch (_) {}

  if (vBuscarInput) {
    vBuscarInput.placeholder = `Número del 1 al ${configData.total || 100}`;
    vBuscarInput.max = configData.total || 100;
  }

  // Ocultar card de ganancias si el vendedor no usa comisiones
  if (vendedorData.tieneComisiones === false) {
    const cardGanancias = document.getElementById('card-ganancias');
    if (cardGanancias) cardGanancias.classList.add('hidden');
  }

  // Listener: todos los numeros → disponibilidad para búsqueda
  const unsubDisponibilidad = onSnapshot(collection(db, 'numeros'), (snap) => {
    snap.docChanges().forEach(change => {
      if (change.type === 'removed') estadosBoletos.delete(change.doc.id);
      else estadosBoletos.set(change.doc.id, change.doc.data().estado || 'disponible');
    });
    // Refrescar resultado si hay una búsqueda activa
    const val = vBuscarInput?.value.trim();
    if (val) {
      const num = parseInt(val);
      if (!isNaN(num) && num >= 1 && num <= (configData.total || 100)) mostrarResultadoVendedor(num);
    }
  });
  unsubscribes.push(unsubDisponibilidad);

  // Listener: mis boletos en tiempo real
  const qBoletos = query(
    collection(db, 'numeros'),
    where('vendedorId', '==', vendedorData.uid)
  );
  const unsubBoletos = onSnapshot(qBoletos, (snapshot) => {
    const boletos = [];
    snapshot.forEach(d => {
      const data = d.data();
      if (data.estado !== 'disponible') boletos.push({ id: d.id, ...data });
    });
    actualizarStats(boletos);
    renderizarMisBoletos(boletos);
  });
  unsubscribes.push(unsubBoletos);
}

function actualizarStats(boletos) {
  let pendientes = 0;
  let vendidos   = 0;

  boletos.forEach(b => {
    if (b.estado === 'pendiente_aprobacion') pendientes++;
    if (b.estado === 'vendido') vendidos++;
  });

  if (vStatsPendientes) vStatsPendientes.textContent = pendientes;
  if (vStatsVendidos)   vStatsVendidos.textContent   = vendidos;

  if (vendedorData.tieneComisiones !== false && vStatsGanancias) {
    let ganancias = 0;
    boletos.forEach(b => {
      if (b.estado === 'vendido') {
        ganancias += calcularComision(vendedorData.comisionTipo, vendedorData.comisionValor, configData.precio || 0);
      }
    });
    vStatsGanancias.textContent = `$${ganancias.toFixed(2)}`;
  }
}

function calcularComision(tipo, valor, precio) {
  if (tipo === 'fija')       return Number(valor);
  if (tipo === 'porcentaje') return (precio * Number(valor)) / 100;
  return 0;
}

function renderizarMisBoletos(boletos) {
  if (!vListaBoletos) return;
  if (boletos.length === 0) {
    vListaBoletos.innerHTML = '<p class="no-data">Todavía no tenés boletos reservados.</p>';
    return;
  }

  const etiquetaEstado = {
    'reservado':             'Reservado',
    'pendiente_aprobacion':  'Pendiente de aprobación',
    'vendido':               'Vendido ✓',
    'cancelado':             'Cancelado',
  };

  // Los datos provenientes de Firestore se escapan antes de interpolarse
  // en el HTML para prevenir XSS almacenado.
  vListaBoletos.innerHTML = boletos
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(b => {
      const estadoClass = b.estado === 'vendido' ? 'estado-vendido'
        : b.estado === 'pendiente_aprobacion' ? 'estado-pendiente' : 'estado-otro';
      const fecha = b.fechaReserva?.toDate?.()?.toLocaleDateString('es-AR') ?? '—';
      const lineaComision = (vendedorData.tieneComisiones !== false && b.estado === 'vendido')
        ? `<p><span class="detalle-label">Mi comisión:</span> $${calcularComision(vendedorData.comisionTipo, vendedorData.comisionValor, configData.precio || 0).toFixed(2)}</p>`
        : '';

      return `
        <div class="pendiente-card">
          <div class="pendiente-numero">${escapeHTML(b.id)}</div>
          <div class="pendiente-detalles">
            <p><span class="detalle-label">Comprador:</span> ${escapeHTML(b.compradorNombre) || '—'}</p>
            <p><span class="detalle-label">Fecha:</span> ${escapeHTML(fecha)}</p>
            ${lineaComision}
          </div>
          <div class="pendiente-acciones">
            <span class="estado-badge ${estadoClass}">${etiquetaEstado[b.estado] || escapeHTML(b.estado)}</span>
          </div>
        </div>
      `;
    }).join('');
}

// ── Búsqueda y reserva de número ──────────────────
let estadosBoletos = new Map(); // caché local
let unsubNumeroActual = null;   // listener del número mostrado actualmente

function limpiarListenerNumero() {
  if (unsubNumeroActual) {
    unsubNumeroActual();
    unsubNumeroActual = null;
  }
}

vBuscarInput?.addEventListener('input', () => {
  const val = vBuscarInput.value.trim();
  if (!val) {
    limpiarListenerNumero();
    vResultadoDiv.innerHTML = '';
    return;
  }

  const num = parseInt(val);
  const total = configData.total || 100;
  if (isNaN(num) || num < 1 || num > total) {
    limpiarListenerNumero();
    vResultadoDiv.innerHTML = `<p class="busqueda-error">Número inválido (1 – ${total})</p>`;
    return;
  }

  mostrarResultadoVendedor(num);
});

function mostrarResultadoVendedor(num) {
  limpiarListenerNumero();

  const id         = String(num);
  const estado     = estadosBoletos.get(id) || 'disponible';
  const disponible = estado === 'disponible';
  const tipoAccion = vendedorData?.ventaDirecta ? 'Vender' : 'Reservar';

  vResultadoDiv.innerHTML = disponible ? `
    <div class="resultado-card disponible">
      <span class="resultado-numero">${num}</span>
      <div class="reserva-form">
        <input type="text" id="v-comprador-nombre" class="buscar-input buscar-input--sm"
          placeholder="Nombre del comprador" maxlength="80">
        <button class="btn-toggle btn-reservar" data-id="${id}">${tipoAccion}</button>
      </div>
    </div>
  ` : `
    <div class="resultado-card vendido">
      <span class="resultado-numero">${num}</span>
      <span class="resultado-estado">No disponible</span>
    </div>
  `;

  if (disponible) {
    vResultadoDiv.querySelector('.btn-reservar')
      ?.addEventListener('click', () => reservarNumero(id));

    // Escucha cambios en tiempo real: si otro vendedor toma este número, actualiza la UI
    unsubNumeroActual = onSnapshot(doc(db, 'numeros', id), (snap) => {
      const estadoActual = snap.exists() ? snap.data().estado : 'disponible';
      if (estadoActual !== 'disponible') {
        limpiarListenerNumero();
        vResultadoDiv.innerHTML = `
          <div class="resultado-card vendido">
            <span class="resultado-numero">${num}</span>
            <span class="resultado-estado">No disponible</span>
          </div>
        `;
      }
    });
  }
}

async function reservarNumero(id) {
  const compradorNombre = document.getElementById('v-comprador-nombre')?.value.trim() || '';
  const btn = vResultadoDiv.querySelector('.btn-reservar');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = 'Procesando...';

  const nuevoEstado     = vendedorData.ventaDirecta ? 'vendido' : 'pendiente_aprobacion';
  const estadoVenta     = vendedorData.ventaDirecta ? 'aprobada' : 'pendiente_aprobacion';
  const precio          = configData.precio || 0;
  const usaComisiones   = vendedorData.tieneComisiones !== false;
  const comision        = (usaComisiones && vendedorData.ventaDirecta)
    ? calcularComision(vendedorData.comisionTipo, vendedorData.comisionValor, precio)
    : 0;

  const numeroRef = doc(db, 'numeros', id);
  const ventaRef  = doc(collection(db, 'ventas'));

  try {
    await runTransaction(db, async (txn) => {
      const numSnap = await txn.get(numeroRef);
      // Si el documento no existe en Firestore, el número está disponible (estado por defecto)
      const estadoActual = numSnap.exists() ? numSnap.data().estado : 'disponible';
      if (estadoActual !== 'disponible') {
        throw new Error('Este número ya no está disponible.');
      }

      txn.set(numeroRef, {
        id: Number(id),
        estado: nuevoEstado,
        vendedorId: vendedorData.uid,
        compradorNombre,
        fechaReserva: serverTimestamp()
      });

      txn.set(ventaRef, {
        numeroId: id,
        vendedorId: vendedorData.uid,
        vendedorNombre: vendedorData.nombre,
        compradorNombre,
        estado: estadoVenta,
        precioBoleto: precio,
        tieneComisiones: usaComisiones,
        comisionTipo: usaComisiones ? vendedorData.comisionTipo : null,
        comisionValor: usaComisiones ? vendedorData.comisionValor : 0,
        comision,
        fechaCreacion: serverTimestamp(),
        fechaAprobacion: vendedorData.ventaDirecta ? serverTimestamp() : null
      });
    });

    // Si es venta directa, actualizar stats del vendedor
    if (vendedorData.ventaDirecta) {
      const statsUpdate = usaComisiones
        ? { totalVendidos: increment(1), totalGanancias: increment(comision) }
        : { totalVendidos: increment(1) };
      await updateDoc(doc(db, 'vendedores', vendedorData.uid), statsUpdate);
    }

    limpiarListenerNumero();
    vBuscarInput.value = '';
    vResultadoDiv.innerHTML = `
      <div class="resultado-card disponible">
        <span class="resultado-estado ok-msg">
          ✓ Número ${id} ${vendedorData.ventaDirecta ? 'vendido' : 'enviado a aprobación'}
        </span>
      </div>
    `;
    setTimeout(() => { vResultadoDiv.innerHTML = ''; }, 4000);

  } catch (err) {
    // err.message puede incluir texto de Firebase: escapar antes de insertar
    vResultadoDiv.innerHTML = `<p class="busqueda-error">${escapeHTML(err.message)}</p>`;
    btn.disabled = false;
    btn.textContent = vendedorData.ventaDirecta ? 'Vender' : 'Reservar';
  }
}

function traducirError(code) {
  const mapa = {
    'auth/invalid-email':       'Email inválido.',
    'auth/user-not-found':      'Usuario no encontrado.',
    'auth/wrong-password':      'Contraseña incorrecta.',
    'auth/invalid-credential':  'Credenciales incorrectas.',
    'auth/too-many-requests':   'Demasiados intentos. Intentá más tarde.',
    'auth/user-disabled':       'Esta cuenta fue deshabilitada.',
    'auth/network-request-failed': 'Sin conexión. Revisá tu red.',
  };
  return mapa[code] || null;
}
