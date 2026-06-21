import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escapeAttr, escapeHtml } from './util.js';

const els = {
  list: document.getElementById('admin-user-list'),
  refresh: document.getElementById('admin-refresh')
};

const usersByUid = new Map();
let hasLoaded = false;
let activeView = document.querySelector('.view.active')?.id || 'home-view';

els.refresh?.addEventListener('click', () => renderAdminPanel({ force: true }));
els.list?.addEventListener('click', (e) => {
  const uid = e.target.closest('[data-admin-download]')?.getAttribute('data-admin-download');
  if (!uid) return;
  const data = usersByUid.get(uid);
  if (data) downloadUserExport(uid, data);
});

window.addEventListener('pos:viewchange', (e) => {
  activeView = e.detail?.viewId || activeView;
  if (activeView === 'admin-view') renderAdminPanel();
});

window.addEventListener('pos:adminchange', (e) => {
  if (!e.detail?.isAdmin) {
    hasLoaded = false;
    usersByUid.clear();
    renderForbidden();
    return;
  }
  if (activeView === 'admin-view') renderAdminPanel({ force: true });
});

if (activeView === 'admin-view') renderAdminPanel();

function isAdmin() {
  return Boolean(window.POS?.isAdmin && window.POSAdmin?.isAdmin);
}

async function renderAdminPanel(options = {}) {
  if (!els.list) return;
  if (!isAdmin()) {
    renderForbidden();
    return;
  }
  if (hasLoaded && !options.force) return;

  els.list.innerHTML = '<div class="recent-card"><p class="empty-note">Loading users...</p></div>';
  try {
    const userCollection = window.POSFirebase?.userCollection || 'users';
    const snap = await getDocs(collection(window.POSAdmin.db, userCollection));
    usersByUid.clear();
    snap.forEach(docSnap => usersByUid.set(docSnap.id, normalizeUserDoc(docSnap.id, docSnap.data())));
    hasLoaded = true;
    renderUserList();
  } catch (err) {
    console.warn('admin user list failed:', err);
    els.list.innerHTML = `
      <div class="recent-card">
        <p class="empty-note">Admin export is unavailable. Check the Firestore admin read rule for this UID.</p>
      </div>
    `;
    window.POS?.showToast?.('Admin export blocked by Firestore rules', 'error');
  }
}

function renderUserList() {
  const users = [...usersByUid.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  if (!users.length) {
    els.list.innerHTML = '<div class="recent-card"><p class="empty-note">No user documents found.</p></div>';
    return;
  }

  els.list.innerHTML = users.map(user => `
    <article class="admin-user-row">
      <div class="admin-user-main">
        <div>
          <span class="field-label">Shop</span>
          <span class="field-main wrap">${escapeHtml(user.shopName || 'Untitled shop')}</span>
          <span class="field-sub">${escapeHtml(user.email || 'No email in Firestore doc')}</span>
        </div>
        <div>
          <span class="field-label">UID</span>
          <span class="field-main wrap mono">${escapeHtml(user.uid)}</span>
        </div>
        <div>
          <span class="field-label">Last Updated</span>
          <span class="field-main">${escapeHtml(user.updatedAtLabel)}</span>
        </div>
        <div>
          <span class="field-label">Accounts</span>
          <span class="field-main">${user.accountCount}</span>
        </div>
        <div>
          <span class="field-label">Orders</span>
          <span class="field-main">${user.orderCount}</span>
        </div>
      </div>
      <div class="admin-user-actions">
        <button type="button" class="btn btn-primary btn-sm" data-admin-download="${escapeAttr(user.uid)}">Download</button>
      </div>
    </article>
  `).join('');
}

function renderForbidden() {
  if (!els.list) return;
  els.list.innerHTML = '<div class="recent-card"><p class="empty-note">Admin access required.</p></div>';
}

function normalizeUserDoc(uid, data = {}) {
  const updatedAtMs = timestampToMs(data.updatedAt);
  return {
    uid,
    raw: data,
    shopName: data.shopName || '',
    email: data.email || '',
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    adSpend: data.adSpend && typeof data.adSpend === 'object' ? data.adSpend : {},
    updatedAtMs,
    updatedAtLabel: updatedAtMs ? formatDateTime(updatedAtMs) : 'Never',
    accountCount: Array.isArray(data.accounts) ? data.accounts.length : 0,
    orderCount: Array.isArray(data.orders) ? data.orders.length : 0
  };
}

function downloadUserExport(uid, user) {
  const data = {
    shopName: user.shopName || '',
    accounts: user.accounts,
    orders: user.orders,
    adSpend: user.adSpend,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  const name = slugify(user.shopName) || `user-${uid.slice(0, 8)}`;
  a.href = url;
  a.download = `${name}-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  window.POS?.showToast?.('User backup exported', 'success');
}

function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function formatDateTime(ms) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(ms));
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}
