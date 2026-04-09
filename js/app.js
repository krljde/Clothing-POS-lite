const STORAGE_KEY = 'shein_pos_lite_v1';

const state = loadState();

const accountForm = document.getElementById('account-form');
const orderForm = document.getElementById('order-form');
const orderAccountSelect = document.getElementById('order-account');
const accountsTbody = document.getElementById('accounts-tbody');
const ordersTbody = document.getElementById('orders-tbody');

accountForm.addEventListener('submit', onAddAccount);
orderForm.addEventListener('submit', onAddOrder);
document.getElementById('export-btn').addEventListener('click', exportBackup);
document.getElementById('import-file').addEventListener('change', importBackup);
document.getElementById('reset-btn').addEventListener('click', resetData);

document.addEventListener('click', (e) => {
  const deleteAccountId = e.target.getAttribute('data-delete-account');
  const deleteOrderId = e.target.getAttribute('data-delete-order');
  if (deleteAccountId) deleteAccount(deleteAccountId);
  if (deleteOrderId) deleteOrder(deleteOrderId);
});

render();

function loadState() {
  const empty = { accounts: [], orders: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : empty;
  } catch {
    return empty;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function onAddAccount(e) {
  e.preventDefault();
  const form = new FormData(accountForm);
  const expiryHours = clampNumber(form.get('expiryHours'), 20, 1, 24);
  const account = {
    id: uid('acct'),
    email: String(form.get('email') || '').trim(),
    password: String(form.get('password') || '').trim(),
    cost: clampNumber(form.get('cost'), 190, 0),
    purchasedAt: new Date().toISOString(),
    expiryHours,
  };
  state.accounts.push(account);
  saveState();
  accountForm.reset();
  accountForm.cost.value = '190';
  accountForm.expiryHours.value = '20';
  render();
}

function onAddOrder(e) {
  e.preventDefault();
  const form = new FormData(orderForm);
  const order = {
    id: uid('ord'),
    customerName: String(form.get('customerName') || '').trim(),
    accountId: String(form.get('accountId') || '').trim(),
    voucherUsed: String(form.get('voucherUsed') || '').trim(),
    tracking: String(form.get('tracking') || '').trim(),
    totalPrice: clampNumber(form.get('totalPrice'), 0, 0),
    discountedPrice: clampNumber(form.get('discountedPrice'), 0, 0),
    refund: clampNumber(form.get('refund'), 0, 0),
    deliveryStatus: String(form.get('deliveryStatus') || 'Processing'),
    delivered: form.get('delivered') === 'on',
    createdAt: new Date().toISOString(),
  };
  if (!order.accountId) return;
  state.orders.push(order);
  saveState();
  orderForm.reset();
  render();
}

function deleteAccount(accountId) {
  const used = state.orders.some(o => o.accountId === accountId);
  if (used) {
    alert('This account already has orders. Delete the related orders first.');
    return;
  }
  if (!confirm('Delete this account?')) return;
  state.accounts = state.accounts.filter(a => a.id !== accountId);
  saveState();
  render();
}

function deleteOrder(orderId) {
  if (!confirm('Delete this order?')) return;
  state.orders = state.orders.filter(o => o.id !== orderId);
  saveState();
  render();
}

function getAccountUsageCount(accountId) {
  return state.orders.filter(o => o.accountId === accountId).length;
}

function getAccountById(accountId) {
  return state.accounts.find(a => a.id === accountId) || null;
}

function getExpiresAt(account) {
  return new Date(new Date(account.purchasedAt).getTime() + account.expiryHours * 60 * 60 * 1000);
}

function getHoursLeft(account) {
  const diff = getExpiresAt(account).getTime() - Date.now();
  return diff / (60 * 60 * 1000);
}

function getAccountStatus(account) {
  const usage = getAccountUsageCount(account.id);
  const expired = getHoursLeft(account) <= 0;
  if (expired) return 'Expired';
  if (usage > 0) return 'Used';
  return 'Active';
}

function getAccountCostShare(accountId) {
  const account = getAccountById(accountId);
  if (!account) return 0;
  const usage = getAccountUsageCount(accountId);
  if (!usage) return account.cost;
  return account.cost / usage;
}

function getOrderProfit(order) {
  const share = getAccountCostShare(order.accountId);
  return order.refund + order.totalPrice - order.discountedPrice - share;
}

function render() {
  renderAccountOptions();
  renderAccounts();
  renderOrders();
  renderSummary();
}

function renderAccountOptions() {
  const current = orderAccountSelect.value;
  const options = ['<option value="">Select account</option>']
    .concat(state.accounts.map(account => {
      const status = getAccountStatus(account);
      return `<option value="${escapeHtml(account.id)}">${escapeHtml(account.email)} — ${status}</option>`;
    }))
    .join('');
  orderAccountSelect.innerHTML = options;
  orderAccountSelect.value = current;
}

function renderAccounts() {
  if (!state.accounts.length) {
    accountsTbody.innerHTML = `<tr><td colspan="9">No accounts yet.</td></tr>`;
    return;
  }

  const sorted = [...state.accounts].sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
  accountsTbody.innerHTML = sorted.map(account => {
    const usage = getAccountUsageCount(account.id);
    const expiresAt = getExpiresAt(account);
    const hoursLeft = getHoursLeft(account);
    const status = getAccountStatus(account);
    const badgeClass = status.toLowerCase();

    return `
      <tr>
        <td class="mono">${escapeHtml(account.email)}</td>
        <td>${escapeHtml(account.password || '-')}</td>
        <td>${formatPeso(account.cost)}</td>
        <td>${formatDate(account.purchasedAt)}</td>
        <td>${formatDate(expiresAt.toISOString())}</td>
        <td>${hoursLeft > 0 ? `${hoursLeft.toFixed(1)} hrs` : '0 hrs'}</td>
        <td>${usage}</td>
        <td><span class="badge ${badgeClass}">${status}</span></td>
        <td><button class="small-btn" data-delete-account="${escapeHtml(account.id)}">Delete</button></td>
      </tr>
    `;
  }).join('');
}

function renderOrders() {
  if (!state.orders.length) {
    ordersTbody.innerHTML = `<tr><td colspan="12">No orders yet.</td></tr>`;
    return;
  }

  const sorted = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  ordersTbody.innerHTML = sorted.map(order => {
    const account = getAccountById(order.accountId);
    const share = getAccountCostShare(order.accountId);
    const profit = getOrderProfit(order);
    return `
      <tr>
        <td>${escapeHtml(order.customerName)}</td>
        <td class="mono">${escapeHtml(account?.email || 'Deleted account')}</td>
        <td>${escapeHtml(order.voucherUsed || '-')}</td>
        <td class="mono">${escapeHtml(order.tracking || '-')}</td>
        <td>${formatPeso(order.totalPrice)}</td>
        <td>${formatPeso(order.discountedPrice)}</td>
        <td>${formatPeso(order.refund)}</td>
        <td>${formatPeso(share)}</td>
        <td>${formatPeso(profit)}</td>
        <td>${escapeHtml(order.deliveryStatus)}</td>
        <td>${order.delivered ? 'Yes' : 'No'}</td>
        <td><button class="small-btn" data-delete-order="${escapeHtml(order.id)}">Delete</button></td>
      </tr>
    `;
  }).join('');
}

function renderSummary() {
  const totalProfit = state.orders.reduce((sum, order) => sum + getOrderProfit(order), 0);
  const active = state.accounts.filter(a => getAccountStatus(a) !== 'Expired').length;
  const expired = state.accounts.filter(a => getAccountStatus(a) === 'Expired').length;

  document.getElementById('stat-orders').textContent = String(state.orders.length);
  document.getElementById('stat-profit').textContent = formatPeso(totalProfit);
  document.getElementById('stat-active').textContent = String(active);
  document.getElementById('stat-expired').textContent = String(expired);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shein-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.accounts || !parsed.orders) throw new Error('Invalid backup file');
      state.accounts = parsed.accounts;
      state.orders = parsed.orders;
      saveState();
      render();
      alert('Backup imported.');
    } catch {
      alert('Invalid JSON backup file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function resetData() {
  if (!confirm('This will delete all local data in this browser. Continue?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state.accounts = [];
  state.orders = [];
  render();
}

function clampNumber(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function formatPeso(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
}

function formatDate(value) {
  const d = new Date(value);
  return d.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
