const STORAGE_KEY = 'shein_pos_lite_v3';

const state = loadState();

const accountForm = document.getElementById('account-form');
const orderForm = document.getElementById('order-form');
const checkoutCountSelect = document.getElementById('checkout-count');
const checkoutGroups = document.getElementById('checkout-groups');
const customerList = document.getElementById('customer-list');
const accountsTbody = document.getElementById('accounts-tbody');
const ordersTbody = document.getElementById('orders-tbody');

accountForm.addEventListener('submit', onAddAccount);
orderForm.addEventListener('submit', onAddOrderBatch);
checkoutCountSelect.addEventListener('change', syncCheckoutGroups);
document.getElementById('export-btn').addEventListener('click', exportBackup);
document.getElementById('import-file').addEventListener('change', importBackup);
document.getElementById('reset-btn').addEventListener('click', resetData);

document.addEventListener('click', (e) => {
  const deleteAccountId = e.target.getAttribute('data-delete-account');
  const deleteOrderId = e.target.getAttribute('data-delete-order');
  if (deleteAccountId) deleteAccount(deleteAccountId);
  if (deleteOrderId) deleteOrder(deleteOrderId);
});

migrateLegacyData();
syncCheckoutGroups();
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

function migrateLegacyData() {
  if (state.accounts.length || state.orders.length) return;

  const legacyKeys = ['shein_pos_lite_v2', 'shein_pos_lite_v1'];
  for (const key of legacyKeys) {
    try {
      const legacyRaw = localStorage.getItem(key);
      if (!legacyRaw) continue;
      const legacy = JSON.parse(legacyRaw);
      if (!legacy || !Array.isArray(legacy.accounts) || !Array.isArray(legacy.orders)) continue;

      state.accounts = legacy.accounts;
      state.orders = legacy.orders.map((order, index) => normalizeOrder(order, index));
      saveState();
      return;
    } catch {
      // ignore and continue
    }
  }
}

