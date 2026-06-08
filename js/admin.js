import { db, auth } from './firebase.js';
import { iniciarSesion, cerrarSesion, escucharAuth, crearCuentaVendedor } from './auth.js';
import { validarReduccionBoletos } from './reglas.js';
import {
  collection, doc, setDoc, getDoc, updateDoc, addDoc,
  onSnapshot, query, where, serverTimestamp, runTransaction, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── DOM refs ──────────────────────────────────────
const loginSection       = document.getElementById('login-section');
const adminSection       = document.getElementById('admin-section');
const loginForm          = document.getElementById('login-form');
const loginError         = document.getElementById('login-error');
const logoutBtn          = document.getElementById('logout-btn');
const buscarInput        = document.getElementById('buscar-numero');
const resultadoDiv       = document.getElementById('resultado-busqueda');
const statsVendidos      = document.getElementById('stats-vendidos');
const statsDisponibles   = document.getElementById('stats-disponibles');
const statsPendientes    = document.getElementById('stats-pendientes');
const statsTotal         = document.getElementById('stats-total');
const inactividadOverlay = document.getElementById('inactividad-overlay');
const inactividadCuenta  = document.getElementById('inactividad-cuenta');
const btnMantenerSesion  = document.getElementById('btn-mantener-sesion');
const inputTotal         = document.getElementById('input-total');
const inputPrecio        = document.getElementById('input-precio');
const btnGuardarConfig   = document.getElementById('btn-guardar-config');
const btnGuardarPrecio   = document.getElementById('btn-guardar-precio');
const configStatus       = document.getElementById('config-status');
const badgePendientes    = document.getElementById('badge-pendientes');
const listaPendientes    = document.getElementById('lista-pendientes');
const vendedoresTbody    = document.getElementById('vendedores-tbody');
const btnNuevoVendedor   = document.getElementById('btn-nuevo-vendedor');
const modalVendedor      = document.getElementById('modal-vendedor');
const formVendedor       = document.getElementById('form-vendedor');
const btnCancelarVendedor = document.getElementById('btn-cancelar-vendedor');
const btnSubmitVendedor  = document.getElementById('btn-submit-vendedor');
const errorVendedor      = document.getElementById('error-vendedor');
const tituloModalVendedor = document.getElementById('modal-vendedor-titulo');
const camposAuth         = document.getElementById('campos-auth');
const camposComision     = document.getElementById('campos-comision');
const chkTieneComisiones = document.getElementById('v-tiene-comisiones');

// ── Estado global ─────────────────────────────────
let totalBoletos  = 2000;
let precioBoleto  = 0;
const numerosStateMap = new Map(); // id → { estado, vendedorId }
const unsubscribes = [];
let editandoVendedorUid = null; // null = crear, uid = editar

const CONFIG_DOC = doc(db, 'config', 'sorteo');

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

// ── Tabs ──────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`)?.classList.remove('hidden');
  });
});

// ── Configuración ─────────────────────────────────
async function cargarConfig() {
  try {
    const snap = await getDoc(CONFIG_DOC);
    if (snap.exists()) {
      totalBoletos = snap.data().total   || 2000;
      precioBoleto = snap.data().precio  || 0;
    }
  } catch (err) {
    console.error('Error al cargar config:', err);
  }
  actualizarUIConfig();
}

function actualizarUIConfig() {
  if (inputTotal)  inputTotal.value  = totalBoletos;
  if (inputPrecio) inputPrecio.value = precioBoleto;
  if (statsTotal)  statsTotal.textContent = totalBoletos;
  if (buscarInput) {
    buscarInput.placeholder = `Ingresá un número del 1 al ${totalBoletos}`;
    buscarInput.max = totalBoletos;
  }
  actualizarStatsAdmin();
}

function actualizarStatsAdmin() {
  let vendidos    = 0;
  let noDisponibles = 0;
  numerosStateMap.forEach((entry) => {
    if (entry.estado === 'vendido') vendidos++;
    if (entry.estado !== 'disponible') noDisponibles++;
  });
  statsVendidos.textContent    = vendidos;
  statsDisponibles.textContent = totalBoletos - noDisponibles;
}

