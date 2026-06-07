import { db } from './firebase.js';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let TOTAL = 2000;

// Mapa de estado de los números (fuente de verdad local)
const estadoMap = new Map();
for (let i = 1; i <= TOTAL; i++) estadoMap.set(String(i), 'disponible');

let modoVista = 'disponibles'; // 'disponibles' | 'todos'
let mostrarTodosDisponibles = false;
let datosCargados = false;
let gridDiv = null;

// Referencias al DOM
const gridContainer    = document.getElementById('grid-container');
const loadingState     = document.getElementById('loading-state');
const disponiblesCount = document.getElementById('disponibles-count');
const vendidosCount    = document.getElementById('vendidos-count');
const modalOverlay     = document.getElementById('modal-overlay');
const modalNumero      = document.getElementById('modal-numero');
const modalClose       = document.getElementById('modal-close');
const btnDisponibles   = document.getElementById('filtro-disponibles');
const btnTodos         = document.getElementById('filtro-todos');
const infoGrilla       = document.getElementById('info-grilla');

// Crea el contenedor de la grilla una sola vez
function getOrCreateGrid() {
  if (!gridDiv) {
    loadingState?.remove();
    gridDiv = document.createElement('div');
    gridDiv.className = 'numeros-grid';
    gridDiv.id = 'numeros-grid';
    // Delegación de eventos: un solo listener para toda la grilla
    gridDiv.addEventListener('click', (e) => {
      const cell = e.target.closest('.numero-cell');
      if (!cell || cell.classList.contains('vendido')) return;
      abrirModal(Number(cell.dataset.numero));
    });
    gridContainer.appendChild(gridDiv);
  }
  return gridDiv;
}

// Crea un elemento <button> para un número dado
function crearCelda(num, animIdx = 0) {
  const id = String(num);
  const estado = estadoMap.get(id) || 'disponible';
  const cell = document.createElement('button');
  cell.id = `num-${num}`;
  cell.className = `numero-cell ${estado}`;
  cell.textContent = String(num); // sin zeros a la izquierda
  cell.dataset.numero = id;
  if (estado === 'vendido') cell.disabled = true;
  // Animación escalonada por lotes de 25
  cell.style.animationDelay = `${Math.floor(animIdx / 25) * 20}ms`;
  return cell;
}

// Devuelve array con los números disponibles en orden
function getDisponiblesArray() {
  const arr = [];
  for (let i = 1; i <= TOTAL; i++) {
    if (estadoMap.get(String(i)) !== 'vendido') arr.push(i);
  }
  return arr;
}

// Renderiza solo los disponibles (limitado a 100 por defecto)
function renderizarDisponibles() {
  const grid = getOrCreateGrid();
  const disponibles = getDisponiblesArray();
  const limite = mostrarTodosDisponibles
    ? disponibles.length
    : Math.min(100, disponibles.length);

  const fragment = document.createDocumentFragment();
  disponibles.slice(0, limite).forEach((num, idx) => {
    fragment.appendChild(crearCelda(num, idx));
  });

  grid.innerHTML = '';
  grid.appendChild(fragment);
  actualizarInfoDisponibles(disponibles.length, limite);
}

// Renderiza los 2000 números con sus estados actuales
function renderizarTodos() {
  const grid = getOrCreateGrid();
  const fragment = document.createDocumentFragment();

  for (let i = 1; i <= TOTAL; i++) {
    fragment.appendChild(crearCelda(i, i - 1));
  }

  grid.innerHTML = '';
  grid.appendChild(fragment);
  if (infoGrilla) infoGrilla.innerHTML = '';
}

// Actualiza una celda individual en modo "todos" sin re-renderizar todo
function actualizarCeldaTodos(id) {
  const cell = document.getElementById(`num-${id}`);
  if (!cell) return;

  const estado = estadoMap.get(id) || 'disponible';
  const eraVendido = cell.classList.contains('vendido');
  const esVendido = estado === 'vendido';
  if (eraVendido === esVendido) return;

  cell.className = `numero-cell ${estado}`;
  cell.disabled = esVendido;
  if (esVendido) {
    cell.classList.add('recien-vendido');
    setTimeout(() => cell.classList.remove('recien-vendido'), 700);
  }
}

