// ─────────────────────────────────────────────────────────────
// Lógica de la página "Acceso pendiente".
//
// Importante: debe ser un script EXTERNO (no inline). La CSP de las
// páginas restringe script-src a 'self' (sin 'unsafe-inline'), por lo
// que un <script> inline quedaría bloqueado por el navegador y el botón
// de cerrar sesión no funcionaría.
// ─────────────────────────────────────────────────────────────

import { auth, db } from './firebase.js';
import {
  signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Ajusta el mensaje de la página según el estado real de la solicitud.
// Las reglas permiten al usuario leer su propio solicitudesAcceso/{uid}.
// Si fue rechazada, hay que avisarle en vez de mostrar el mensaje de espera
// (que daría a entender, erróneamente, que su acceso sigue en revisión).
async function mostrarEstadoSolicitud(uid) {
  let estado = 'pendiente';
  try {
    const snap = await getDoc(doc(db, 'solicitudesAcceso', uid));
    if (snap.exists()) estado = snap.data().estado || 'pendiente';
  } catch (_) {
    // Si la lectura falla, se mantiene el mensaje de espera por defecto.
    return;
  }

  if (estado !== 'rechazada') return;

  // Se usa textContent (no innerHTML) para no introducir riesgo de XSS.
  const pretitle = document.getElementById('estado-pretitle');
  const titulo   = document.getElementById('estado-titulo');
  const desc     = document.getElementById('estado-desc');
  if (pretitle) pretitle.textContent = 'Solicitud revisada';
  if (titulo)   titulo.textContent   = 'Acceso rechazado';
  if (desc)     desc.textContent     =
    'Tu solicitud de acceso fue rechazada por un administrador. ' +
    'Si creés que es un error, contactá al organizador del sorteo.';
}

// Si no hay sesión, no tiene sentido permanecer aquí.
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  mostrarEstadoSolicitud(user.uid);
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});
