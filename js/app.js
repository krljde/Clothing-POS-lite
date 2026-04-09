const STORAGE_KEY = 'shein_pos_lite_v8';
const LEGACY_KEYS = [
  'shein_pos_lite_v7',
  'shein_pos_lite_v6',
  'shein_pos_lite_v5',
  'shein_pos_lite_v4',
  'shein_pos_lite_v3',
  'shein_pos_lite_v2',
  'shein_pos_lite_v1'
];
const STATUS_OPTIONS = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];

const state = loadState();
let editingOrderId = null;

const accountForm = document.getElementById('account-form');
const orderForm = document.getElementById('order-form');
const checkoutCountSelect = document.getElementById('checkout-count');
const checkoutGroups = document.getElementById('checkout-groups');
const customerList = document.getElementById('customer-list');
const accountsTbody = document.getElementById('accounts-tbody');
const ordersTbody = document.getElementById('orders-tbody');
const editModal = document.getElementById('edit-modal');
const editOrderForm = document.getElementById('edit-order-form');
const editAccountId = document.getElementById('edit-account-id');
const editVoucherUsed = document.getElementById('edit-voucher-used');
const closeModalBtn = document.getElementById('close-modal-btn');

migrateLegacyData();
bindEvents();
syncCheckoutGroups();
render();

function bindEvents() {
  accountForm.addEventListener('submit', onAddAccount);
  orderForm.addEventListener('submit', onAddOrderBatch);
  editOrderForm.addEventListener('submit', onSaveOrderEdit);
  checkoutCountSelect.addEventListener('change', syncCheckoutGroups);
  closeModalBtn.addEventListener('click', closeEditModal);
  document.getElementById('export-btn').addEventListener('click', exportBackup);
  document.getElementById('import-file').addEventListener('change', importBackup);
  document.getElementById('reset-btn').addEventListener('click', resetData);

  document.addEventListener('click', (e) => {
    const deleteAccountId = e.target.getAttribute('data-delete-account');
    const deleteOrderId = e.target.getAttribute('data-delete-order');
    const editOrderId = e.target.getAttribute('data-edit-order');
    const closeModal = e.target.hasAttribute('data-close-modal');

    if (deleteAccountId) deleteAccount(deleteAccountId);
    if (deleteOrderId) deleteOrder(deleteOrderId);
    if (editOrderId) openEditModal(editOrderId);
    if (closeModal) closeEditModal();
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('.group-account-select')) {
      refreshGroupVoucherOptions();
    }
    if (e.target.matches('.group-voucher-select')) {
      refreshGroupVoucherOptions();
    }
    if (e.target.matches('.inline-status')) {
      onInlineStatusChange(e.target);
    }
  });

  editAccountId.addEventListener('change', refreshEditVoucherOptions);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditModal();
  });
}

function loadState() {
  const empty = { accounts: [], orders: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    return normalizeState(JSON.parse(raw));
  } catch {
    return empty;
  }
}

function migrateLegacyData() {
  if (state.accounts.length || state.orders.length) return;

  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      if (!normalized.accounts.length && !normalized.orders.length) continue;
      state.accounts = normalized.accounts;
      state.orders = normalized.orders;
      saveState();
      return;
    } catch {
      // ignore
    }
  }
}

function normalizeState(parsed) {
  const accounts = Array.isArray(parsed?.accounts) ? parsed.accounts.map(normalizeAccount).filter(Boolean) : [];
  const orders = Array.isArray(parsed?.orders) ? parsed.orders.map((order, index) => normalizeOrder(order, index)).filter(Boolean) : [];
  return { accounts, orders };
}

function normalizeAccount(account) {
  if (!account) return null;
  return {
    id: String(account.id || uid('acct')),
    email: String(account.email || '').trim(),
    password: String(account.password || '').trim(),
    cost: clampNumber(account.cost, 190, 0),
    purchasedAt: account.purchasedAt || new Date().toISOString(),
    expiryHours: clampNumber(account.expiryHours, 20, 1, 24),
    vouchers: normalizeVoucherList(account.vouchers || account.availableVouchers || account.voucherList || ''),
  };
}