// Muestra texto y botón "ver más" debajo de la grilla en modo disponibles
function actualizarInfoDisponibles(total, limite) {
  if (!infoGrilla) return;

  if (total === 0) {
    infoGrilla.innerHTML = '<p class="info-texto">No hay números disponibles.</p>';
    return;
  }

  const texto = `<p class="info-texto">Mostrando <strong>${limite}</strong> de <strong>${total}</strong> disponibles.</p>`;

  const boton = (total > 100 && !mostrarTodosDisponibles)
    ? `<button class="btn-ver-mas" id="btn-ver-mas">Ver todos los disponibles (${total})</button>`
    : '';

  infoGrilla.innerHTML = texto + boton;

  document.getElementById('btn-ver-mas')?.addEventListener('click', () => {
    mostrarTodosDisponibles = true;
    renderizarDisponibles();
  });
}

// Actualiza los contadores del header
function actualizarContadores() {
  let vendidos = 0;
  estadoMap.forEach((v) => { if (v === 'vendido') vendidos++; });
  vendidosCount.textContent = vendidos;
  disponiblesCount.textContent = TOTAL - vendidos;
}

// Modal
function abrirModal(numero) {
  modalNumero.textContent = String(numero);
  modalOverlay.classList.add('active');
}

function cerrarModal() {
  modalOverlay.classList.remove('active');
}

// ── Eventos de filtros ────────────────────────────
btnDisponibles?.addEventListener('click', () => {
  if (modoVista === 'disponibles') return;
  modoVista = 'disponibles';
  mostrarTodosDisponibles = false;
  btnDisponibles.classList.add('active');
  btnTodos.classList.remove('active');
  if (datosCargados) renderizarDisponibles();
});

btnTodos?.addEventListener('click', () => {
  if (modoVista === 'todos') return;
  modoVista = 'todos';
  btnTodos.classList.add('active');
  btnDisponibles.classList.remove('active');
  if (datosCargados) renderizarTodos();
});

// ── Carga inicial rápida + escucha en tiempo real ─
async function iniciarEscucha() {
  // 0. Cargar total de boletos desde config
  try {
    const configSnap = await getDoc(doc(db, 'config', 'sorteo'));
    if (configSnap.exists() && configSnap.data().total) {
      TOTAL = configSnap.data().total;
      estadoMap.clear();
      for (let i = 1; i <= TOTAL; i++) estadoMap.set(String(i), 'disponible');
    }
  } catch (err) {
    console.error('Error al cargar config:', err);
  }

  // 1. getDocs: carga HTTP inmediata (no espera WebSocket)
  try {
    const snap = await getDocs(collection(db, 'numeros'));
    snap.forEach((docSnap) => {
      estadoMap.set(docSnap.id, docSnap.data().estado || 'disponible');
    });
  } catch (err) {
    console.error('Error en carga inicial:', err);
  }

  datosCargados = true;
  renderizarDisponibles();
  actualizarContadores();

  // 2. onSnapshot: solo para cambios en tiempo real después de la carga
  onSnapshot(collection(db, 'numeros'), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const id = change.doc.id;
      const nuevoEstado = change.type === 'removed'
        ? 'disponible'
        : (change.doc.data().estado || 'disponible');

      if (estadoMap.get(id) === nuevoEstado) return; // sin cambio real

      estadoMap.set(id, nuevoEstado);
      if (modoVista === 'todos') actualizarCeldaTodos(id);
    });

    if (modoVista === 'disponibles') renderizarDisponibles();
    actualizarContadores();
  }, (error) => {
    console.error('Error en tiempo real:', error);
    gridContainer.insertAdjacentHTML('afterbegin', `
      <p style="color:#e06060;text-align:center;padding:var(--space-md)">
        Sin conexión en tiempo real: ${error.message}
      </p>`);
  });
}

// ── Eventos del modal ─────────────────────────────
modalClose?.addEventListener('click', cerrarModal);
modalOverlay?.addEventListener('click', (e) => {
  if (e.target === modalOverlay) cerrarModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarModal();
});

iniciarEscucha();