btnGuardarConfig?.addEventListener('click', async () => {
  const val = parseInt(inputTotal?.value);
  if (isNaN(val) || val < 1 || val > 99999) {
    mostrarConfigStatus('Ingresá un número entre 1 y 99.999.', 'error');
    return;
  }

  // Validar reducción: boletos comprometidos fuera del nuevo rango bloquean el cambio
  if (val < totalBoletos) {
    const boletos = [];
    numerosStateMap.forEach((entry, id) => boletos.push({ numero: Number(id), estado: entry.estado }));
    const resultado = validarReduccionBoletos({ totalActual: totalBoletos, nuevoTotal: val, boletos });
    if (!resultado.puedeReducir) {
      mostrarConfigStatus(resultado.mensaje, 'error');
      return;
    }
  }

  await guardarConfigField('total', val, () => {
    totalBoletos = val;
    actualizarUIConfig();
    mostrarConfigStatus('Total actualizado.', 'ok');
  });
});

btnGuardarPrecio?.addEventListener('click', async () => {
  const val = parseFloat(inputPrecio?.value);
  if (isNaN(val) || val < 0) {
    mostrarConfigStatus('Ingresá un precio válido.', 'error');
    return;
  }
  await guardarConfigField('precio', val, () => {
    precioBoleto = val;
    mostrarConfigStatus('Precio actualizado.', 'ok');
  });
});

