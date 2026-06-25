// Multiplayer backend for the trivia game. The app reads window.FIREBASE_CONFIG.
// Paste your Firebase web config below (Firebase console -> Project settings ->
// "Your apps" -> Web app -> SDK setup and configuration -> Config).
//
// The apiKey is NOT a secret for a web app — access is governed by the Realtime
// Database / Storage security rules, not by hiding the key. See README.md for the
// rules to paste and the one-time console toggles (Anonymous auth, Realtime DB).
window.FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
  // Realtime Database URL — in the console it ends with .firebasedatabase.app
  databaseURL: "https://PASTE-default-rtdb.europe-west1.firebasedatabase.app/"
};
