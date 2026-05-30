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
  initializeFirestore, doc, getDoc, setDoc, onSnapshot,
  persistentLocalCache, persistentMultipleTabManager
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
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const ADMIN_UIDS = new Set(['tkeqa9jRE9NVRoQQGpLz9WJYYpb2']);
window.POSAdmin = { db, auth, isAdmin: false, user: null };

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
let lastPushedJson = null;
let pushSeq = 0;

/* ─── Cloud push (called by app.js saveState) ──────────────── */
window.POSCloud = {
  push(state) {
    if (!syncReady || !docRef) return;
    clearTimeout(pushTimer);
    const payload = toPlain(state);
    const payloadJson = comparableJson(payload);
    const seq = ++pushSeq;
    lastPushedJson = payloadJson;
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    pushTimer = setTimeout(() => {
      setDoc(docRef, payload)
        .then(() => {
          if (seq === pushSeq) setSyncStatus(navigator.onLine ? 'saved' : 'offline');
        })
        .catch(err => {
          if (seq !== pushSeq) return;
          console.warn('cloud push failed:', err);
          setSyncStatus('error');
          window.POS?.showToast?.('Cloud sync failed. Your local copy is still saved.', 'error');
        });
    }, 500);
  }
};

function toPlain(s) {
  return {
    shopName: s.shopName || '',
    email: auth.currentUser?.email || '',
    accounts: s.accounts || [],
    orders: s.orders || [],
    adSpend: s.adSpend || {},
    updatedAt: Date.now()
  };
}

function comparableJson(data = {}) {
  return JSON.stringify({
    shopName: data.shopName || '',
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    adSpend: data.adSpend && typeof data.adSpend === 'object' ? data.adSpend : {}
  });
}

function currentComparableJson() {
  return comparableJson(window.POS?.getState?.() || {});
}

function setSyncStatus(state, message = '') {
  window.POS?.setSyncStatus?.(state, message);
}

function updateConnectivityStatus() {
  if (!docRef) return;
  setSyncStatus(navigator.onLine ? 'saved' : 'offline');
}

window.addEventListener('online', updateConnectivityStatus);
window.addEventListener('offline', () => setSyncStatus('offline'));

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
    clearTimeout(pushTimer);
    lastPushedJson = null;
    pushSeq++;
    window.POSAdmin.isAdmin = false;
    window.POSAdmin.user = null;
    window.POS?.setAdminMode?.(false);
    // Only wipe local data on an actual logout — NOT on the initial page-load null event
    // (that would destroy a not-yet-migrated user's localStorage before they sign in).
    if (wasSignedIn) window.POS.clearState();
    form.reset();
    setMode('login');   // always return the overlay to Log in mode
    busy(false);
    overlay.hidden = false;
    setSyncStatus(navigator.onLine ? 'saved' : 'offline');
    requestAnimationFrame(() => emailEl.focus({ preventScroll: true }));
    return;
  }

  wasSignedIn = true;
  const isAdmin = ADMIN_UIDS.has(user.uid);
  window.POSAdmin.isAdmin = isAdmin;
  window.POSAdmin.user = user;
  window.POS?.setAdminMode?.(isAdmin);
  docRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      window.POS.applyRemoteState(data, { force: true });
      if (!data.email && user.email) setDoc(docRef, { email: user.email }, { merge: true }).catch(() => {});
    } else {
      // New account → start blank (plus the chosen shop name). We deliberately do NOT seed from
      // local data, so a shared device never leaks one user's data into another's new account.
      const seed = { shopName: pendingShopName || '', email: user.email || '', accounts: [], orders: [], adSpend: {}, updatedAt: Date.now() };
      await setDoc(docRef, seed);
      window.POS.applyRemoteState(seed, { force: true });
    }
  } catch (err) {
    console.warn('initial sync failed:', err);
    showMsg('Could not load your data — check your connection.');
    setSyncStatus('error');
  }
  pendingShopName = null;
  syncReady = true;
  busy(false);
  overlay.hidden = true;
  setSyncStatus(navigator.onLine ? 'saved' : 'offline');

  // Realtime updates from this account's other devices
  unsub = onSnapshot(docRef, { includeMetadataChanges: true }, (snap) => {
    if (snap.metadata.hasPendingWrites) {
      setSyncStatus(navigator.onLine ? 'saving' : 'offline');
      return;
    }
    if (!navigator.onLine || snap.metadata.fromCache) setSyncStatus('offline');
    if (!snap.exists()) return;
    const incomingJson = comparableJson(snap.data());
    if (incomingJson === lastPushedJson || incomingJson === currentComparableJson()) {
      setSyncStatus(navigator.onLine ? 'saved' : 'offline');
      return;
    }
    window.POS.applyRemoteState(snap.data());
  }, (err) => {
    console.warn('snapshot error:', err);
    setSyncStatus('error');
    window.POS?.showToast?.('Realtime sync stopped. Refresh or check your connection.', 'error');
  });
});

setMode('login');
