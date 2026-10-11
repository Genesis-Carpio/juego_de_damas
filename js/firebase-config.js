/**
 * Configuración de Firebase Realtime Database para Damas Online.
 * 
 * Si usas tu propio proyecto de Firebase:
 * 1. Crea una Realtime Database en la consola de Firebase.
 * 2. Reemplaza los valores con los de tu app web.
 * 3. Habilita las reglas en la consola:
 *    { "rules": { "checkers-rooms": { "$room": { ".read": true, ".write": true } } } }
 */
window.firebaseConfig = {
  apiKey: "AIzaSyAhJBraDyugLzFsE_cPhnUfJ12wI6Fgtc4",
  authDomain: "damas-online-94539.firebaseapp.com",
  databaseURL: "https://damas-online-94539-default-rtdb.firebaseio.com",
  projectId: "damas-online-94539",
  storageBucket: "damas-online-94539.firebasestorage.app",
  messagingSenderId: "301931757564",
  appId: "1:301931757564:web:881ef3e7b090db7223bc79",
  measurementId: "G-82VNRYKKE4"
};
