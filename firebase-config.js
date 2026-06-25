// Multiplayer backend for the trivia game. The app reads window.FIREBASE_CONFIG.
// Paste your Firebase web config below (Firebase console -> Project settings ->
// "Your apps" -> Web app -> SDK setup and configuration -> Config).
//
// The apiKey is NOT a secret for a web app — access is governed by the Realtime
// Database security rules, not by hiding the key. See README.md for the rules to
// paste and the one-time console toggles (Anonymous auth, Realtime DB). We do not
// use Firebase Storage, so storageBucket below is unused (leave it or delete it).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAfesATHtaGkh42dmSg-BRvpUL75RBhDjg",
  authDomain: "office-trivia-c035a.firebaseapp.com",
  databaseURL: "https://office-trivia-c035a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "office-trivia-c035a",
  storageBucket: "office-trivia-c035a.firebasestorage.app",
  messagingSenderId: "706291097104",
  appId: "1:706291097104:web:7ff364d9012b3fc9753495"
};
