const STORAGE_KEY = 'shein_pos_lite_v9';
const LEGACY_KEYS = ['shein_pos_lite_v8','shein_pos_lite_v7','shein_pos_lite_v6','shein_pos_lite_v5','shein_pos_lite_v4','shein_pos_lite_v3','shein_pos_lite_v2','shein_pos_lite_v1'];
const STATUS_OPTIONS = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];

const state = loadState();
let activeView = 'home-view';
let currentBatchId = null;

const els = {
  views: [...document.querySelectorAll('.view')],
  navBtns: [...document.querySelectorAll('.nav-btn')],
  statCheckouts: document.getElementById('stat-checkouts'),
  statProfit: document.getElementById('stat-profit'),
  statRevenue: document.getElementById('stat-revenue'),
  statAvailable: document.getElementById('stat-available'),
  statExpired: document.getElementById('stat-expired'),
  statItems: document.getElementById('stat-items'),
  recentOrders: document.getElementById('recent-orders'),
  accountSort: document.getElementById('account-sort'),
  accountsList: document.getElementById('accounts-list'),
  ordersList: document.getElementById('orders-list'),
  accountModal: document.getElementById('account-modal'),
  accountModalTitle: document.getElementById('account-modal-title'),
  accountForm: document.getElementById('account-form'),
  checkoutModal: document.getElementById('checkout-modal'),
  orderForm: document.getElementById('order-form'),
  checkoutCount: document.getElementById('checkout-count'),
  checkoutGroups: document.getElementById('checkout-groups'),
  customerList: document.getElementById('customer-list'),
  batchModal: document.getElementById('batch-modal'),
  batchModalTitle: document.getElementById('batch-modal-title'),
  batchSummary: document.getElementById('batch-summary'),
  batchCheckouts: document.getElementById('batch-checkouts'),
  editCheckoutModal: document.getElementById('edit-checkout-modal'),
  editOrderForm: document.getElementById('edit-order-form'),
  editAccountId: document.getElementById('edit-account-id'),
  editVoucherUsed: document.getElementById('edit-voucher-used'),
  openAccountBtn: document.getElementById('open-account-modal'),
  openCheckoutBtn: document.getElementById('open-checkout-modal')
};

migrateLegacyData();
bindEvents();
syncCheckoutGroups();
render();

function bindEvents() {
  els.navBtns.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.viewTarget)));
  els.openAccountBtn.addEventListener('click', () => openAccountModal());
  els.openCheckoutBtn.addEventListener('click', () => openModal(els.checkoutModal));
  els.accountSort.addEventListener('change', renderAccounts);
  els.accountForm.addEventListener('submit', onSaveAccount);
  els.orderForm.addEventListener('submit', onAddOrderBatch);
  els.checkoutCount.addEventListener('change', syncCheckoutGroups);
  els.editOrderForm.addEventListener('submit', onSaveCheckoutEdit);

  document.addEventListener('click', (e) => {
    const closeId = e.target.getAttribute('data-close-modal');
    if (closeId) closeModal(document.getElementById(closeId));

    const batchId = e.target.closest('[data-open-batch]')?.getAttribute('data-open-batch');
    if (batchId) openBatchModal(batchId);

    const accountId = e.target.getAttribute('data-edit-account');
    if (accountId) openAccountModal(accountId);

    const deleteAccountId = e.target.getAttribute('data-delete-account');
    if (deleteAccountId) deleteAccount(deleteAccountId);

    const editOrderId = e.target.getAttribute('data-edit-order');
    if (editOrderId) openEditCheckoutModal(editOrderId);

    const deleteOrderId = e.target.getAttribute('data-delete-order');
    if (deleteOrderId) deleteOrder(deleteOrderId);
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('.group-account-select') || e.target.matches('.group-voucher-select')) {
      refreshGroupVoucherOptions();
    }
    if (e.target.matches('.inline-status')) {
      updateInlineStatus(e.target.dataset.orderId, e.target.value);
    }
    if (e.target === els.editAccountId) {
      fillVoucherSelect(els.editVoucherUsed, els.editAccountId.value, { excludeOrderId: els.editOrderForm.orderId.value || null, preserve: els.editVoucherUsed.value });
    }
  });
}

function setView(viewId) {
  activeView = viewId;
  els.views.forEach(view => view.classList.toggle('active', view.id === viewId));
  els.navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.viewTarget === viewId));
}

