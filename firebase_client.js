// firebase_client.js (type="module")
// - Email/Password auth via modal
// - Auth-first gate: show gate + auto-open modal when logged out
// - Per-user Firestore document: users/{uid}
// - Debounced saves to reduce writes

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Firebase config (public, OK in repo)
const firebaseConfig = {
  apiKey: "AIzaSyAvOz0--IBlfaq1tU_ctZoIHpH2FqDNViA",
  authDomain: "africa-map-f5c4e.firebaseapp.com",
  projectId: "africa-map-f5c4e",
  storageBucket: "africa-map-f5c4e.firebasestorage.app",
  messagingSenderId: "895788694181",
  appId: "1:895788694181:web:2a6db4ffd6b4423632ab4c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let saveTimer = null;

// ---------- Modal elements ----------
const modal = document.getElementById("authModal");
const btnClose = document.getElementById("authModalClose");
const inpEmail = document.getElementById("authEmail");
const inpPass = document.getElementById("authPassword");
const btnSignIn = document.getElementById("authSignIn");
const btnSignUp = document.getElementById("authSignUp");
const btnReset = document.getElementById("authReset");
const errorBox = document.getElementById("authError");

// Gate overlay
const gate = document.getElementById("authGate");

// ---------- UI helpers ----------
function showError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg || "";
  errorBox.classList.toggle("show", !!msg);
}

function openModal() {
  showError("");
  if (!modal) return;
  modal.classList.add("open");
  setTimeout(() => inpEmail?.focus(), 0);
}

function closeModal() {
  showError("");
  if (!modal) return;
  modal.classList.remove("open");
}

window.__openAuthModal = openModal;
window.__closeAuthModal = closeModal;

btnClose?.addEventListener("click", closeModal);
modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

// ---------- Firestore helpers ----------
async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      schemaVersion: 1,
      profile: { email: user.email || "" },
      countryData: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: false });
  }
}

async function loadUserData(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  const data = snap.data();
  return data?.countryData ?? {};
}

function scheduleSave(user, countryData) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const ref = doc(db, "users", user.uid);
      await setDoc(ref, {
        schemaVersion: 1,
        profile: { email: user.email || "" },
        countryData: countryData || {},
        updatedAt: serverTimestamp()
      }, { merge: true });

      window.__setCloudStatus?.("Saved ✓");
    } catch (e) {
      console.error("Cloud save failed:", e);
      window.__setCloudStatus?.("Save failed");
    }
  }, 800);
}

// Exposed to app.js
window.__onCountryDataChanged = function (countryData) {
  if (!currentUser) return;
  window.__setCloudStatus?.("Saving…");
  scheduleSave(currentUser, countryData);
};

// ---------- Auth actions ----------
async function doSignIn() {
  showError("");
  const email = (inpEmail?.value || "").trim();
  const pass = inpPass?.value || "";

  if (!email) return showError("Please enter your email.");
  if (!pass) return showError("Please enter your password.");

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    closeModal();
  } catch (e) {
    console.error(e);
    showError(humanAuthError(e));
  }
}

async function doSignUp() {
  showError("");
  const email = (inpEmail?.value || "").trim();
  const pass = inpPass?.value || "";

  if (!email) return showError("Please enter your email.");
  if (!pass) return showError("Please enter a password.");

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    closeModal();
  } catch (e) {
    console.error(e);
    showError(humanAuthError(e));
  }
}

async function doReset() {
  showError("");
  const email = (inpEmail?.value || "").trim();
  if (!email) return showError("Enter your email first, then click reset.");

  try {
    await sendPasswordResetEmail(auth, email);
    showError("Password reset email sent. Check your inbox.");
  } catch (e) {
    console.error(e);
    showError(humanAuthError(e));
  }
}

window.__logout = async function () {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Logout failed:", e);
  }
};

btnSignIn?.addEventListener("click", doSignIn);
btnSignUp?.addEventListener("click", doSignUp);
btnReset?.addEventListener("click", doReset);

// Enter submits Sign in
[inpEmail, inpPass].forEach((el) => {
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSignIn();
  });
});

function humanAuthError(e) {
  const code = e?.code || "";
  switch (code) {
    case "auth/invalid-email": return "Invalid email address.";
    case "auth/missing-password": return "Missing password.";
    case "auth/invalid-credential":
    case "auth/wrong-password": return "Wrong email or password.";
    case "auth/user-not-found": return "No account found for this email.";
    case "auth/email-already-in-use": return "This email is already in use.";
    case "auth/weak-password": return "Password is too weak (use at least 6 characters).";
    case "auth/too-many-requests": return "Too many attempts. Try again later.";
    default:
      return code ? `Auth error: ${code}` : "Authentication failed.";
  }
}

// ---------- Auth state listener (Auth-first gate) ----------
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if (!user) {
    window.__setAuthUI?.({ loggedIn: false });
    window.__setCloudStatus?.("");
    window.__setAppLoggedIn?.(false);

    // Auth-first: show gate and auto-open modal
    if (gate) gate.style.display = "flex";
    openModal();

    return;
  }

  // Logged in: hide gate
  if (gate) gate.style.display = "none";

  window.__setAuthUI?.({ loggedIn: true, name: user.email || "Signed in" });
  window.__setAppLoggedIn?.(true);

  try {
    window.__setCloudStatus?.("Loading…");
    await ensureUserDoc(user);
    const cloudData = await loadUserData(user);
    window.__applyCountryDataFromCloud?.(cloudData || {});
    window.__setCloudStatus?.("Loaded ✓");
  } catch (e) {
    console.error("Load user data failed:", e);
    window.__setCloudStatus?.("Load failed");
    alert("Could not load your data. Check Firestore rules.");
  }
});
