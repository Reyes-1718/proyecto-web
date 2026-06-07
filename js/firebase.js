import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCICJsT7IAq3TZjaMB7fzWPbmJjEJBS6Wo",
  authDomain: "rifa-digital-85131.firebaseapp.com",
  projectId: "rifa-digital-85131",
  storageBucket: "rifa-digital-85131.firebasestorage.app",
  messagingSenderId: "151052023466",
  appId: "1:151052023466:web:b8347ee49b07264f8042d3",
  measurementId: "G-JJXDJ6QEKQ"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
