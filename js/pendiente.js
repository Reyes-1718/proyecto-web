// ─────────────────────────────────────────────────────────────
// Lógica de la página "Acceso pendiente".
//
// Importante: debe ser un script EXTERNO (no inline). La CSP de las
// páginas restringe script-src a 'self' (sin 'unsafe-inline'), por lo
// que un <script> inline quedaría bloqueado por el navegador y el botón
// de cerrar sesión no funcionaría.
// ─────────────────────────────────────────────────────────────

import { auth } from './firebase.js';
import {
  signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Si no hay sesión, no tiene sentido permanecer aquí.
onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = 'index.html';
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});
