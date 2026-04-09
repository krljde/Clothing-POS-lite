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
  els.openCheckoutBtn.addEventListener('click', () => { syncCheckoutGroups(); openModal(els.checkoutModal); });
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
  els.views.forEach(v => v.classList.toggle('active', v.id === viewId));
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
  const profit = state.orders.reduce((s, o) => s + getOrderProfit(o), 0);
  const revenue = state.orders.reduce((s, o) => s + (Number(o.totalPrice) || 0), 0);
  const statuses = state.accounts.map(getAccountStatusInfo);
  els.statCheckouts.textContent = String(state.orders.length);
  els.statProfit.textContent = peso(profit);
  if (els.statRevenue) els.statRevenue.textContent = peso(revenue);
  els.statAvailable.textContent = String(statuses.filter(s => s.status === 'Available').length);
  els.statExpired.textContent = String(statuses.filter(s => s.status === 'Expired').length);
  els.statItems.textContent = String(state.orders.reduce((s, o) => s + (Number(o.itemCount) || 0), 0));
}

function renderCustomers() {
  const names = [...new Set(state.orders.map(o => o.customerName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  els.customerList.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

function renderRecentOrders() {
  const groups = getOrderGroups().slice(0, 5);
  if (!groups.length) {
    els.recentOrders.innerHTML = '<p class="empty-note">No orders yet — add your first checkout!</p>';
    return;
  }
  els.recentOrders.innerHTML = groups.map(group => `
    <button class="order-mini" type="button" data-open-batch="${group.batchId}">
      <div>
        <span class="order-mini-name">${escapeHtml(group.customerLabel)}</span>
        <span class="order-mini-meta">${formatDate(group.orderDate)} · ${group.checkouts.length} checkout${group.checkouts.length > 1 ? 's' : ''}</span>
      </div>
      <span class="order-mini-profit">${peso(group.totalProfit)}</span>
    </button>
  `).join('');
}

function renderAccounts() {
  const sort = els.accountSort.value;
  const accounts = [...state.accounts].sort((a, b) => sortAccounts(a, b, sort));
  if (!accounts.length) {
    els.accountsList.innerHTML = '<div class="recent-card"><p class="empty-note">No accounts yet — add your first account!</p></div>';
    return;
  }
  els.accountsList.innerHTML = accounts.map(account => {
    const info = getAccountStatusInfo(account);
    const title = info.remainingVouchers.length ? `Available: ${info.remainingVouchers.join(', ')}` : info.status;
    return `
      <article class="account-row">
        <div class="account-main">
          <div>
            <span class="field-label">Account</span>
            <span class="field-main">${escapeHtml(account.email)}</span>
            <span class="field-sub">${escapeHtml(account.password || 'No password saved')}</span>
          </div>
          <div>
            <span class="field-label">Cost</span>
            <span class="field-main">${peso(account.cost)}</span>
            <span class="field-sub">${account.expiryHours}h expiry</span>
          </div>
          <div>
            <span class="field-label">Purchased</span>
            <span class="field-main">${formatDate(account.purchasedAt)}</span>
            <span class="field-sub">${hoursLeftLabel(account)}</span>
          </div>
          <div>
            <span class="field-label">Vouchers Left</span>
            <span class="field-main">${info.remainingVouchers.length}</span>
            <span class="field-sub">${escapeHtml(info.remainingVouchers.join(', ') || 'None')}</span>
          </div>
          <div>
            <span class="field-label">Status</span>
            <span class="badge ${info.status.toLowerCase()}" title="${escapeHtml(title)}">${info.status}</span>
          </div>
        </div>
        <div class="account-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-edit-account="${account.id}">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" data-delete-account="${account.id}">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderOrders() {
  const groups = getOrderGroups();
  if (!groups.length) {
    els.ordersList.innerHTML = '<div class="recent-card"><p class="empty-note">No orders yet.</p></div>';
    return;
  }
  const rows = groups.map(group => {
    const tracking = uniqueTracking(group.checkouts).join(', ') || '—';
    const revenue = group.checkouts.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
    return `
      <button class="order-list-row" type="button" data-open-batch="${group.batchId}">
        <div>
          <strong style="font-weight:600;font-size:14px;display:block">${escapeHtml(group.customerLabel)}</strong>
          <span style="font-size:12px;color:var(--text-3)">${group.checkouts.length} checkout${group.checkouts.length > 1 ? 's' : ''}</span>
        </div>
        <div>
          <strong style="font-weight:600;font-size:13px;display:block">${formatDate(group.orderDate)}</strong>
          <span style="font-size:12px;color:var(--text-3)">${formatTime(group.orderDate)}</span>
        </div>
        <div><span class="badge ${normalizeStatusClass(group.status)}">${group.status}</span></div>
        <div style="font-size:13px;font-weight:500;color:var(--text-2)">${escapeHtml(tracking)}</div>
        <div style="font-weight:600;font-size:14px">${peso(revenue)}</div>
        <div style="font-weight:700;font-size:14px;color:var(--green)">${peso(group.totalProfit)}</div>
      </button>
    `;
  }).join('');

  els.ordersList.innerHTML = `
    <section class="orders-table-shell">
      <div class="orders-table-head">
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
      <article class="checkout-card">
        <div class="checkout-card-head">
          <span class="checkout-num">Checkout ${index + 1}</span>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Item Count *</label>
            <input class="form-input" name="itemCount[]" type="number" min="1" step="1" placeholder="1" value="${escapeAttr(old.itemCount || '1')}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Account *</label>
            <select class="form-select group-account-select" data-index="${index}" required>
              <option value="">Select account…</option>
              ${state.accounts.map(a => `<option value="${a.id}" ${old.accountId === a.id ? 'selected' : ''}>${escapeHtml(a.email)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Voucher *</label>
            <select class="form-select group-voucher-select" data-index="${index}" required></select>
          </div>
          <div class="form-group">
            <label class="form-label">Tracking Number</label>
            <input class="form-input" name="tracking[]" placeholder="Tracking #" value="${escapeAttr(old.tracking || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Total Price (₱) *</label>
            <input class="form-input" name="totalPrice[]" type="number" step="0.01" min="0" placeholder="0.00" value="${escapeAttr(old.totalPrice || '')}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Discounted Price (₱) *</label>
            <input class="form-input" name="discountedPrice[]" type="number" step="0.01" min="0" placeholder="0.00" value="${escapeAttr(old.discountedPrice || '')}" required />
          </div>
          <div class="form-group span-2" style="grid-column:span 2">
            <label class="form-label">Refund (₱)</label>
            <input class="form-input" name="refund[]" type="number" step="0.01" min="0" placeholder="0.00" value="${escapeAttr(old.refund || '')}" />
          </div>
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
  if (checkouts.some(i => !i.accountId || !i.voucherUsed)) return alert('Please complete all checkout entries.');
  const batchId = generateBatchId(customerName, customerTag);
  const now = new Date().toISOString();
  checkouts.forEach((item, index) => {
    state.orders.unshift({
      id: uid('ord'), batchId,
      checkoutId: `${batchId}-${String(index + 1).padStart(2, '0')}`,
      customerName, customerTag, createdAt: now,
      itemCount: item.itemCount, accountId: item.accountId,
      voucherUsed: item.voucherUsed, tracking: item.tracking,
      totalPrice: item.totalPrice, discountedPrice: item.discountedPrice,
      refund: item.refund, deliveryStatus: 'Processing'
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
  const group = getOrderGroups().find(g => g.batchId === batchId);
  if (!group) return;
  els.batchModalTitle.textContent = group.customerLabel;
  const revenue = group.checkouts.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
  els.batchSummary.innerHTML = `
    <div class="batch-metrics" style="margin-bottom:16px">
      <div class="batch-metric"><span class="field-label">Order Date</span><span class="field-main">${formatDateTime(group.orderDate)}</span></div>
      <div class="batch-metric"><span class="field-label">Status</span><span class="badge ${normalizeStatusClass(group.status)}">${group.status}</span></div>
      <div class="batch-metric"><span class="field-label">Tracking</span><span class="field-main">${escapeHtml(uniqueTracking(group.checkouts).join(', ') || '—')}</span></div>
      <div class="batch-metric"><span class="field-label">Items</span><span class="field-main">${group.totalItems}</span></div>
      <div class="batch-metric"><span class="field-label">Revenue</span><span class="field-main">${peso(revenue)}</span></div>
      <div class="batch-metric"><span class="field-label">Profit</span><span class="field-main" style="color:var(--green)">${peso(group.totalProfit)}</span></div>
    </div>
  `;
  renderBatchCheckouts(group.checkouts);
  openModal(els.batchModal);
}

function renderBatchCheckouts(checkouts) {
  els.batchCheckouts.innerHTML = checkouts.map(order => `
    <article class="checkout-detail-card">
      <div class="checkout-detail-grid">
        <div><span class="field-label">Voucher</span><span class="field-main">${escapeHtml(order.voucherUsed)}</span></div>
        <div><span class="field-label">Account</span><span class="field-main">${escapeHtml(getAccountById(order.accountId)?.email || 'Unknown')}</span></div>
        <div><span class="field-label">Items</span><span class="field-main">${escapeHtml(String(order.itemCount || 0))}</span></div>
        <div><span class="field-label">Revenue</span><span class="field-main">${peso(order.totalPrice)}</span></div>
        <div><span class="field-label">Checkout Cost</span><span class="field-main">${peso(order.discountedPrice)}</span></div>
        <div><span class="field-label">Refund</span><span class="field-main">${peso(order.refund)}</span></div>
        <div><span class="field-label">Tracking</span><span class="field-main">${escapeHtml(order.tracking || '—')}</span></div>
        <div>
          <span class="field-label">Status</span>
          <select class="inline-status" data-order-id="${order.id}">
            ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === normalizeStatus(order.deliveryStatus) ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div><span class="field-label">Profit</span><span class="field-main" style="color:var(--green)">${peso(getOrderProfit(order))}</span></div>
      </div>
      <div class="checkout-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-edit-order="${order.id}">Edit</button>
        <button type="button" class="btn btn-danger btn-sm" data-delete-order="${order.id}">Delete</button>
      </div>
    </article>
  `).join('');
}

function openEditCheckoutModal(orderId) {
  const order = state.orders.find(o => o.id === orderId);
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
  const order = state.orders.find(o => o.id === orderId);
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
  const batchOrders = state.orders.filter(o => o.batchId === oldBatchId).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
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
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.deliveryStatus = normalizeStatus(status);
  saveState();
  render();
  if (currentBatchId) openBatchModal(currentBatchId);
}

function deleteAccount(accountId) {
  if (state.orders.some(o => o.accountId === accountId)) return alert('This account has checkouts. Move or delete those first.');
  if (!confirm('Delete this account?')) return;
  state.accounts = state.accounts.filter(a => a.id !== accountId);
  saveState(); render();
}

function deleteOrder(orderId) {
  if (!confirm('Delete this checkout?')) return;
  const batchId = state.orders.find(o => o.id === orderId)?.batchId;
  state.orders = state.orders.filter(o => o.id !== orderId);
  saveState(); render();
  if (batchId) {
    const stillExists = state.orders.some(o => o.batchId === batchId);
    if (stillExists) openBatchModal(batchId);
    else closeModal(els.batchModal);
  }
}

function getOrderGroups() {
  const map = new Map();
  [...state.orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(order => {
    if (!map.has(order.batchId)) map.set(order.batchId, []);
    map.get(order.batchId).push(order);
  });
  return [...map.entries()].map(([batchId, checkouts]) => {
    const sorted = [...checkouts].sort((a,b) => a.checkoutId.localeCompare(b.checkoutId));
    const first = sorted[0];
    return {
      batchId, checkouts: sorted,
      customerLabel: first.customerTag ? `${first.customerName} · ${first.customerTag}` : first.customerName,
      orderDate: first.createdAt,
      totalProfit: sorted.reduce((s, i) => s + getOrderProfit(i), 0),
      totalItems: sorted.reduce((s, i) => s + Number(i.itemCount || 0), 0),
      status: summarizeGroupStatus(sorted)
    };
  }).sort((a,b) => new Date(b.orderDate) - new Date(a.orderDate));
}

function summarizeGroupStatus(checkouts) {
  const statuses = checkouts.map(i => normalizeStatus(i.deliveryStatus));
  if (statuses.every(s => s === 'Delivered')) return 'Delivered';
  if (statuses.every(s => s === 'Cancelled')) return 'Cancelled';
  if (statuses.some(s => s === 'Shipped' || s === 'Delivered')) return 'Shipped';
  return 'Processing';
}

function getOrderProfit(o) { return Number(o.totalPrice||0) - Number(o.discountedPrice||0) + Number(o.refund||0); }
function getAccountById(id) { return state.accounts.find(a => a.id === id) || null; }
function getExpiresAt(account) { return new Date(new Date(account.purchasedAt).getTime() + account.expiryHours * 3600000); }
function hoursLeftLabel(account) { const hrs = (getExpiresAt(account).getTime() - Date.now()) / 3600000; return hrs <= 0 ? 'Expired' : `${Math.floor(hrs)}h left`; }

function getAccountStatusInfo(account) {
  if (getExpiresAt(account).getTime() <= Date.now()) return { status: 'Expired', remainingVouchers: [] };
  const remainingVouchers = getRemainingVouchers(account.id);
  return { status: remainingVouchers.length ? 'Available' : 'Used', remainingVouchers };
}

function getUsedVoucherKeys(accountId, excludeOrderId = null) {
  return new Set(state.orders.filter(o => o.accountId === accountId && o.id !== excludeOrderId).map(o => voucherKey(o.voucherUsed)).filter(Boolean));
}

function getRemainingVouchers(accountId, options = {}) {
  const { excludeOrderId = null, pendingSelections = [], preserve = '' } = options;
  const account = getAccountById(accountId);
  if (!account) return [];
  const used = getUsedVoucherKeys(accountId, excludeOrderId);
  pendingSelections.filter(i => i.accountId === accountId).forEach(i => used.add(voucherKey(i.voucherUsed)));
  const allowed = account.availableVouchers.filter(v => !used.has(voucherKey(v)));
  if (preserve && !allowed.some(v => voucherKey(v) === voucherKey(preserve))) allowed.unshift(preserve);
  return uniqueByVoucherKey(allowed);
}

function fillAccountSelect(select, selectedId = '') {
  select.innerHTML = `<option value="">Select account…</option>` +
    state.accounts.map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${escapeHtml(a.email)}</option>`).join('');
}

function fillVoucherSelect(select, accountId, options = {}) {
  const vouchers = getRemainingVouchers(accountId, options);
  const preserve = options.preserve || '';
  select.innerHTML = vouchers.length
    ? vouchers.map(v => `<option value="${escapeHtml(v)}" ${voucherKey(v) === voucherKey(preserve) ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')
    : '<option value="">No vouchers available</option>';
}

function openModal(modal) { modal.hidden = false; document.body.classList.add('modal-open'); }
function closeModal(modal) {
  modal.hidden = true;
  if (![els.accountModal, els.checkoutModal, els.batchModal, els.editCheckoutModal].some(m => !m.hidden)) {
    document.body.classList.remove('modal-open');
  }
}

function sortAccounts(a, b, sort) {
  if (sort === 'newest') return new Date(b.purchasedAt) - new Date(a.purchasedAt);
  if (sort === 'oldest') return new Date(a.purchasedAt) - new Date(b.purchasedAt);
  const rank = info => info.status === 'Available' ? 0 : info.status === 'Used' ? 1 : 2;
  const aRank = rank(getAccountStatusInfo(a)), bRank = rank(getAccountStatusInfo(b));
  return sort === 'expired' ? bRank - aRank : aRank - bRank;
}

function generateBatchId(customerName, customerTag = '', preserveBatchId = null) {
  const base = slugify(customerTag ? `${customerName} ${customerTag}` : customerName).slice(0, 18) || 'CUSTOMER';
  let max = 0;
  state.orders.forEach(o => {
    if (preserveBatchId && o.batchId === preserveBatchId) return;
    if (o.batchId.startsWith(base + '-')) {
      const n = Number(o.batchId.split('-').pop());
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
  });
  return `${base}-${String(max + 1).padStart(3, '0')}`;
}

function voucherKey(v) { return String(v || '').trim().toLowerCase(); }
function splitVouchers(v) { return uniqueByVoucherKey(String(v || '').split(/[,+]/).map(s => s.trim()).filter(Boolean)); }
function uniqueByVoucherKey(items) { const seen = new Set(); return items.filter(i => { const k = voucherKey(i); if (!k || seen.has(k)) return false; seen.add(k); return true; }); }
function normalizeStatus(v) { const m = STATUS_OPTIONS.find(s => s.toLowerCase() === String(v || '').toLowerCase()); return m || 'Processing'; }
function normalizeStatusClass(v) { return normalizeStatus(v).toLowerCase(); }
function uniqueTracking(checkouts) { return [...new Set(checkouts.map(i => String(i.tracking || '').trim()).filter(Boolean))]; }
function uid(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
function peso(v) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(v || 0)); }
function formatDate(v) { return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v)); }
function formatTime(v) { return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(v)); }
function formatDateTime(v) { return `${formatDate(v)} · ${formatTime(v)}`; }
function slugify(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toUpperCase(); }
function clampNumber(v, min, fallback) { const n = Number(v); return Number.isFinite(n) && n >= min ? n : fallback; }
function escapeHtml(v) { return String(v || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(v) { return escapeHtml(v); }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : { accounts: [], orders: [] };
    parsed.accounts ||= [];
    parsed.orders ||= [];
    return parsed;
  } catch { return { accounts: [], orders: [] }; }
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
