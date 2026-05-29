/* ───────────────────────────────────────────────────────────
   Firebase auth + per-user cloud sync (multi-tenant).
   Each signed-in user's whole dataset lives in Firestore at
   users/{uid}. localStorage (via app.js) stays as an offline cache.
   This module owns ALL Firebase + auth-UI logic; app.js exposes
   window.POS hooks and calls window.POSCloud.push() from saveState().
   ─────────────────────────────────────────────────────────── */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ─── Firebase project config (shein-pos) ──────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyDKrvEewbCUb3KOjxiDUvip7LWIkp9k730",
  authDomain: "shein-pos.firebaseapp.com",
  projectId: "shein-pos",
  storageBucket: "shein-pos.firebasestorage.app",
  messagingSenderId: "748955243508",
  appId: "1:748955243508:web:63b7062a45f102ef0b9fa1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(() => {}); // offline cache; ignored if multi-tab/unsupported

/* ─── DOM refs ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const overlay   = $('auth-overlay');
const form      = $('auth-form');
const emailEl   = $('auth-email');
const passEl    = $('auth-password');
const shopEl    = $('auth-shop');
const shopGroup = $('auth-shop-group');
const submitBtn = $('auth-submit');
const titleEl   = $('auth-title');
const subEl     = $('auth-sub');
const toggleBtn = $('auth-toggle');
const forgotBtn = $('auth-forgot');
const msgEl     = $('auth-message');

/* ─── Sync state ───────────────────────────────────────────── */
let mode = 'login';        // 'login' | 'signup'
let docRef = null;
let unsub = null;
let syncReady = false;     // gate pushes until initial load/seed completes
let pendingShopName = null;
let pushTimer = null;
let wasSignedIn = false;   // so we only wipe local data on a real logout, never on first load

/* ─── Cloud push (called by app.js saveState) ──────────────── */
window.POSCloud = {
  push(state) {
    if (!syncReady || !docRef) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      setDoc(docRef, toPlain(state)).catch(err => console.warn('cloud push failed:', err));
    }, 500);
  }
};

function toPlain(s) {
  return {
    shopName: s.shopName || '',
    accounts: s.accounts || [],
    orders: s.orders || [],
    pendingOrders: s.pendingOrders || [],
    adSpend: s.adSpend || {},
    updatedAt: Date.now()
  };
}

/* ─── Auth UI ──────────────────────────────────────────────── */
function setMode(m) {
  mode = m;
  const signup = m === 'signup';
  shopGroup.hidden = !signup;
  shopEl.required = signup;
  titleEl.textContent = signup ? 'Create your shop' : 'Log in';
  subEl.textContent = signup ? 'Sign up to start tracking your shop.' : 'Welcome back — sign in to your shop.';
  submitBtn.textContent = signup ? 'Sign up' : 'Log in';
  toggleBtn.textContent = signup ? 'Have an account? Log in' : 'Need an account? Sign up';
  passEl.autocomplete = signup ? 'new-password' : 'current-password';
  hideMsg();
}
function showMsg(text, type = 'error') { msgEl.textContent = text; msgEl.className = `auth-message ${type}`; msgEl.hidden = false; }
function hideMsg() { msgEl.hidden = true; }
function busy(b) { submitBtn.disabled = b; submitBtn.textContent = b ? 'Please wait…' : (mode === 'signup' ? 'Sign up' : 'Log in'); }

const AUTH_ERRORS = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email.',
  'auth/email-already-in-use': 'That email is already registered — try logging in.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a bit and try again.',
  'auth/network-request-failed': 'Network error — check your connection.',
  'auth/operation-not-allowed': 'Email/password sign-in isn’t enabled in Firebase yet.'
};
const errMsg = e => AUTH_ERRORS[e?.code] || e?.message || 'Something went wrong.';

toggleBtn.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

forgotBtn.addEventListener('click', async () => {
  const email = emailEl.value.trim();
  if (!email) return showMsg('Enter your email above first, then tap “Forgot password?”.');
  try {
    await sendPasswordResetEmail(auth, email);
    showMsg('Password reset email sent — check your inbox.', 'info');
  } catch (e) { showMsg(errMsg(e)); }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailEl.value.trim();
  const password = passEl.value;
  if (!email || !password) return showMsg('Enter your email and password.');
  busy(true);
  try {
    if (mode === 'signup') {
      const shop = shopEl.value.trim();
      if (!shop) { busy(false); return showMsg('Enter a shop name.'); }
      pendingShopName = shop;
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    // onAuthStateChanged takes over (loads/seeds data, hides overlay)
  } catch (err) {
    pendingShopName = null;
    busy(false);
    showMsg(errMsg(err));
  }
});

/* ─── Logout ───────────────────────────────────────────────── */
function doLogout() { signOut(auth).catch(() => {}); }
['logout-btn', 'logout-btn-desktop'].forEach(id => $(id)?.addEventListener('click', doLogout));

/* ─── Auth state → data sync ───────────────────────────────── */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (unsub) { unsub(); unsub = null; }
    docRef = null; syncReady = false;
    // Only wipe local data on an actual logout — NOT on the initial page-load null event
    // (that would destroy a not-yet-migrated user's localStorage before they sign in).
    if (wasSignedIn) window.POS.clearState();
    form.reset();
    setMode('login');   // always return the overlay to Log in mode
    busy(false);
    overlay.hidden = false;
    return;
  }

  wasSignedIn = true;
  docRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      window.POS.applyRemoteState(snap.data());
    } else {
      // New account → start blank (plus the chosen shop name). We deliberately do NOT seed from
      // local data, so a shared device never leaks one user's data into another's new account.
      const seed = { shopName: pendingShopName || '', accounts: [], orders: [], pendingOrders: [], adSpend: {}, updatedAt: Date.now() };
      await setDoc(docRef, seed);
      window.POS.applyRemoteState(seed);
    }
  } catch (err) {
    console.warn('initial sync failed:', err);
    showMsg('Could not load your data — check your connection.');
  }
  pendingShopName = null;
  syncReady = true;
  busy(false);
  overlay.hidden = true;

  // Realtime updates from this account's other devices
  unsub = onSnapshot(docRef, (snap) => {
    if (snap.metadata.hasPendingWrites) return; // skip our own write echo
    if (snap.exists()) window.POS.applyRemoteState(snap.data());
  }, (err) => console.warn('snapshot error:', err));
});

setMode('login');