function normalizeOrder(order, index = 0) {
  if (!order) return null;
  const customerName = String(order.customerName || '').trim();
  const customerTag = String(order.customerTag || '').trim();
  const baseBatchId = String(order.batchId || '').trim();
  const batchId = baseBatchId || `${normalizeCustomerKey(customerName || 'CUSTOMER')}-${String(index + 1).padStart(3, '0')}`;
  const checkoutId = String(order.checkoutId || '').trim() || `${batchId}-${String((index % 99) + 1).padStart(2, '0')}`;
  return {
    id: String(order.id || uid('ord')),
    customerName,
    customerTag,
    batchId,
    checkoutId,
    itemCount: clampNumber(order.itemCount, 1, 1),
    accountId: String(order.accountId || '').trim(),
    voucherUsed: String(order.voucherUsed || '').trim(),
    tracking: String(order.tracking || '').trim(),
    totalPrice: clampNumber(order.totalPrice, 0, 0),
    discountedPrice: clampNumber(order.discountedPrice, 0, 0),
    refund: clampNumber(order.refund, 0, 0),
    deliveryStatus: normalizeStatus(order.deliveryStatus),
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
  const vouchers = normalizeVoucherList(form.get('vouchers'));
  const account = {
    id: uid('acct'),
    email: String(form.get('email') || '').trim(),
    password: String(form.get('password') || '').trim(),
    cost: clampNumber(form.get('cost'), 190, 0),
    purchasedAt: new Date().toISOString(),
    expiryHours: clampNumber(form.get('expiryHours'), 20, 1, 24),
    vouchers,
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
  if (!customerName) return;

  const batchId = generateBatchId(customerName, customerTag);
  const ordersToAdd = [];

  for (let i = 1; i <= checkoutCount; i += 1) {
    const accountId = String(form.get(`accountId_${i}`) || '').trim();
    const voucherUsed = String(form.get(`voucherUsed_${i}`) || '').trim();
    if (!accountId || !voucherUsed) {
      alert(`Checkout ${i} still needs an account and voucher.`);
      return;
    }

    const remaining = getRemainingVouchers(accountId, { pendingSelections: ordersToAdd.map(o => ({ accountId: o.accountId, voucherUsed: o.voucherUsed })) });
    if (!remaining.some(v => voucherKey(v) === voucherKey(voucherUsed))) {
      alert(`Voucher for checkout ${i} is no longer available on that account.`);
      return;
    }

    ordersToAdd.push({
      id: uid('ord'),
      customerName,
      customerTag,
      batchId,
      checkoutId: `${batchId}-${String(i).padStart(2, '0')}`,
      itemCount: clampNumber(form.get(`itemCount_${i}`), 1, 1),
      accountId,
      voucherUsed,
      tracking: '',
      totalPrice: clampNumber(form.get(`totalPrice_${i}`), 0, 0),
      discountedPrice: clampNumber(form.get(`discountedPrice_${i}`), 0, 0),
      refund: clampNumber(form.get(`refund_${i}`), 0, 0),
      deliveryStatus: 'Processing',
      createdAt: new Date().toISOString(),
    });
  }

  state.orders.push(...ordersToAdd);
  saveState();
  orderForm.reset();
  checkoutCountSelect.value = '1';
  syncCheckoutGroups();
  render();
}

function onSaveOrderEdit(e) {
  e.preventDefault();
  if (!editingOrderId) return;
  const order = state.orders.find(o => o.id === editingOrderId);
  if (!order) return;

  const form = new FormData(editOrderForm);
  const newCustomerName = String(form.get('customerName') || '').trim();
  const newCustomerTag = String(form.get('customerTag') || '').trim();
  const newAccountId = String(form.get('accountId') || '').trim();
  const newVoucherUsed = String(form.get('voucherUsed') || '').trim();

  if (!newCustomerName || !newAccountId || !newVoucherUsed) {
    alert('Please complete the required fields.');
    return;
  }

  const allowedVouchers = getRemainingVouchers(newAccountId, { excludeOrderId: order.id });
  if (!allowedVouchers.some(v => voucherKey(v) === voucherKey(newVoucherUsed))) {
    alert('That voucher is not available for the selected account.');
    return;
  }

  const oldBatchId = order.batchId;
  const batchOrders = state.orders
    .filter(o => o.batchId === oldBatchId)
    .sort((a, b) => a.checkoutId.localeCompare(b.checkoutId));

  if (order.customerName !== newCustomerName || order.customerTag !== newCustomerTag) {
    const nextBatchId = generateBatchId(newCustomerName, newCustomerTag, oldBatchId);
    batchOrders.forEach((batchOrder, index) => {
      batchOrder.customerName = newCustomerName;
      batchOrder.customerTag = newCustomerTag;
      batchOrder.batchId = nextBatchId;
      batchOrder.checkoutId = `${nextBatchId}-${String(index + 1).padStart(2, '0')}`;
    });
  }

  order.itemCount = clampNumber(form.get('itemCount'), 1, 1);
  order.accountId = newAccountId;
  order.voucherUsed = newVoucherUsed;
  order.tracking = String(form.get('tracking') || '').trim();
  order.totalPrice = clampNumber(form.get('totalPrice'), 0, 0);
  order.discountedPrice = clampNumber(form.get('discountedPrice'), 0, 0);
  order.refund = clampNumber(form.get('refund'), 0, 0);
  order.deliveryStatus = normalizeStatus(form.get('deliveryStatus'));

  saveState();
  closeEditModal();
  render();
}

function onInlineStatusChange(select) {
  const orderId = select.getAttribute('data-order-id');
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.deliveryStatus = normalizeStatus(select.value);
  saveState();
  renderOrders();
}

function deleteAccount(accountId) {
  if (state.orders.some(order => order.accountId === accountId)) {
    alert('This account already has checkouts. Delete or move those checkouts first.');
    return;
  }
  if (!confirm('Delete this account?')) return;
  state.accounts = state.accounts.filter(account => account.id !== accountId);
  saveState();
  render();
}

function deleteOrder(orderId) {
  if (!confirm('Delete this checkout?')) return;
  state.orders = state.orders.filter(order => order.id !== orderId);
  if (editingOrderId === orderId) closeEditModal();
  saveState();
  render();
}

function getAccountById(accountId) {
  return state.accounts.find(account => account.id === accountId) || null;
}

function getExpiresAt(account) {
  return new Date(new Date(account.purchasedAt).getTime() + account.expiryHours * 60 * 60 * 1000);
}

function getHoursLeft(account) {
  return (getExpiresAt(account).getTime() - Date.now()) / (60 * 60 * 1000);
}

function getUsedVoucherKeys(accountId, excludeOrderId = null) {
  return new Set(
    state.orders
      .filter(order => order.accountId === accountId && order.id !== excludeOrderId)
      .map(order => voucherKey(order.voucherUsed))
      .filter(Boolean)
  );
}

function getRemainingVouchers(accountId, options = {}) {
  const { excludeOrderId = null, pendingSelections = [] } = options;
  const account = getAccountById(accountId);
  if (!account) return [];

  const used = getUsedVoucherKeys(accountId, excludeOrderId);
  pendingSelections
    .filter(item => item.accountId === accountId)
    .forEach(item => {
      const key = voucherKey(item.voucherUsed);
      if (key) used.add(key);
    });

  return account.vouchers.filter(voucher => !used.has(voucherKey(voucher)));
}

function getUsedVoucherCount(accountId) {
  const account = getAccountById(accountId);
  if (!account) return 0;
  return account.vouchers.length - getRemainingVouchers(accountId).length;
}

function getAccountStatus(account) {
  if (getHoursLeft(account) <= 0) return 'Expired';
  return getRemainingVouchers(account.id).length > 0 ? 'Available' : 'Used';
}

function getOrderProfit(order) {
  return order.totalPrice - order.discountedPrice + order.refund;
}

function render() {
  renderCustomers();
  renderAccounts();
  renderOrders();
  renderSummary();
  renderAccountOptionsInGroups();
  refreshGroupVoucherOptions();
}

function renderCustomers() {
  const names = [...new Set(state.orders.map(order => order.customerName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  customerList.innerHTML = names.map(name => `<option value="${escapeAttr(name)}"></option>`).join('');
}

function renderSummary() {
  const totalProfit = state.orders.reduce((sum, order) => sum + getOrderProfit(order), 0);
  const available = state.accounts.filter(account => getAccountStatus(account) === 'Available').length;
  const expired = state.accounts.filter(account => getAccountStatus(account) === 'Expired').length;

  document.getElementById('stat-orders').textContent = String(state.orders.length);
  document.getElementById('stat-profit').textContent = formatPeso(totalProfit);
  document.getElementById('stat-active').textContent = String(available);
  document.getElementById('stat-expired').textContent = String(expired);
}

function renderAccounts() {
  if (!state.accounts.length) {
    accountsTbody.innerHTML = '<tr><td colspan="10">No accounts yet.</td></tr>';
    return;
  }

  const sorted = [...state.accounts].sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
  accountsTbody.innerHTML = sorted.map(account => {
    const status = getAccountStatus(account);
    const badgeClass = status.toLowerCase();
    const remaining = getRemainingVouchers(account.id);
    const usedCount = getUsedVoucherCount(account.id);
    const tooltip = status === 'Available'
      ? (remaining.length ? `Available: ${remaining.join(', ')}` : 'No vouchers left')
      : status === 'Used'
        ? 'All vouchers already used'
        : 'Account already expired';

    return `
      <tr>
        <td class="mono">${escapeHtml(account.email)}</td>
        <td>${escapeHtml(account.password || '-')}</td>
        <td>${formatPeso(account.cost)}</td>
        <td>${formatDate(account.purchasedAt)}</td>
        <td>${formatDate(getExpiresAt(account))}</td>
        <td>${getHoursLeft(account) > 0 ? `${getHoursLeft(account).toFixed(1)} hrs` : '0 hrs'}</td>
        <td>${usedCount} / ${account.vouchers.length || 0}</td>
        <td>${remaining.length ? escapeHtml(remaining.join(', ')) : '-'}</td>
        <td>
          <span class="badge ${badgeClass} has-tooltip" title="${escapeAttr(tooltip)}" data-tooltip="${escapeAttr(tooltip)}">${status}</span>
        </td>
        <td><button class="small-btn" data-delete-account="${escapeAttr(account.id)}">Delete</button></td>
      </tr>
    `;
  }).join('');
}

function renderOrders() {
  if (!state.orders.length) {
    ordersTbody.innerHTML = '<tr><td colspan="11">No checkouts yet.</td></tr>';
    return;
  }

  const sorted = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  ordersTbody.innerHTML = sorted.map(order => {
    const account = getAccountById(order.accountId);
    const customerLabel = order.customerTag ? `${order.customerName} · ${order.customerTag}` : order.customerName;
    const title = `Batch: ${order.batchId}\nCheckout: ${order.checkoutId}`;
    return `
      <tr title="${escapeAttr(title)}">
        <td>${escapeHtml(customerLabel)}</td>
        <td>${escapeHtml(order.itemCount)}</td>
        <td class="mono">${escapeHtml(account?.email || 'Deleted account')}</td>
        <td>${escapeHtml(order.voucherUsed || '-')}</td>
        <td class="mono">${escapeHtml(order.tracking || '-')}</td>
        <td>${formatPeso(order.totalPrice)}</td>
        <td>${formatPeso(order.discountedPrice)}</td>
        <td>${formatPeso(order.refund)}</td>
        <td>${formatPeso(getOrderProfit(order))}</td>
        <td>
          <select class="inline-status" data-order-id="${escapeAttr(order.id)}">
            ${STATUS_OPTIONS.map(status => `<option value="${escapeAttr(status)}" ${status === order.deliveryStatus ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
        </td>
        <td>
          <div class="button-row compact-actions">
            <button class="small-btn" data-edit-order="${escapeAttr(order.id)}" type="button">Edit</button>
            <button class="small-btn danger-soft" data-delete-order="${escapeAttr(order.id)}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function syncCheckoutGroups() {
  const count = clampNumber(checkoutCountSelect.value, 1, 1, 6);
  const previous = captureCheckoutGroupValues();

  checkoutGroups.innerHTML = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const values = previous[n] || {};
    return `
      <div class="card checkout-card" data-group="${n}">
        <h3>Checkout ${n}</h3>
        <div class="grid-4">
          <input name="itemCount_${n}" type="number" step="1" min="1" value="${escapeAttr(values.itemCount || '1')}" placeholder="Item count" />
          <select name="accountId_${n}" class="group-account-select" data-group="${n}" data-selected="${escapeAttr(values.accountId || '')}" required>
            <option value="">Select account</option>
          </select>
          <select name="voucherUsed_${n}" class="group-voucher-select" data-group="${n}" data-selected="${escapeAttr(values.voucherUsed || '')}" required>
            <option value="">Select voucher</option>
          </select>
          <input name="totalPrice_${n}" type="number" step="0.01" min="0" value="${escapeAttr(values.totalPrice || '')}" placeholder="Total price paid by customer" required />
          <input name="discountedPrice_${n}" type="number" step="0.01" min="0" value="${escapeAttr(values.discountedPrice || '')}" placeholder="Discounted checkout price" required />
          <input name="refund_${n}" type="number" step="0.01" min="0" value="${escapeAttr(values.refund || '0')}" placeholder="Refund" />
        </div>
      </div>
    `;
  }).join('');

  renderAccountOptionsInGroups();
  refreshGroupVoucherOptions();
}

function captureCheckoutGroupValues() {
  const values = {};
  checkoutGroups.querySelectorAll('.checkout-card').forEach((card, index) => {
    const n = index + 1;
    values[n] = {
      itemCount: card.querySelector(`[name="itemCount_${n}"]`)?.value || '1',
      accountId: card.querySelector(`[name="accountId_${n}"]`)?.value || '',
      voucherUsed: card.querySelector(`[name="voucherUsed_${n}"]`)?.value || '',
      totalPrice: card.querySelector(`[name="totalPrice_${n}"]`)?.value || '',
      discountedPrice: card.querySelector(`[name="discountedPrice_${n}"]`)?.value || '',
      refund: card.querySelector(`[name="refund_${n}"]`)?.value || '0',
    };
  });
  return values;
}

function renderAccountOptionsInGroups() {
  const selects = checkoutGroups.querySelectorAll('.group-account-select');
  selects.forEach(select => {
    const current = select.getAttribute('data-selected') || select.value;
    const options = ['<option value="">Select account</option>']
      .concat(state.accounts.map(account => {
        const remaining = getRemainingVouchers(account.id).length;
        const status = getAccountStatus(account);
        const disabled = status !== 'Available';
        return `<option value="${escapeAttr(account.id)}" ${disabled ? 'disabled' : ''}>${escapeHtml(account.email)} — ${remaining} voucher${remaining === 1 ? '' : 's'} left</option>`;
      }))
      .join('');
    select.innerHTML = options;
    select.value = current;
  });
}

function refreshGroupVoucherOptions() {
  const groups = [...checkoutGroups.querySelectorAll('.checkout-card')].map(card => {
    const group = card.getAttribute('data-group');
    return {
      group,
      accountId: card.querySelector(`[name="accountId_${group}"]`)?.value || '',
      voucherUsed: card.querySelector(`[name="voucherUsed_${group}"]`)?.value || ''
    };
  });

  checkoutGroups.querySelectorAll('.checkout-card').forEach(card => {
    const group = card.getAttribute('data-group');
    const accountSelect = card.querySelector(`[name="accountId_${group}"]`);
    const voucherSelect = card.querySelector(`[name="voucherUsed_${group}"]`);
    const accountId = accountSelect?.value || '';
    const currentVoucher = voucherSelect?.getAttribute('data-selected') || voucherSelect?.value || '';

    if (!accountId) {
      voucherSelect.innerHTML = '<option value="">Select voucher</option>';
      voucherSelect.value = '';
      return;
    }

    const pendingSelections = groups
      .filter(item => item.group !== group)
      .map(item => ({ accountId: item.accountId, voucherUsed: item.voucherUsed }));

    let remaining = getRemainingVouchers(accountId, { pendingSelections });
    if (currentVoucher && !remaining.some(v => voucherKey(v) === voucherKey(currentVoucher))) {
      const account = getAccountById(accountId);
      if (account?.vouchers.some(v => voucherKey(v) === voucherKey(currentVoucher))) {
        remaining = [currentVoucher, ...remaining];
      }
    }

    voucherSelect.innerHTML = ['<option value="">Select voucher</option>']
      .concat(remaining.map(voucher => `<option value="${escapeAttr(voucher)}">${escapeHtml(voucher)}</option>`))
      .join('');
    voucherSelect.value = currentVoucher;
    if (voucherSelect.value !== currentVoucher) voucherSelect.value = '';
    voucherSelect.setAttribute('data-selected', voucherSelect.value);
  });
}

function openEditModal(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;
  editingOrderId = orderId;

  editOrderForm.customerName.value = order.customerName;
  editOrderForm.customerTag.value = order.customerTag || '';
  editOrderForm.itemCount.value = String(order.itemCount || 1);
  editOrderForm.tracking.value = order.tracking || '';
  editOrderForm.totalPrice.value = String(order.totalPrice || '');
  editOrderForm.discountedPrice.value = String(order.discountedPrice || '');
  editOrderForm.refund.value = String(order.refund || 0);
  editOrderForm.deliveryStatus.value = normalizeStatus(order.deliveryStatus);

  const accountOptions = state.accounts.map(account => {
    const status = getAccountStatus(account);
    const disabled = status !== 'Available' && account.id !== order.accountId;
    return `<option value="${escapeAttr(account.id)}" ${disabled ? 'disabled' : ''}>${escapeHtml(account.email)}</option>`;
  }).join('');
  editAccountId.innerHTML = `<option value="">Select account</option>${accountOptions}`;
  editAccountId.value = order.accountId;
  editVoucherUsed.setAttribute('data-current-order-id', order.id);
  editVoucherUsed.setAttribute('data-selected', order.voucherUsed);
  refreshEditVoucherOptions();

  editModal.hidden = false;
  document.body.classList.add('modal-open');
}

function refreshEditVoucherOptions() {
  const accountId = editAccountId.value;
  const currentOrderId = editVoucherUsed.getAttribute('data-current-order-id');
  const selected = editVoucherUsed.getAttribute('data-selected') || editVoucherUsed.value || '';

  if (!accountId) {
    editVoucherUsed.innerHTML = '<option value="">Select voucher</option>';
    editVoucherUsed.value = '';
    return;
  }

  let remaining = getRemainingVouchers(accountId, { excludeOrderId: currentOrderId });
  if (selected && !remaining.some(v => voucherKey(v) === voucherKey(selected))) {
    const account = getAccountById(accountId);
    if (account?.vouchers.some(v => voucherKey(v) === voucherKey(selected))) {
      remaining = [selected, ...remaining];
    }
  }

  editVoucherUsed.innerHTML = ['<option value="">Select voucher</option>']
    .concat(remaining.map(voucher => `<option value="${escapeAttr(voucher)}">${escapeHtml(voucher)}</option>`))
    .join('');
  editVoucherUsed.value = selected;
  if (editVoucherUsed.value !== selected) editVoucherUsed.value = '';
}

function closeEditModal() {
  editingOrderId = null;
  editModal.hidden = true;
  document.body.classList.remove('modal-open');
  editOrderForm.reset();
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
      const parsed = normalizeState(JSON.parse(reader.result));
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
  closeEditModal();
  syncCheckoutGroups();
  render();
}

function generateBatchId(customerName, customerTag = '', oldBatchId = '') {
  const prefixBase = [customerName, customerTag].filter(Boolean).join('-');
  const prefix = normalizeCustomerKey(prefixBase || customerName || 'CUSTOMER');
  const oldMatch = oldBatchId.match(/-(\d+)$/);
  const preferredNumber = oldMatch ? Number(oldMatch[1]) : null;
  const existing = new Set(
    state.orders
      .map(order => order.batchId)
      .filter(Boolean)
      .filter(batchId => batchId !== oldBatchId)
  );

  if (preferredNumber !== null) {
    const candidate = `${prefix}-${String(preferredNumber).padStart(3, '0')}`;
    if (!existing.has(candidate)) return candidate;
  }

  let n = 1;
  while (existing.has(`${prefix}-${String(n).padStart(3, '0')}`)) n += 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

function normalizeVoucherList(value) {
  const input = Array.isArray(value) ? value.join(',') : String(value || '');
  const seen = new Set();
  return input
    .split(/[,\n|]/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => {
      const key = voucherKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function voucherKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeCustomerKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'CUSTOMER';
}

function normalizeStatus(value) {
  const status = String(value || '').trim();
  return STATUS_OPTIONS.includes(status) ? status : 'Processing';
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
  return new Date(value).toLocaleString();
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
  return escapeHtml(value).replaceAll('\n', '&#10;');
}
