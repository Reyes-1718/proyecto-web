import { auth } from './firebase.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
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
