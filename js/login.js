// ─────────────────────────────────────────────────────────────
// Inicio de sesión con Google + enrutamiento por rol.
//
// Importante: este módulo NO registra su propio onAuthStateChanged.
// Las páginas admin.html y vendedor.html ya tienen su controlador de
// autenticación (admin.js / vendedor.js); duplicar el listener acá
// provocaría condiciones de carrera. Por eso exportamos solo helpers
// que esos controladores invocan.
//
// Modelo de roles (Firestore decide, no Google):
//   admins/{uid}      → administrador (se crea manualmente en Console)
//   vendedores/{uid}  → vendedor (lo crea el admin al aprobar)
//   sin documento     → solicitudesAcceso/{uid} (queda pendiente)
// ─────────────────────────────────────────────────────────────

import { auth, db } from './firebase.js';
import {
  GoogleAuthProvider,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const provider = new GoogleAuthProvider();
// Fuerza el selector de cuenta en cada login (evita reusar sesión silenciosa).
provider.setCustomParameters({ prompt: 'select_account' });

// Inicia el popup de Google. Devuelve el UserCredential.
export async function loginConGoogle() {
  return signInWithPopup(auth, provider);
}

// Traduce los códigos de error más comunes del login con Google a un mensaje
// claro. Incluye el código entre paréntesis para facilitar el diagnóstico.
export function traducirErrorGoogle(code) {
  const mapa = {
    'auth/operation-not-allowed':
      'El proveedor Google no está habilitado en Firebase (Authentication → Sign-in method).',
    'auth/unauthorized-domain':
      'Este dominio no está autorizado. Abrí el sitio desde http://localhost (no 127.0.0.1) o agregá el dominio en Authentication → Settings → Authorized domains.',
    'auth/popup-blocked':
      'El navegador bloqueó la ventana emergente. Permití los popups para este sitio.',
    'auth/network-request-failed':
      'Sin conexión o bloqueado por la red. Revisá tu conexión y la consola por errores de CSP.',
    'auth/internal-error':
      'Error interno de autenticación. Revisá la consola del navegador para más detalle.',
  };
  const base = mapa[code] || 'No se pudo iniciar sesión con Google.';
  return code ? `${base} (${code})` : base;
}

// Crea solicitudesAcceso/{uid} solo si el usuario no tiene rol todavía.
// Las reglas exigen que NO exista doc en admins ni en vendedores, por lo
// que esta función solo debe llamarse cuando ya verificamos esa condición.
export async function crearSolicitudSiNoExiste(user) {
  const ref  = doc(db, 'solicitudesAcceso', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    uid:       user.uid,
    email:     user.email       || '',
    nombre:    user.displayName  || '',
    fotoURL:   user.photoURL     || '',
    estado:    'pendiente',
    createdAt: serverTimestamp()
  });
}

// Determina el rol real del usuario y redirige a la página que corresponde.
//   - `current` indica la página donde ya estamos ('admin' | 'vendedor'),
//     para no recargar la misma página si el rol coincide.
// Devuelve el rol detectado: 'admin' | 'vendedor' | 'inactivo' | 'pendiente'.
export async function redirigirSegunRol(user, { current } = {}) {
  // 1. ¿Administrador?
  const adminSnap = await getDoc(doc(db, 'admins', user.uid));
  if (adminSnap.exists()) {
    if (current !== 'admin') window.location.href = 'admin.html';
    return 'admin';
  }

  // 2. ¿Vendedor?
  const vendedorSnap = await getDoc(doc(db, 'vendedores', user.uid));
  if (vendedorSnap.exists()) {
    if (vendedorSnap.data().estado === 'activo') {
      if (current !== 'vendedor') window.location.href = 'vendedor.html';
      return 'vendedor';
    }
    // Vendedor existente pero desactivado: ya tiene doc, no se crea solicitud.
    window.location.href = 'pendiente.html';
    return 'inactivo';
  }

  // 3. Sin rol: registrar solicitud de acceso y enviar a la página de espera.
  await crearSolicitudSiNoExiste(user);
  window.location.href = 'pendiente.html';
  return 'pendiente';
}
