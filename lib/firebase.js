import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB0eED9JbSQXvPfFJPNOhRiZSm5PpbTkjk",
  authDomain: "portfolio-mali-erdogan.firebaseapp.com",
  projectId: "portfolio-mali-erdogan",
  storageBucket: "portfolio-mali-erdogan.firebasestorage.app",
  messagingSenderId: "263756724892",
  appId: "1:263756724892:web:12b6b313fd21a796554b59",
  measurementId: "G-G6RFL0TKWK"
};

// Initialize Firebase
let app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