function render() {
  renderStats();
  renderCustomers();
  renderRecentOrders();
  renderAccounts();
  renderOrders();
}

function renderStats() {
  const profit = state.orders.reduce((sum, order) => sum + getOrderProfit(order), 0);
  const revenue = state.orders.reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0);
  const statuses = state.accounts.map(getAccountStatusInfo);
  els.statCheckouts.textContent = String(state.orders.length);
  els.statProfit.textContent = peso(profit);
  if (els.statRevenue) els.statRevenue.textContent = peso(revenue);
  els.statAvailable.textContent = String(statuses.filter(s => s.status === 'Available').length);
  els.statExpired.textContent = String(statuses.filter(s => s.status === 'Expired').length);
  els.statItems.textContent = String(state.orders.reduce((sum, order) => sum + (Number(order.itemCount) || 0), 0));
}

function renderCustomers() {
  const names = [...new Set(state.orders.map(o => o.customerName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  els.customerList.innerHTML = names.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function renderRecentOrders() {
  const groups = getOrderGroups().slice(0, 5);
  els.recentOrders.innerHTML = groups.length ? groups.map(group => `
    <button class="order-mini" type="button" data-open-batch="${group.batchId}">
      <div>
        <strong>${escapeHtml(group.customerLabel)}</strong>
        <span class="meta-sub">${formatDate(group.orderDate)} · ${group.checkouts.length} checkout${group.checkouts.length > 1 ? 's' : ''}</span>
      </div>
      <strong>${peso(group.totalProfit)}</strong>
    </button>
  `).join('') : '<p class="meta-sub">No orders yet.</p>';
}

function renderAccounts() {
  const sort = els.accountSort.value;
  const accounts = [...state.accounts].sort((a, b) => sortAccounts(a, b, sort));
  els.accountsList.innerHTML = accounts.length ? accounts.map(account => {
    const info = getAccountStatusInfo(account);
    const title = info.remainingVouchers.length ? `Available vouchers: ${info.remainingVouchers.join(', ')}` : info.status;
    return `
      <article class="card account-row">
        <div>
          <span class="meta-label">Account</span>
          <strong class="meta-main">${escapeHtml(account.email)}</strong>
          <span class="meta-sub">${escapeHtml(account.password || 'No password saved')}</span>
        </div>
        <div>
          <span class="meta-label">Cost</span>
          <strong class="meta-main">${peso(account.cost)}</strong>
          <span class="meta-sub">${account.expiryHours}h expiry</span>
        </div>
        <div>
          <span class="meta-label">Purchased</span>
          <strong class="meta-main">${formatDateTime(account.purchasedAt)}</strong>
          <span class="meta-sub">${hoursLeftLabel(account)}</span>
        </div>
        <div>
          <span class="meta-label">Vouchers Left</span>
          <strong class="meta-main">${info.remainingVouchers.length}</strong>
          <span class="meta-sub">${escapeHtml(info.remainingVouchers.join(', ') || 'None')}</span>
        </div>
        <div>
          <span class="meta-label">Status</span>
          <span class="badge ${info.status.toLowerCase()}" title="${escapeHtml(title)}">${info.status}</span>
        </div>
        <div class="row-actions">
          <button type="button" data-edit-account="${account.id}">Edit</button>
          <button type="button" class="danger-btn" data-delete-account="${account.id}">Delete</button>
        </div>
      </article>
    `;
  }).join('') : '<article class="card"><p class="meta-sub">No accounts yet.</p></article>';
}

function renderOrders() {
  const groups = getOrderGroups();
  if (!groups.length) {
    els.ordersList.innerHTML = '<article class="card"><p class="meta-sub">No orders yet.</p></article>';
    return;
  }

  const rows = groups.map(group => {
    const tracking = uniqueTracking(group.checkouts).join(', ') || '—';
    const revenue = group.checkouts.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
    return `
      <button class="order-list-row table-row" type="button" data-open-batch="${group.batchId}">
        <div>
          <strong class="meta-main">${escapeHtml(group.customerLabel)}</strong>
          <span class="meta-sub">${group.checkouts.length} checkout${group.checkouts.length > 1 ? 's' : ''}</span>
        </div>
        <div>
          <strong class="meta-main">${formatDate(group.orderDate)}</strong>
          <span class="meta-sub">${formatTime(group.orderDate)}</span>
        </div>
        <div><span class="badge ${normalizeStatusClass(group.status)}">${group.status}</span></div>
        <div>
          <strong class="meta-main">${escapeHtml(tracking)}</strong>
        </div>
        <div><strong class="meta-main">${peso(revenue)}</strong></div>
        <div><strong class="meta-main">${peso(group.totalProfit)}</strong></div>
      </button>
    `;
  }).join('');

  els.ordersList.innerHTML = `
    <section class="table-shell orders-table-shell">
      <div class="order-list-row table-head">
        <div>Customer</div>
        <div>Order Date</div>
        <div>Status</div>
        <div>Tracking</div>
        <div>Revenue</div>
        <div>Profit</div>
      </div>
      ${rows}
    </section>
  `;
}

function openAccountModal(accountId = null) {
  const account = accountId ? state.accounts.find(a => a.id === accountId) : null;
  els.accountModalTitle.textContent = account ? 'Edit Account' : 'Add Account';
  els.accountForm.reset();
  els.accountForm.accountId.value = account?.id || '';
  els.accountForm.email.value = account?.email || '';
  els.accountForm.password.value = account?.password || '';
  els.accountForm.cost.value = account?.cost ?? 190;
  els.accountForm.expiryHours.value = account?.expiryHours ?? 20;
  els.accountForm.vouchers.value = (account?.availableVouchers || []).join(', ');
  openModal(els.accountModal);
}

function onSaveAccount(e) {
  e.preventDefault();
  const form = new FormData(els.accountForm);
  const id = String(form.get('accountId') || '');
  const payload = {
    email: String(form.get('email') || '').trim(),
    password: String(form.get('password') || '').trim(),
    cost: clampNumber(form.get('cost'), 0, 190),
    expiryHours: clampNumber(form.get('expiryHours'), 1, 20),
    availableVouchers: splitVouchers(String(form.get('vouchers') || ''))
  };
  if (!payload.email || !payload.availableVouchers.length) {
    alert('Please complete the account fields.');
    return;
  }
  if (id) {
    const existing = state.accounts.find(a => a.id === id);
    Object.assign(existing, payload);
  } else {
    state.accounts.unshift({ id: uid('acct'), purchasedAt: new Date().toISOString(), ...payload });
  }
  saveState();
  closeModal(els.accountModal);
  render();
}

function syncCheckoutGroups() {
  const count = Number(els.checkoutCount.value || 1);
  const oldValues = [...els.checkoutGroups.querySelectorAll('.checkout-card')].map(card => ({
    accountId: card.querySelector('.group-account-select')?.value || '',
    voucherUsed: card.querySelector('.group-voucher-select')?.value || '',
    itemCount: card.querySelector('[name="itemCount[]"]')?.value || '1',
    tracking: card.querySelector('[name="tracking[]"]')?.value || '',
    totalPrice: card.querySelector('[name="totalPrice[]"]')?.value || '',
    discountedPrice: card.querySelector('[name="discountedPrice[]"]')?.value || '',
    refund: card.querySelector('[name="refund[]"]')?.value || ''
  }));
  els.checkoutGroups.innerHTML = Array.from({ length: count }, (_, index) => {
    const old = oldValues[index] || {};
    return `
      <article class="card checkout-card">
        <div class="section-head compact">
          <div><span class="section-kicker">Checkout ${index + 1}</span></div>
        </div>
        <div class="form-grid">
          <input name="itemCount[]" type="number" min="1" step="1" placeholder="Item count" value="${escapeAttr(old.itemCount || '1')}" required />
          <select name="accountId[]" class="group-account-select" data-index="${index}" required>
            <option value="">Select account</option>
            ${state.accounts.map(account => `<option value="${account.id}" ${old.accountId === account.id ? 'selected' : ''}>${escapeHtml(account.email)}</option>`).join('')}
          </select>
          <select name="voucherUsed[]" class="group-voucher-select" data-index="${index}" required></select>
          <input name="tracking[]" placeholder="Tracking number" value="${escapeAttr(old.tracking || '')}" />
          <input name="totalPrice[]" type="number" step="0.01" min="0" placeholder="Total price" value="${escapeAttr(old.totalPrice || '')}" required />
          <input name="discountedPrice[]" type="number" step="0.01" min="0" placeholder="Discounted price" value="${escapeAttr(old.discountedPrice || '')}" required />
          <input name="refund[]" type="number" step="0.01" min="0" placeholder="Refund" value="${escapeAttr(old.refund || '')}" />
        </div>
      </article>
    `;
  }).join('');
  refreshGroupVoucherOptions(oldValues);
}

function refreshGroupVoucherOptions(oldValues = null) {
  const cards = [...els.checkoutGroups.querySelectorAll('.checkout-card')];
  const selections = cards.map((card, index) => ({
    index,
    accountId: card.querySelector('.group-account-select')?.value || '',
    voucherUsed: card.querySelector('.group-voucher-select')?.value || oldValues?.[index]?.voucherUsed || ''
  }));

  cards.forEach((card, index) => {
    const accountId = card.querySelector('.group-account-select').value;
    const voucherSelect = card.querySelector('.group-voucher-select');
    const current = selections[index].voucherUsed;
    const pendingSelections = selections.filter((item, itemIndex) => itemIndex !== index && item.accountId && item.voucherUsed);
    fillVoucherSelect(voucherSelect, accountId, { pendingSelections, preserve: current });
  });
}

function onAddOrderBatch(e) {
  e.preventDefault();
  const form = new FormData(els.orderForm);
  const customerName = String(form.get('customerName') || '').trim();
  const customerTag = String(form.get('customerTag') || '').trim();
  if (!customerName) return alert('Please enter customer name.');

  const checkouts = [...els.checkoutGroups.querySelectorAll('.checkout-card')].map(card => ({
    itemCount: clampNumber(card.querySelector('[name="itemCount[]"]').value, 1, 1),
    accountId: card.querySelector('[name="accountId[]"]').value,
    voucherUsed: card.querySelector('[name="voucherUsed[]"]').value,
    tracking: String(card.querySelector('[name="tracking[]"]').value || '').trim(),
    totalPrice: clampNumber(card.querySelector('[name="totalPrice[]"]').value, 0, 0),
    discountedPrice: clampNumber(card.querySelector('[name="discountedPrice[]"]').value, 0, 0),
    refund: clampNumber(card.querySelector('[name="refund[]"]').value, 0, 0)
  }));

  if (checkouts.some(item => !item.accountId || !item.voucherUsed)) {
    return alert('Please complete all checkout entries.');
  }

  const batchId = generateBatchId(customerName, customerTag);
  const now = new Date().toISOString();
  checkouts.forEach((item, index) => {
    state.orders.unshift({
      id: uid('ord'),
      batchId,
      checkoutId: `${batchId}-${String(index + 1).padStart(2, '0')}`,
      customerName,
      customerTag,
      createdAt: now,
      itemCount: item.itemCount,
      accountId: item.accountId,
      voucherUsed: item.voucherUsed,
      tracking: item.tracking,
      totalPrice: item.totalPrice,
      discountedPrice: item.discountedPrice,
      refund: item.refund,
      deliveryStatus: 'Processing'
    });
  });
  saveState();
  els.orderForm.reset();
  els.checkoutCount.value = '1';
  syncCheckoutGroups();
  closeModal(els.checkoutModal);
  setView('orders-view');
  render();
}

function openBatchModal(batchId) {
  currentBatchId = batchId;
  const group = getOrderGroups().find(item => item.batchId === batchId);
  if (!group) return;
  els.batchModalTitle.textContent = group.customerLabel;
  const revenue = group.checkouts.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
  els.batchSummary.innerHTML = `
    <article class="card">
      <div class="batch-metrics">
        <div><span class="meta-label">Order Date</span><strong class="meta-main">${formatDateTime(group.orderDate)}</strong></div>
        <div><span class="meta-label">Status</span><span class="badge ${normalizeStatusClass(group.status)}">${group.status}</span></div>
        <div><span class="meta-label">Tracking</span><strong class="meta-main">${escapeHtml(uniqueTracking(group.checkouts).join(', ') || '—')}</strong></div>
        <div><span class="meta-label">Items</span><strong class="meta-main">${group.totalItems}</strong></div>
        <div><span class="meta-label">Revenue</span><strong class="meta-main">${peso(revenue)}</strong></div>
        <div><span class="meta-label">Profit</span><strong class="meta-main">${peso(group.totalProfit)}</strong></div>
      </div>
    </article>
  `;
  renderBatchCheckouts(group.checkouts);
  openModal(els.batchModal);
}

function renderBatchCheckouts(checkouts) {
  els.batchCheckouts.innerHTML = checkouts.map(order => `
    <article class="card checkout-detail-card">
      <div class="checkout-detail-grid">
        <div><span class="meta-label">Voucher</span><strong class="meta-main">${escapeHtml(order.voucherUsed)}</strong></div>
        <div><span class="meta-label">Account</span><strong class="meta-main">${escapeHtml(getAccountById(order.accountId)?.email || 'Unknown')}</strong></div>
        <div><span class="meta-label">Items</span><strong class="meta-main">${escapeHtml(String(order.itemCount || 0))}</strong></div>
        <div><span class="meta-label">Revenue</span><strong class="meta-main">${peso(order.totalPrice)}</strong></div>
        <div><span class="meta-label">Checkout Cost</span><strong class="meta-main">${peso(order.discountedPrice)}</strong></div>
        <div><span class="meta-label">Refund</span><strong class="meta-main">${peso(order.refund)}</strong></div>
        <div><span class="meta-label">Tracking</span><strong class="meta-main">${escapeHtml(order.tracking || '—')}</strong></div>
        <div>
          <span class="meta-label">Status</span>
          <select class="inline-select inline-status" data-order-id="${order.id}">
            ${STATUS_OPTIONS.map(status => `<option value="${status}" ${status === normalizeStatus(order.deliveryStatus) ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
        </div>
        <div><span class="meta-label">Profit</span><strong class="meta-main">${peso(getOrderProfit(order))}</strong></div>
      </div>
      <div class="row-actions checkout-actions">
        <button type="button" data-edit-order="${order.id}">Edit</button>
        <button type="button" class="danger-btn" data-delete-order="${order.id}">Delete</button>
      </div>
    </article>
  `).join('');
}

function openEditCheckoutModal(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;
  const form = els.editOrderForm;
  form.reset();
  form.orderId.value = order.id;
  form.customerName.value = order.customerName;
  form.customerTag.value = order.customerTag || '';
  form.itemCount.value = order.itemCount;
  form.tracking.value = order.tracking || '';
  form.totalPrice.value = order.totalPrice;
  form.discountedPrice.value = order.discountedPrice;
  form.refund.value = order.refund || 0;
  form.deliveryStatus.value = normalizeStatus(order.deliveryStatus);
  fillAccountSelect(els.editAccountId, order.accountId);
  fillVoucherSelect(els.editVoucherUsed, order.accountId, { excludeOrderId: order.id, preserve: order.voucherUsed });
  openModal(els.editCheckoutModal);
}

function onSaveCheckoutEdit(e) {
  e.preventDefault();
  const form = new FormData(els.editOrderForm);
  const orderId = String(form.get('orderId') || '');
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;

  const customerName = String(form.get('customerName') || '').trim();
  const customerTag = String(form.get('customerTag') || '').trim();
  const accountId = String(form.get('accountId') || '').trim();
  const voucherUsed = String(form.get('voucherUsed') || '').trim();
  if (!customerName || !accountId || !voucherUsed) return alert('Please complete the required fields.');

  if (!getRemainingVouchers(accountId, { excludeOrderId: order.id, preserve: voucherUsed }).some(v => voucherKey(v) === voucherKey(voucherUsed))) {
    return alert('That voucher is not available for the selected account.');
  }

  if (order.customerName !== customerName || (order.customerTag || '') !== customerTag) {
    renameBatch(order.batchId, customerName, customerTag);
  }

  order.itemCount = clampNumber(form.get('itemCount'), 1, 1);
  order.accountId = accountId;
  order.voucherUsed = voucherUsed;
  order.tracking = String(form.get('tracking') || '').trim();
  order.totalPrice = clampNumber(form.get('totalPrice'), 0, 0);
  order.discountedPrice = clampNumber(form.get('discountedPrice'), 0, 0);
  order.refund = clampNumber(form.get('refund'), 0, 0);
  order.deliveryStatus = normalizeStatus(form.get('deliveryStatus'));

  saveState();
  closeModal(els.editCheckoutModal);
  render();
  if (currentBatchId) openBatchModal(state.orders.find(o => o.id === orderId)?.batchId || currentBatchId);
}

function renameBatch(oldBatchId, customerName, customerTag) {
  const batchOrders = state.orders.filter(order => order.batchId === oldBatchId).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  const nextBatchId = generateBatchId(customerName, customerTag, oldBatchId);
  batchOrders.forEach((item, index) => {
    item.customerName = customerName;
    item.customerTag = customerTag;
    item.batchId = nextBatchId;
    item.checkoutId = `${nextBatchId}-${String(index + 1).padStart(2, '0')}`;
  });
  currentBatchId = nextBatchId;
}

function updateInlineStatus(orderId, status) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;
  order.deliveryStatus = normalizeStatus(status);
  saveState();
  render();
  if (currentBatchId) openBatchModal(currentBatchId);
}

function deleteAccount(accountId) {
  if (state.orders.some(order => order.accountId === accountId)) return alert('This account already has checkouts. Move or delete those first.');
  if (!confirm('Delete this account?')) return;
  state.accounts = state.accounts.filter(account => account.id !== accountId);
  saveState();
  render();
}

function deleteOrder(orderId) {
  if (!confirm('Delete this checkout?')) return;
  const batchId = state.orders.find(o => o.id === orderId)?.batchId;
  state.orders = state.orders.filter(order => order.id !== orderId);
  saveState();
  render();
  if (batchId) {
    const stillExists = state.orders.some(order => order.batchId === batchId);
    if (stillExists) openBatchModal(batchId);
    else closeModal(els.batchModal);
  }
}

function getOrderGroups() {
  const map = new Map();
  [...state.orders].sort((a,b)=>new Date(b.createdAt) - new Date(a.createdAt)).forEach(order => {
    if (!map.has(order.batchId)) map.set(order.batchId, []);
    map.get(order.batchId).push(order);
  });
  return [...map.entries()].map(([batchId, checkouts]) => {
    const sorted = [...checkouts].sort((a,b)=>a.checkoutId.localeCompare(b.checkoutId));
    const first = sorted[0];
    return {
      batchId,
      checkouts: sorted,
      customerLabel: first.customerTag ? `${first.customerName} · ${first.customerTag}` : first.customerName,
      orderDate: first.createdAt,
      totalProfit: sorted.reduce((sum, item) => sum + getOrderProfit(item), 0),
      totalItems: sorted.reduce((sum, item) => sum + Number(item.itemCount || 0), 0),
      status: summarizeGroupStatus(sorted)
    };
  }).sort((a,b)=> new Date(b.orderDate) - new Date(a.orderDate));
}

function summarizeGroupStatus(checkouts) {
  const statuses = checkouts.map(item => normalizeStatus(item.deliveryStatus));
  if (statuses.every(s => s === 'Delivered')) return 'Delivered';
  if (statuses.every(s => s === 'Cancelled')) return 'Cancelled';
  if (statuses.some(s => s === 'Shipped' || s === 'Delivered')) return 'Shipped';
  return 'Processing';
}

function getOrderProfit(order) { return Number(order.totalPrice || 0) - Number(order.discountedPrice || 0) + Number(order.refund || 0); }
function getAccountById(accountId) { return state.accounts.find(account => account.id === accountId) || null; }
function getExpiresAt(account) { return new Date(new Date(account.purchasedAt).getTime() + account.expiryHours * 3600000); }
function hoursLeftLabel(account) { const hrs = (getExpiresAt(account).getTime() - Date.now())/3600000; return hrs <= 0 ? 'Expired' : `${Math.floor(hrs)}h left`; }

function getAccountStatusInfo(account) {
  if (getExpiresAt(account).getTime() <= Date.now()) return { status: 'Expired', remainingVouchers: [] };
  const remainingVouchers = getRemainingVouchers(account.id);
  return { status: remainingVouchers.length ? 'Available' : 'Used', remainingVouchers };
}

function getUsedVoucherKeys(accountId, excludeOrderId = null) {
  return new Set(state.orders.filter(order => order.accountId === accountId && order.id !== excludeOrderId).map(order => voucherKey(order.voucherUsed)).filter(Boolean));
}

function getRemainingVouchers(accountId, options = {}) {
  const { excludeOrderId = null, pendingSelections = [], preserve = '' } = options;
  const account = getAccountById(accountId);
  if (!account) return [];
  const used = getUsedVoucherKeys(accountId, excludeOrderId);
  pendingSelections.filter(item => item.accountId === accountId).forEach(item => used.add(voucherKey(item.voucherUsed)));
  const allowed = account.availableVouchers.filter(voucher => !used.has(voucherKey(voucher)));
  if (preserve && !allowed.some(v => voucherKey(v) === voucherKey(preserve))) allowed.unshift(preserve);
  return uniqueByVoucherKey(allowed);
}

function fillAccountSelect(select, selectedId = '') {
  select.innerHTML = `<option value="">Select account</option>` + state.accounts.map(account => `<option value="${account.id}" ${account.id === selectedId ? 'selected' : ''}>${escapeHtml(account.email)}</option>`).join('');
}

function fillVoucherSelect(select, accountId, options = {}) {
  const vouchers = getRemainingVouchers(accountId, options);
  const preserve = options.preserve || '';
  select.innerHTML = vouchers.length ? vouchers.map(voucher => `<option value="${escapeHtml(voucher)}" ${voucherKey(voucher) === voucherKey(preserve) ? 'selected' : ''}>${escapeHtml(voucher)}</option>`).join('') : '<option value="">No available vouchers</option>';
}

function openModal(modal) { modal.hidden = false; document.body.classList.add('modal-open'); }
function closeModal(modal) { modal.hidden = true; if (![els.accountModal, els.checkoutModal, els.batchModal, els.editCheckoutModal].some(item => !item.hidden)) document.body.classList.remove('modal-open'); }

function sortAccounts(a, b, sort) {
  if (sort === 'newest') return new Date(b.purchasedAt) - new Date(a.purchasedAt);
  if (sort === 'oldest') return new Date(a.purchasedAt) - new Date(b.purchasedAt);
  const rank = info => info.status === 'Available' ? 0 : info.status === 'Used' ? 1 : 2;
  const aRank = rank(getAccountStatusInfo(a));
  const bRank = rank(getAccountStatusInfo(b));
  return sort === 'expired' ? bRank - aRank : aRank - bRank;
}

function generateBatchId(customerName, customerTag = '', preserveBatchId = null) {
  const base = slugify(customerTag ? `${customerName} ${customerTag}` : customerName).slice(0, 18) || 'CUSTOMER';
  let max = 0;
  state.orders.forEach(order => {
    if (preserveBatchId && order.batchId === preserveBatchId) return;
    if (order.batchId.startsWith(base + '-')) {
      const n = Number(order.batchId.split('-').pop());
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
  });
  return `${base}-${String(max + 1).padStart(3, '0')}`;
}

function voucherKey(value) { return String(value || '').trim().toLowerCase(); }
function splitVouchers(value) { return uniqueByVoucherKey(String(value || '').split(/[,+]/).map(item => item.trim()).filter(Boolean)); }
function uniqueByVoucherKey(items) { const seen = new Set(); return items.filter(item => { const key = voucherKey(item); if (!key || seen.has(key)) return false; seen.add(key); return true; }); }
function normalizeStatus(value) { const matched = STATUS_OPTIONS.find(item => item.toLowerCase() === String(value || '').toLowerCase()); return matched || 'Processing'; }
function normalizeStatusClass(value) { return normalizeStatus(value).toLowerCase(); }
function uniqueTracking(checkouts) { return [...new Set(checkouts.map(item => String(item.tracking || '').trim()).filter(Boolean))]; }
function uid(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
function peso(value) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(value || 0)); }
function formatDate(value) { return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function formatTime(value) { return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function formatDateTime(value) { return `${formatDate(value)} · ${formatTime(value)}`; }
function slugify(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toUpperCase(); }
function clampNumber(value, min, fallback) { const n = Number(value); return Number.isFinite(n) && n >= min ? n : fallback; }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(value) { return escapeHtml(value); }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : { accounts: [], orders: [] };
    parsed.accounts ||= [];
    parsed.orders ||= [];
    return parsed;
  } catch {
    return { accounts: [], orders: [] };
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function migrateLegacyData() {
  if (state.accounts.length || state.orders.length) return;
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.accounts || parsed?.orders) {
        state.accounts = parsed.accounts || [];
        state.orders = parsed.orders || [];
        saveState();
        break;
      }
    } catch {}
  }
}
