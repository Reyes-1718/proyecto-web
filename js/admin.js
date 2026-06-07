import { db } from './firebase.js';
import { iniciarSesion, cerrarSesion, escucharAuth } from './auth.js';
import {
  collection, doc, setDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const loginSection = document.getElementById('login-section');
const adminSection = document.getElementById('admin-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const buscarInput = document.getElementById('buscar-numero');
const resultadoDiv = document.getElementById('resultado-busqueda');
const statsVendidos = document.getElementById('stats-vendidos');
const statsDisponibles = document.getElementById('stats-disponibles');

const TOTAL = 2000;
const vendidosMap = new Map();
let unsubscribeFirestore = null;

// Escuchar estado de autenticación
escucharAuth((user) => {
  if (user) {
    loginSection.classList.add('hidden');
    adminSection.classList.remove('hidden');
    iniciarPanel();
  } else {
    loginSection.classList.remove('hidden');
    adminSection.classList.add('hidden');
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }
  }
});

// Login
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const btn = loginForm.querySelector('button[type="submit"]');

  loginError.textContent = '';
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

// Búsqueda de número
buscarInput?.addEventListener('input', () => {
  const val = buscarInput.value.trim();
  if (!val) { resultadoDiv.innerHTML = ''; return; }

  const num = parseInt(val);
  if (isNaN(num) || num < 1 || num > TOTAL) {
    resultadoDiv.innerHTML = '<p class="busqueda-error">Número inválido (1 – 2000)</p>';
    return;
  }

  mostrarResultado(num);
});

function mostrarResultado(num) {
  const id = String(num);
  const estado = vendidosMap.has(id) ? 'vendido' : 'disponible';
  const etiqueta = estado === 'vendido' ? 'Vendido' : 'Disponible';
  const accion = estado === 'vendido' ? 'Marcar como disponible' : 'Marcar como vendido';

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

  try {
    await setDoc(doc(db, 'numeros', id), { id: Number(id), estado: nuevoEstado });
    // El onSnapshot actualizará el mapa y mostrará el resultado fresco
  } catch (err) {
    alert('Error al actualizar: ' + err.message);
    btn.disabled = false;
    btn.textContent = estadoActual === 'vendido' ? 'Marcar como disponible' : 'Marcar como vendido';
  }
}

// Escucha en tiempo real para el panel admin
function iniciarPanel() {
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
    statsDisponibles.textContent = TOTAL - vendidosMap.size;

    // Refrescar resultado de búsqueda activa
    const val = buscarInput?.value.trim();
    if (val) {
      const num = parseInt(val);
      if (!isNaN(num) && num >= 1 && num <= TOTAL) mostrarResultado(num);
    }
  });
}

function traducirError(code) {
  const mapa = {
    'auth/invalid-email': 'Email inválido.',
    'auth/user-not-found': 'Usuario no encontrado.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Credenciales incorrectas.',
    'auth/too-many-requests': 'Demasiados intentos. Intentá más tarde.',
  };
  return mapa[code] || 'Error al iniciar sesión.';
}