function normalizeOrder(order, index = 0) {
  const customerName = String(order.customerName || '').trim();
  const normalized = normalizeCustomerKey(customerName);
  const batchId = order.batchId || `${normalized || 'CUSTOMER'}-${String(index + 1).padStart(3, '0')}`;
  const checkoutId = order.checkoutId || `${batchId}-${String((index % 26) + 1).padStart(2, '0')}`;
  return {
    id: order.id || uid('ord'),
    customerName,
    customerTag: String(order.customerTag || '').trim(),
    batchId,
    checkoutId,
    itemCount: clampNumber(order.itemCount, 1, 1),
    accountId: String(order.accountId || '').trim(),
    voucherUsed: String(order.voucherUsed || '').trim(),
    tracking: String(order.tracking || '').trim(),
    totalPrice: clampNumber(order.totalPrice, 0, 0),
    discountedPrice: clampNumber(order.discountedPrice, 0, 0),
    refund: clampNumber(order.refund, 0, 0),
    deliveryStatus: String(order.deliveryStatus || 'Processing'),
    delivered: Boolean(order.delivered),
    createdAt: order.createdAt || new Date().toISOString(),
  };
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

function onAddOrderBatch(e) {
  e.preventDefault();
  const form = new FormData(orderForm);
  const customerName = String(form.get('customerName') || '').trim();
  const customerTag = String(form.get('customerTag') || '').trim();
  const checkoutCount = clampNumber(form.get('checkoutCount'), 1, 1, 6);

  if (!customerName) {
    alert('Customer name is required.');
    return;
  }

  const batchId = generateBatchId(customerName, customerTag);
  const newOrders = [];

  for (let i = 1; i <= checkoutCount; i += 1) {
    const suffix = String(i);
    const accountId = String(form.get(`accountId_${suffix}`) || '').trim();
    if (!accountId) {
      alert(`Please select an account for checkout ${i}.`);
      return;
    }

    const order = {
      id: uid('ord'),
      customerName,
      customerTag,
      batchId,
      checkoutId: `${batchId}-${String(i).padStart(2, '0')}`,
      itemCount: clampNumber(form.get(`itemCount_${suffix}`), 1, 1),
      accountId,
      voucherUsed: String(form.get(`voucherUsed_${suffix}`) || '').trim(),
      tracking: String(form.get(`tracking_${suffix}`) || '').trim(),
      totalPrice: clampNumber(form.get(`totalPrice_${suffix}`), 0, 0),
      discountedPrice: clampNumber(form.get(`discountedPrice_${suffix}`), 0, 0),
      refund: clampNumber(form.get(`refund_${suffix}`), 0, 0),
      deliveryStatus: String(form.get(`deliveryStatus_${suffix}`) || 'Processing'),
      delivered: form.get(`delivered_${suffix}`) === 'on',
      createdAt: new Date().toISOString(),
    };

    newOrders.push(order);
  }

  state.orders.push(...newOrders);
  saveState();
  orderForm.reset();
  checkoutCountSelect.value = '1';
  syncCheckoutGroups();
  render();
}

function generateBatchId(customerName, customerTag = '') {
  const base = normalizeCustomerKey(customerTag ? `${customerName}-${customerTag}` : customerName) || 'CUSTOMER';
  const related = state.orders.filter(order => {
    const existingBase = String(order.batchId || '').replace(/-\d+$/, '');
    return existingBase === base;
  }).length;
  return `${base}-${String(related + 1).padStart(3, '0')}`;
}

function normalizeCustomerKey(name) {
  return String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function syncCheckoutGroups() {
  const count = clampNumber(checkoutCountSelect.value, 1, 1, 6);
  const currentValues = captureCheckoutGroupValues();

  checkoutGroups.innerHTML = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const values = currentValues[n] || {};
    return `
      <div class="card" style="margin-top: 12px;">
        <h3>Checkout ${n}</h3>
        <div class="grid-4">
          <input name="itemCount_${n}" type="number" step="1" min="1" value="${escapeAttr(values.itemCount || '1')}" placeholder="Item count" />
          <select name="accountId_${n}" class="order-account-select" data-selected="${escapeAttr(values.accountId || '')}" required>
            <option value="">Select account</option>
          </select>
          <input name="voucherUsed_${n}" value="${escapeAttr(values.voucherUsed || '')}" placeholder="Voucher used (ex. 83%, 79% + 70%)" />
          <input name="tracking_${n}" value="${escapeAttr(values.tracking || '')}" placeholder="Tracking / J&T" />
          <input name="totalPrice_${n}" type="number" step="0.01" min="0" value="${escapeAttr(values.totalPrice || '')}" placeholder="Total price paid by customer" required />
          <input name="discountedPrice_${n}" type="number" step="0.01" min="0" value="${escapeAttr(values.discountedPrice || '')}" placeholder="Discounted checkout price" required />
          <input name="refund_${n}" type="number" step="0.01" min="0" value="${escapeAttr(values.refund || '0')}" placeholder="Refund" />
          <select name="deliveryStatus_${n}">
            ${renderDeliveryOptions(values.deliveryStatus || 'Processing')}
          </select>
          <label class="checkbox-inline"><input type="checkbox" name="delivered_${n}" ${values.delivered ? 'checked' : ''} /> Delivered</label>
        </div>
      </div>
    `;
  }).join('');

  renderAccountOptionsInGroups();
}

function captureCheckoutGroupValues() {
  const values = {};
  checkoutGroups.querySelectorAll('.card').forEach((card, index) => {
    const n = index + 1;
    values[n] = {
      itemCount: card.querySelector(`[name="itemCount_${n}"]`)?.value || '1',
      accountId: card.querySelector(`[name="accountId_${n}"]`)?.value || '',
      voucherUsed: card.querySelector(`[name="voucherUsed_${n}"]`)?.value || '',
      tracking: card.querySelector(`[name="tracking_${n}"]`)?.value || '',
      totalPrice: card.querySelector(`[name="totalPrice_${n}"]`)?.value || '',
      discountedPrice: card.querySelector(`[name="discountedPrice_${n}"]`)?.value || '',
      refund: card.querySelector(`[name="refund_${n}"]`)?.value || '0',
      deliveryStatus: card.querySelector(`[name="deliveryStatus_${n}"]`)?.value || 'Processing',
      delivered: Boolean(card.querySelector(`[name="delivered_${n}"]`)?.checked),
    };
  });
  return values;
}