async function guardarConfigField(campo, valor, onSuccess) {
  const btn = campo === 'total' ? btnGuardarConfig : btnGuardarPrecio;
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    await setDoc(CONFIG_DOC, { [campo]: valor }, { merge: true });
    onSuccess();
    setTimeout(() => { if (configStatus) configStatus.textContent = ''; }, 3000);
  } catch (err) {
    mostrarConfigStatus('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

function mostrarConfigStatus(msg, tipo) {
  if (!configStatus) return;
  // El mensaje puede incluir \n para listar boletos bloqueantes
  configStatus.innerHTML = msg.replace(/\n/g, '<br>');
  configStatus.className = `config-status ${tipo}`;
}

// ── Auth ──────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

escucharAuth(async (user) => {
  if (user) {
    // Verificar si es vendedor → redirigir a su panel
    try {
      const vendedorSnap = await getDoc(doc(db, 'vendedores', user.uid));
      if (vendedorSnap.exists()) {
        window.location.href = 'vendedor.html';
        return;
      }
    } catch (_) { /* sin conexión: continuar como admin */ }

    loginSection.classList.add('hidden');
    adminSection.classList.remove('hidden');
    iniciarPanel();
  } else {
    detenerInactividad();
    unsubscribes.forEach(u => u());
    unsubscribes.length = 0;
    loginSection.classList.remove('hidden');
    adminSection.classList.add('hidden');
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
    loginError.textContent = traducirError(err.code);
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

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

const ETIQUETAS_ESTADO = {
  disponible:            'Disponible',
  vendido:               'Vendido',
  pendiente_aprobacion:  'Pendiente de aprobación',
  reservado:             'Reservado',
  cancelado:             'Cancelado',
};

function mostrarResultado(num) {
  const id           = String(num);
  const estadoReal   = numerosStateMap.get(id)?.estado || 'disponible';
  const esDisponible = estadoReal === 'disponible';
  const esVendido    = estadoReal === 'vendido';
  // Para el CSS el card solo diferencia disponible vs no-disponible
  const claseCard    = esDisponible ? 'disponible' : 'vendido';
  const etiqueta     = ETIQUETAS_ESTADO[estadoReal] || estadoReal;

  // Solo el admin puede forzar toggle en disponible ↔ vendido
  const botonToggle = (esDisponible || esVendido)
    ? `<button class="btn-toggle" data-id="${id}" data-estado="${estadoReal}">
         ${esVendido ? 'Marcar como disponible' : 'Marcar como vendido'}
       </button>`
    : `<span class="resultado-estado" style="font-size:0.72rem;color:var(--accent-gold)">
         Ver pestaña Pendientes
       </span>`;

  resultadoDiv.innerHTML = `
    <div class="resultado-card ${claseCard}">
      <span class="resultado-numero">${String(num)}</span>
      <span class="resultado-estado">${etiqueta}</span>
      ${botonToggle}
    </div>
  `;

  resultadoDiv.querySelector('.btn-toggle')?.addEventListener('click', toggleNumero);
}

async function toggleNumero(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const estadoActual = btn.dataset.estado;
  const nuevoEstado  = estadoActual === 'vendido' ? 'disponible' : 'vendido';

  btn.disabled = true;
  btn.textContent = 'Guardando...';
  resultadoDiv.querySelector('.busqueda-error')?.remove();

  // Capturar vendedorId antes de limpiar el boleto (solo al revertir)
  const vendedorIdAnterior = estadoActual === 'vendido'
    ? (numerosStateMap.get(id)?.vendedorId || null)
    : null;

  try {
    await setDoc(doc(db, 'numeros', id), {
      id: Number(id),
      estado: nuevoEstado,
      vendedorId: null,
      compradorNombre: null,
      fechaReserva: null
    });

    // Actualizar mapa local inmediatamente para que recalcularStatsVendedor use el estado nuevo
    numerosStateMap.set(id, { estado: nuevoEstado, vendedorId: null });

    // Si el boleto pertenecía a un vendedor, sincronizar sus stats en Firestore
    if (vendedorIdAnterior) {
      await recalcularStatsVendedor(vendedorIdAnterior);
    }

    actualizarStatsAdmin();
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

// ── Recálculo de stats del vendedor ──────────────
async function recalcularStatsVendedor(uid) {
  try {
    // totalVendidos: contar desde el mapa local (ya actualizado)
    let totalVendidos = 0;
    numerosStateMap.forEach((entry) => {
      if (entry.estado === 'vendido' && entry.vendedorId === uid) totalVendidos++;
    });

    // totalGanancias: usar configuración vigente del vendedor + totalVendidos
    const vendedorSnap = await getDoc(doc(db, 'vendedores', uid));
    if (!vendedorSnap.exists()) return;
    const v = vendedorSnap.data();
    const totalGanancias = (v.tieneComisiones !== false)
      ? calcularComision(v.comisionTipo, v.comisionValor, precioBoleto) * totalVendidos
      : 0;

    await updateDoc(doc(db, 'vendedores', uid), { totalVendidos, totalGanancias });
  } catch (err) {
    console.error('Error al recalcular stats del vendedor:', err);
  }
}

// ── Panel de pendientes ───────────────────────────
function calcularComision(tipo, valor, precio) {
  if (tipo === 'fija')       return valor;
  if (tipo === 'porcentaje') return (precio * valor) / 100;
  return 0;
}

function renderizarPendientes(pendientes) {
  if (!listaPendientes) return;
  if (pendientes.length === 0) {
    listaPendientes.innerHTML = '<p class="no-data">No hay boletos pendientes de aprobación.</p>';
    return;
  }

  listaPendientes.innerHTML = pendientes.map(({ id, data }) => {
    const usaComisiones = data.tieneComisiones !== false;
    const comisionEst   = usaComisiones
      ? calcularComision(data.comisionTipo, data.comisionValor, data.precioBoleto).toFixed(2)
      : null;
    const fecha = data.fechaCreacion?.toDate?.()?.toLocaleDateString('es-AR') ?? '—';
    const lineaPrecio = usaComisiones
      ? `<p><span class="detalle-label">Precio:</span> $${data.precioBoleto} &nbsp;|&nbsp; Comisión est.: $${comisionEst}</p>`
      : `<p><span class="detalle-label">Precio:</span> $${data.precioBoleto}</p>`;
    return `
      <div class="pendiente-card">
        <div class="pendiente-numero">${data.numeroId}</div>
        <div class="pendiente-detalles">
          <p><span class="detalle-label">Comprador:</span> ${data.compradorNombre || '—'}</p>
          <p><span class="detalle-label">Vendedor:</span> ${data.vendedorNombre}</p>
          <p><span class="detalle-label">Fecha:</span> ${fecha}</p>
          ${lineaPrecio}
        </div>
        <div class="pendiente-acciones">
          <button class="btn-aprobar"  data-id="${id}" data-numero="${data.numeroId}" data-vendedor="${data.vendedorId}" data-tipo="${data.comisionTipo}" data-valor="${data.comisionValor}" data-precio="${data.precioBoleto}" data-tiene-comisiones="${usaComisiones}">Aprobar</button>
          <button class="btn-rechazar" data-id="${id}" data-numero="${data.numeroId}">Rechazar</button>
        </div>
      </div>
    `;
  }).join('');

  listaPendientes.querySelectorAll('.btn-aprobar').forEach(btn => {
    btn.addEventListener('click', () => aprobarVenta(btn.dataset));
  });
  listaPendientes.querySelectorAll('.btn-rechazar').forEach(btn => {
    btn.addEventListener('click', () => rechazarVenta(btn.dataset.id, btn.dataset.numero));
  });
}

async function aprobarVenta(d) {
  const usaComisiones = d.tieneComisiones !== 'false';
  const comision      = usaComisiones
    ? calcularComision(d.tipo, parseFloat(d.valor), parseFloat(d.precio))
    : 0;
  const numeroRef   = doc(db, 'numeros', d.numero);
  const ventaRef    = doc(db, 'ventas', d.id);
  const vendedorRef = doc(db, 'vendedores', d.vendedor);

  try {
    await runTransaction(db, async (txn) => {
      txn.update(numeroRef, { estado: 'vendido', fechaVenta: serverTimestamp() });
      txn.update(ventaRef, { estado: 'aprobada', comision, fechaAprobacion: serverTimestamp() });
    });
    const statsUpdate = usaComisiones
      ? { totalVendidos: increment(1), totalGanancias: increment(comision) }
      : { totalVendidos: increment(1) };
    await updateDoc(vendedorRef, statsUpdate);
  } catch (err) {
    alert('Error al aprobar: ' + err.message);
  }
}

async function rechazarVenta(ventaId, numeroId) {
  const numeroRef = doc(db, 'numeros', numeroId);
  const ventaRef  = doc(db, 'ventas', ventaId);

  try {
    await runTransaction(db, async (txn) => {
      txn.set(numeroRef, { id: Number(numeroId), estado: 'disponible', vendedorId: null, compradorNombre: null, fechaReserva: null });
      txn.update(ventaRef, { estado: 'rechazada' });
    });
  } catch (err) {
    alert('Error al rechazar: ' + err.message);
  }
}

// ── Panel de vendedores ───────────────────────────
function renderizarVendedores(vendedores) {
  if (!vendedoresTbody) return;
  if (vendedores.length === 0) {
    vendedoresTbody.innerHTML = '<tr><td colspan="8" class="no-data">No hay vendedores registrados.</td></tr>';
    return;
  }

  vendedoresTbody.innerHTML = vendedores.map(({ uid, data }) => {
    const usaComisiones = data.tieneComisiones !== false;
    const comisionStr   = usaComisiones
      ? (data.comisionTipo === 'fija' ? `$${data.comisionValor}` : `${data.comisionValor}%`)
      : '—';
    const estadoClass = data.estado === 'activo' ? 'badge-activo' : 'badge-inactivo';
    // Calcular desde el mapa local para reflejar siempre el estado real actual
    const totalVendidos = [...numerosStateMap.values()]
      .filter(e => e.estado === 'vendido' && e.vendedorId === uid)
      .length;
    const gananciasBruto = usaComisiones
      ? calcularComision(data.comisionTipo, data.comisionValor, precioBoleto) * totalVendidos
      : 0;
    const ganancias = usaComisiones ? `$${gananciasBruto.toFixed(2)}` : '—';
    return `
      <tr>
        <td data-label="Nombre">${data.nombre}</td>
        <td data-label="Contacto">${data.contacto || '—'}</td>
        <td data-label="Estado"><span class="badge ${estadoClass}">${data.estado}</span></td>
        <td data-label="Comisión">${comisionStr}</td>
        <td data-label="Aprobación">${data.requiereAprobacion ? 'Requerida' : 'No requerida'}</td>
        <td data-label="Vendidos">${totalVendidos}</td>
        <td data-label="Ganancias">${ganancias}</td>
        <td data-label="Acciones" class="acciones-col">
          <button class="btn-ghost btn-sm btn-editar-vendedor" data-uid="${uid}">Editar</button>
          <button class="btn-ghost btn-sm ${data.estado === 'activo' ? 'danger' : ''} btn-toggle-vendedor"
            data-uid="${uid}" data-estado="${data.estado}">
            ${data.estado === 'activo' ? 'Desactivar' : 'Activar'}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  vendedoresTbody.querySelectorAll('.btn-toggle-vendedor').forEach(btn => {
    btn.addEventListener('click', () => toggleEstadoVendedor(btn.dataset.uid, btn.dataset.estado));
  });
  vendedoresTbody.querySelectorAll('.btn-editar-vendedor').forEach(btn => {
    btn.addEventListener('click', () => abrirModalEditar(btn.dataset.uid));
  });
}

async function toggleEstadoVendedor(uid, estadoActual) {
  const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
  try {
    await updateDoc(doc(db, 'vendedores', uid), { estado: nuevoEstado });
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ── Modal de vendedor ─────────────────────────────
btnNuevoVendedor?.addEventListener('click', () => abrirModalCrear());

function abrirModalCrear() {
  editandoVendedorUid = null;
  formVendedor?.reset();
  if (errorVendedor)         errorVendedor.textContent = '';
  if (tituloModalVendedor)   tituloModalVendedor.textContent = 'Nuevo vendedor';
  if (btnSubmitVendedor)     btnSubmitVendedor.textContent = 'Crear vendedor';
  if (camposAuth)            camposAuth.classList.remove('hidden');
  // Por defecto nuevo vendedor usa comisiones → mostrar campos
  if (camposComision)        camposComision.classList.remove('hidden');
  if (chkTieneComisiones)    chkTieneComisiones.checked = true;
  modalVendedor?.classList.remove('hidden');
}

async function abrirModalEditar(uid) {
  editandoVendedorUid = uid;
  if (errorVendedor)       errorVendedor.textContent = '';
  if (tituloModalVendedor) tituloModalVendedor.textContent = 'Editar vendedor';
  if (btnSubmitVendedor)   btnSubmitVendedor.textContent = 'Guardar cambios';
  if (camposAuth)          camposAuth.classList.add('hidden');

  try {
    const snap = await getDoc(doc(db, 'vendedores', uid));
    if (!snap.exists()) return;
    const d = snap.data();
    const tieneComisiones = d.tieneComisiones ?? true;
    document.getElementById('v-nombre').value         = d.nombre || '';
    document.getElementById('v-contacto').value       = d.contacto || '';
    document.getElementById('v-tiene-comisiones').checked    = tieneComisiones;
    document.getElementById('v-comision-tipo').value  = d.comisionTipo || 'porcentaje';
    document.getElementById('v-comision-valor').value = d.comisionValor ?? 0;
    document.getElementById('v-requiere-aprobacion').checked = d.requiereAprobacion ?? true;
    document.getElementById('v-venta-directa').checked       = d.ventaDirecta ?? false;
    camposComision?.classList.toggle('hidden', !tieneComisiones);
  } catch (err) {
    if (errorVendedor) errorVendedor.textContent = 'Error al cargar datos: ' + err.message;
  }

  modalVendedor?.classList.remove('hidden');
}

function cerrarModalVendedor() {
  modalVendedor?.classList.add('hidden');
  editandoVendedorUid = null;
  formVendedor?.reset();
  if (errorVendedor) errorVendedor.textContent = '';
}

btnCancelarVendedor?.addEventListener('click', cerrarModalVendedor);
modalVendedor?.addEventListener('click', (e) => {
  if (e.target === modalVendedor) cerrarModalVendedor();
});

// Toggle visibilidad de campos de comisión
chkTieneComisiones?.addEventListener('change', () => {
  camposComision?.classList.toggle('hidden', !chkTieneComisiones.checked);
});

formVendedor?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (errorVendedor) errorVendedor.textContent = '';

  const nombre             = document.getElementById('v-nombre').value.trim();
  const contacto           = document.getElementById('v-contacto').value.trim();
  const tieneComisiones    = document.getElementById('v-tiene-comisiones').checked;
  const comisionTipo       = tieneComisiones ? document.getElementById('v-comision-tipo').value : null;
  const comisionValorRaw   = parseFloat(document.getElementById('v-comision-valor').value);
  const comisionValor      = tieneComisiones ? comisionValorRaw : 0;
  const requiereAprobacion = document.getElementById('v-requiere-aprobacion').checked;
  const ventaDirecta       = document.getElementById('v-venta-directa').checked;

  if (!nombre) {
    if (errorVendedor) errorVendedor.textContent = 'El nombre es obligatorio.';
    return;
  }
  if (tieneComisiones && (isNaN(comisionValorRaw) || comisionValorRaw < 0)) {
    if (errorVendedor) errorVendedor.textContent = 'Ingresá un valor de comisión válido.';
    return;
  }

  btnSubmitVendedor.disabled = true;
  const textoOriginal = btnSubmitVendedor.textContent;
  btnSubmitVendedor.textContent = 'Guardando...';

  try {
    if (editandoVendedorUid) {
      // Editar vendedor existente (sin cambiar credenciales Auth)
      await updateDoc(doc(db, 'vendedores', editandoVendedorUid), {
        nombre, contacto, tieneComisiones, comisionTipo, comisionValor,
        requiereAprobacion, ventaDirecta
      });
    } else {
      // Crear vendedor nuevo
      const email    = document.getElementById('v-email').value.trim();
      const password = document.getElementById('v-password').value;

      if (!EMAIL_REGEX.test(email)) {
        if (errorVendedor) errorVendedor.textContent = 'Ingresá un email válido.';
        return;
      }
      if (password.length < 6) {
        if (errorVendedor) errorVendedor.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        return;
      }

      const nuevoUser = await crearCuentaVendedor(email, password);
      await setDoc(doc(db, 'vendedores', nuevoUser.uid), {
        nombre, contacto, email,
        estado: 'activo',
        tieneComisiones, comisionTipo, comisionValor,
        requiereAprobacion, ventaDirecta,
        fechaCreacion: serverTimestamp(),
        totalVendidos: 0,
        totalGanancias: 0
      });
    }
    cerrarModalVendedor();
  } catch (err) {
    if (errorVendedor) errorVendedor.textContent = traducirError(err.code) || err.message;
    btnSubmitVendedor.disabled = false;
    btnSubmitVendedor.textContent = textoOriginal;
  } finally {
    if (!btnSubmitVendedor.disabled) return;
    btnSubmitVendedor.disabled = false;
    btnSubmitVendedor.textContent = textoOriginal;
  }
});

// ── Iniciar panel completo ────────────────────────
function iniciarPanel() {
  cargarConfig();
  iniciarInactividad();

  // Listener: numeros — guarda el estado real de cada número
  const unsubNumeros = onSnapshot(collection(db, 'numeros'), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'removed') {
        numerosStateMap.delete(change.doc.id);
      } else {
        const d = change.doc.data();
        numerosStateMap.set(change.doc.id, {
          estado:     d.estado     || 'disponible',
          vendedorId: d.vendedorId || null
        });
      }
    });

    actualizarStatsAdmin();

    const val = buscarInput?.value.trim();
    if (val) {
      const num = parseInt(val);
      if (!isNaN(num) && num >= 1 && num <= totalBoletos) mostrarResultado(num);
    }
  });
  unsubscribes.push(unsubNumeros);

  // Listener: ventas pendientes
  const qPend = query(collection(db, 'ventas'), where('estado', '==', 'pendiente_aprobacion'));
  const unsubPend = onSnapshot(qPend, (snapshot) => {
    const pendientes = [];
    snapshot.forEach(d => pendientes.push({ id: d.id, data: d.data() }));

    const count = pendientes.length;
    if (badgePendientes) {
      badgePendientes.textContent = count;
      badgePendientes.classList.toggle('hidden', count === 0);
    }
    if (statsPendientes) statsPendientes.textContent = count;
    renderizarPendientes(pendientes);
  });
  unsubscribes.push(unsubPend);

  // Listener: vendedores
  const unsubVendedores = onSnapshot(collection(db, 'vendedores'), (snapshot) => {
    const vendedores = [];
    snapshot.forEach(d => vendedores.push({ uid: d.id, data: d.data() }));
    renderizarVendedores(vendedores);
  });
  unsubscribes.push(unsubVendedores);
}

function traducirError(code) {
  const mapa = {
    'auth/invalid-email':          'Email inválido.',
    'auth/user-not-found':         'Usuario no encontrado.',
    'auth/wrong-password':         'Contraseña incorrecta.',
    'auth/invalid-credential':     'Credenciales incorrectas.',
    'auth/too-many-requests':      'Demasiados intentos. Intentá más tarde.',
    'auth/email-already-in-use':   'Ese email ya está registrado.',
    'auth/weak-password':          'La contraseña es demasiado débil.',
  };
  return mapa[code] || null;
}
