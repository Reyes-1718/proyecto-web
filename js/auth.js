import { auth, authSecundaria } from './firebase.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

export async function iniciarSesion(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function cerrarSesion() {
  return signOut(auth);
}

export function escucharAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// Crea una cuenta Firebase Auth para un vendedor sin afectar la sesión activa del admin
export async function crearCuentaVendedor(email, password) {
  const cred = await createUserWithEmailAndPassword(authSecundaria, email, password);
  await signOut(authSecundaria);
  return cred.user;
}