function renderDeliveryOptions(selectedValue) {
  const options = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
  return options.map(option => `<option ${option === selectedValue ? 'selected' : ''}>${option}</option>`).join('');
}

function renderAccountOptionsInGroups() {
  const selects = checkoutGroups.querySelectorAll('.order-account-select');
  const options = ['<option value="">Select account</option>']
    .concat(state.accounts.map(account => {
      const status = getAccountStatus(account);
      return `<option value="${escapeAttr(account.id)}">${escapeHtml(account.email)} — ${escapeHtml(status)}</option>`;
    }))
    .join('');

  selects.forEach(select => {
    const current = select.getAttribute('data-selected') || select.value;
    select.innerHTML = options;
    select.value = current;
  });
}

function deleteAccount(accountId) {
  const used = state.orders.some(o => o.accountId === accountId);
  if (used) {
    alert('This account already has checkouts. Delete the related checkouts first.');
    return;
  }
  if (!confirm('Delete this account?')) return;
  state.accounts = state.accounts.filter(a => a.id !== accountId);
  saveState();
  render();
}

function deleteOrder(orderId) {
  if (!confirm('Delete this checkout?')) return;
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

function getOrderProfit(order) {
  return order.totalPrice - order.discountedPrice + order.refund;
}

function render() {
  renderAccounts();
  renderOrders();
  renderSummary();
  renderCustomers();
  renderAccountOptionsInGroups();
}

function renderCustomers() {
  const names = [...new Set(state.orders.map(order => order.customerName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  customerList.innerHTML = names.map(name => `<option value="${escapeAttr(name)}"></option>`).join('');
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
        <td><button class="small-btn" data-delete-account="${escapeAttr(account.id)}">Delete</button></td>
      </tr>
    `;
  }).join('');
}

function renderOrders() {
  if (!state.orders.length) {
    ordersTbody.innerHTML = `<tr><td colspan="12">No checkouts yet.</td></tr>`;
    return;
  }

  const sorted = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  ordersTbody.innerHTML = sorted.map(order => {
    const account = getAccountById(order.accountId);
    const profit = getOrderProfit(order);
    const customerLabel = order.customerTag ? `${order.customerName} (${order.customerTag})` : order.customerName;
    return `
      <tr title="Batch: ${escapeAttr(order.batchId)} | Checkout: ${escapeAttr(order.checkoutId)}">
        <td>${escapeHtml(customerLabel)}</td>
        <td>${escapeHtml(order.itemCount || 1)}</td>
        <td class="mono">${escapeHtml(account?.email || 'Deleted account')}</td>
        <td>${escapeHtml(order.voucherUsed || '-')}</td>
        <td class="mono">${escapeHtml(order.tracking || '-')}</td>
        <td>${formatPeso(order.totalPrice)}</td>
        <td>${formatPeso(order.discountedPrice)}</td>
        <td>${formatPeso(order.refund)}</td>
        <td>${formatPeso(profit)}</td>
        <td>${escapeHtml(order.deliveryStatus)}</td>
        <td>${order.delivered ? 'Yes' : 'No'}</td>
        <td><button class="small-btn" data-delete-order="${escapeAttr(order.id)}">Delete</button></td>
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
      state.orders = parsed.orders.map((order, index) => normalizeOrder(order, index));
      saveState();
      syncCheckoutGroups();
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
  syncCheckoutGroups();
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

function escapeAttr(value) {
  return escapeHtml(value);
}
