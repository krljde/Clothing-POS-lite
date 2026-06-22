/* ───────────────────────────────────────────────────────────
   Firebase auth + per-user cloud sync (multi-tenant).
   Each signed-in user's whole published dataset lives in Firestore at
   users/{uid}. Localhost uses devUsers/{uid} so test data stays sandboxed.
   This module owns ALL Firebase + auth-UI logic; app.js exposes
   window.POS hooks and calls window.POSCloud.push() from saveState().
   ─────────────────────────────────────────────────────────── */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
  signInAnonymously, setPersistence, browserLocalPersistence
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
const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('auth persistence setup failed:', err);
});
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // This network blocks Firestore's streaming Listen channel (one-time reads work, but
  // realtime onSnapshot hangs). Auto-detect "works" but spends ~30s probing the streaming
  // channel on every fresh connect (first login / logout→login) before falling back —
  // during which the POS toasts "sync stopped" and the fulfillment board fails to load.
  // Force long-polling from the start to skip that probe and connect immediately.
  experimentalForceLongPolling: true
});
const ADMIN_UIDS = new Set(['tkeqa9jRE9NVRoQQGpLz9WJYYpb2']);
const SEARCH_PARAMS = new URLSearchParams(window.location.search);
const IS_BOOKER_ROUTE = window.location.pathname.toLowerCase().endsWith('/booker.html')
  || SEARCH_PARAMS.has('booker');
const IS_LOCAL_DEV_HOST = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
const IS_MOCK_ROUTE = IS_LOCAL_DEV_HOST && SEARCH_PARAMS.has('mock');
const USER_COLLECTION = IS_LOCAL_DEV_HOST ? 'devUsers' : 'users';
window.POSFirebase = { app, auth, db, isBookerRoute: IS_BOOKER_ROUTE, isLocalDevHost: IS_LOCAL_DEV_HOST, isMockRoute: IS_MOCK_ROUTE, userCollection: USER_COLLECTION, ensureBookerAuth };
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
const authLinks = document.querySelector('.auth-links');

if (IS_BOOKER_ROUTE || IS_MOCK_ROUTE) {
  if (overlay) overlay.hidden = true;
  if (IS_BOOKER_ROUTE) document.querySelector('.app-shell')?.setAttribute('hidden', '');
} else {
  showAuthChecking();
}

async function ensureBookerAuth() {
  await authPersistenceReady;
  await waitForAuthReady();
  if (auth.currentUser && auth.currentUser.isAnonymous) return auth.currentUser;
  const result = await signInAnonymously(auth);
  return result.user;
}

async function waitForAuthReady() {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
    return;
  }
  await new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve();
    });
  });
}

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
  window.POS?.setSyncStatus?.(state, message || (IS_LOCAL_DEV_HOST && state === 'saved' ? 'Dev sandbox' : ''));
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
function showAuthChecking() {
  if (!overlay) return;
  overlay.hidden = false;
  if (titleEl) titleEl.textContent = 'Checking session';
  if (subEl) subEl.textContent = 'Restoring your saved login...';
  if (form) form.hidden = true;
  authLinks?.setAttribute('hidden', '');
  hideMsg();
}
function showAuthLogin() {
  if (form) form.hidden = false;
  authLinks?.removeAttribute('hidden');
  setMode('login');
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

toggleBtn?.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

forgotBtn?.addEventListener('click', async () => {
  const email = emailEl.value.trim();
  if (!email) return showMsg('Enter your email above first, then tap “Forgot password?”.');
  try {
    await sendPasswordResetEmail(auth, email);
    showMsg('Password reset email sent — check your inbox.', 'info');
  } catch (e) { showMsg(errMsg(e)); }
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailEl.value.trim();
  const password = passEl.value;
  if (!email || !password) return showMsg('Enter your email and password.');
  busy(true);
  try {
    await authPersistenceReady;
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
  if (IS_BOOKER_ROUTE || IS_MOCK_ROUTE) {
    window.POSAdmin.isAdmin = false;
    window.POSAdmin.user = user || null;
    window.dispatchEvent(new CustomEvent('pos:authchange', { detail: { user, isAdmin: false, isBookerRoute: IS_BOOKER_ROUTE, isMockRoute: IS_MOCK_ROUTE } }));
    if (overlay) overlay.hidden = true;
    setSyncStatus(navigator.onLine ? 'saved' : 'offline');
    return;
  }

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
    showAuthLogin();    // always return the overlay to Log in mode
    busy(false);
    overlay.hidden = false;
    setSyncStatus(navigator.onLine ? 'saved' : 'offline');
    window.dispatchEvent(new CustomEvent('pos:authchange', { detail: { user: null, isAdmin: false } }));
    requestAnimationFrame(() => emailEl.focus({ preventScroll: true }));
    return;
  }

  wasSignedIn = true;
  const isAdmin = ADMIN_UIDS.has(user.uid);
  window.POSAdmin.isAdmin = isAdmin;
  window.POSAdmin.user = user;
  window.POS?.setAdminMode?.(isAdmin);
  docRef = doc(db, USER_COLLECTION, user.uid);
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
  window.dispatchEvent(new CustomEvent('pos:authchange', { detail: { user, isAdmin } }));

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
