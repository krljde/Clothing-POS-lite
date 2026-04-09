/* ─── Constants ───────────────────────────────────────── */
const STORAGE_KEY = 'shein_pos_lite_v9';
const LEGACY_KEYS = ['shein_pos_lite_v8','shein_pos_lite_v7','shein_pos_lite_v6','shein_pos_lite_v5','shein_pos_lite_v4','shein_pos_lite_v3','shein_pos_lite_v2','shein_pos_lite_v1'];
const STATUS_OPTIONS = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];

/* ─── State ───────────────────────────────────────────── */
const state = loadState();
let activeView = 'home-view';
let currentBatchId = null;
let orderFilter = { query: '', status: '' };
let customerQuery = '';

/* ─── Element refs ────────────────────────────────────── */
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
  openCheckoutBtn: document.getElementById('open-checkout-modal'),
  exportBtn: document.getElementById('export-btn'),
  importInput: document.getElementById('import-input'),
  orderSearch: document.getElementById('order-search'),
  orderSearchClear: document.getElementById('order-search-clear'),
  statusFilters: document.getElementById('status-filters'),
  customersList: document.getElementById('customers-list'),
  customerSearch: document.getElementById('customer-search'),
  customerSearchClear: document.getElementById('customer-search-clear'),
  customerModal: document.getElementById('customer-modal'),
  customerModalTitle: document.getElementById('customer-modal-title'),
  customerModalStats: document.getElementById('customer-modal-stats'),
  customerModalOrders: document.getElementById('customer-modal-orders'),
  toast: document.getElementById('toast'),
};

/* ─── Boot ────────────────────────────────────────────── */
migrateLegacyData();
bindEvents();
syncCheckoutGroups();
render();

/* ─── Event Binding ───────────────────────────────────── */
function bindEvents() {
  els.navBtns.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.viewTarget)));
  els.openAccountBtn.addEventListener('click', () => openAccountModal());
  els.openCheckoutBtn.addEventListener('click', () => { syncCheckoutGroups(); openModal(els.checkoutModal); });
  els.accountSort.addEventListener('change', renderAccounts);
  els.accountForm.addEventListener('submit', onSaveAccount);
  els.orderForm.addEventListener('submit', onAddOrderBatch);
  els.checkoutCount.addEventListener('change', syncCheckoutGroups);
  els.editOrderForm.addEventListener('submit', onSaveCheckoutEdit);

  // Export / Import
  els.exportBtn.addEventListener('click', exportBackup);
  els.importInput.addEventListener('change', importBackup);

  // Order search + filter
  els.orderSearch.addEventListener('input', () => {
    orderFilter.query = els.orderSearch.value.trim();
    els.orderSearchClear.hidden = !orderFilter.query;
    renderOrders();
  });
  els.orderSearchClear.addEventListener('click', () => {
    els.orderSearch.value = '';
    orderFilter.query = '';
    els.orderSearchClear.hidden = true;
    renderOrders();
  });
  els.statusFilters.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    [...els.statusFilters.querySelectorAll('.chip')].forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    orderFilter.status = chip.dataset.status;
    renderOrders();
  });

  // Customer search
  els.customerSearch.addEventListener('input', () => {
    customerQuery = els.customerSearch.value.trim();
    els.customerSearchClear.hidden = !customerQuery;
    renderCustomerHistory();
  });
  els.customerSearchClear.addEventListener('click', () => {
    els.customerSearch.value = '';
    customerQuery = '';
    els.customerSearchClear.hidden = true;
    renderCustomerHistory();
  });

  // Delegated clicks
  document.addEventListener('click', (e) => {
    const closeId = e.target.getAttribute('data-close-modal');
    if (closeId) { closeModal(document.getElementById(closeId)); return; }

    const batchId = e.target.closest('[data-open-batch]')?.getAttribute('data-open-batch');
    if (batchId) { openBatchModal(batchId); return; }

    const accountId = e.target.getAttribute('data-edit-account');
    if (accountId) { openAccountModal(accountId); return; }

    const deleteAccountId = e.target.getAttribute('data-delete-account');
    if (deleteAccountId) { deleteAccount(deleteAccountId); return; }

    const editOrderId = e.target.getAttribute('data-edit-order');
    if (editOrderId) { openEditCheckoutModal(editOrderId); return; }

    const deleteOrderId = e.target.getAttribute('data-delete-order');
    if (deleteOrderId) { deleteOrder(deleteOrderId); return; }

    const customerName = e.target.closest('[data-open-customer]')?.getAttribute('data-open-customer');
    if (customerName) { openCustomerModal(customerName); return; }

    // Quick status buttons inside batch modal
    const qs = e.target.closest('[data-quick-status]');
    if (qs) {
      const status = qs.dataset.quickStatus;
      const orderId = qs.dataset.orderId;
      updateInlineStatus(orderId, status);
      return;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('.group-account-select') || e.target.matches('.group-voucher-select')) {
      refreshGroupVoucherOptions();
    }
    if (e.target.matches('.inline-status')) {
      updateInlineStatus(e.target.dataset.orderId, e.target.value);
    }
    if (e.target === els.editAccountId) {
      fillVoucherSelect(els.editVoucherUsed, els.editAccountId.value, {
        excludeOrderId: els.editOrderForm.orderId.value || null,
        preserve: els.editVoucherUsed.value
      });
    }
  });
}

/* ─── View ────────────────────────────────────────────── */
function setView(viewId) {
  activeView = viewId;
  els.views.forEach(v => v.classList.toggle('active', v.id === viewId));
  els.navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.viewTarget === viewId));
  if (viewId === 'customers-view') renderCustomerHistory();
}

/* ─── Render All ──────────────────────────────────────── */
function render() {
  renderStats();
  renderCustomers();
  renderRecentOrders();
  renderAccounts();
  renderOrders();
  if (activeView === 'customers-view') renderCustomerHistory();
}

/* ─── Stats ───────────────────────────────────────────── */
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

/* ─── Customers datalist ──────────────────────────────── */
function renderCustomers() {
  const names = [...new Set(state.orders.map(o => o.customerName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  els.customerList.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

/* ─── Recent Orders (home) ────────────────────────────── */
function renderRecentOrders() {
  const groups = getOrderGroups().slice(0, 5);
  if (!groups.length) {
    els.recentOrders.innerHTML = '<p class="empty-note">No orders yet — add your first checkout!</p>';
    return;
  }
  els.recentOrders.innerHTML = groups.map(g => `
    <button class="order-mini" type="button" data-open-batch="${g.batchId}">
      <div>
        <span class="order-mini-name">${escapeHtml(g.customerLabel)}</span>
        <span class="order-mini-meta">${formatDate(g.orderDate)} · ${g.checkouts.length} checkout${g.checkouts.length > 1 ? 's' : ''} · <span class="badge ${normalizeStatusClass(g.status)}" style="font-size:10px;padding:1px 7px">${g.status}</span></span>
      </div>
      <span class="order-mini-profit">${peso(g.totalProfit)}</span>
    </button>
  `).join('');
}

/* ─── Accounts ────────────────────────────────────────── */
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

/* ─── Orders (with search + filter) ──────────────────── */
function renderOrders() {
  let groups = getOrderGroups();

  // Filter by status
  if (orderFilter.status) {
    groups = groups.filter(g => normalizeStatusClass(g.status) === orderFilter.status.toLowerCase());
  }

  // Filter by search query
  if (orderFilter.query) {
    const q = orderFilter.query.toLowerCase();
    groups = groups.filter(g =>
      g.customerLabel.toLowerCase().includes(q) ||
      uniqueTracking(g.checkouts).some(t => t.toLowerCase().includes(q)) ||
      g.checkouts.some(c => (c.customerTag || '').toLowerCase().includes(q))
    );
  }

  if (!groups.length) {
    const hasData = getOrderGroups().length > 0;
    els.ordersList.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">${hasData ? '🔍' : '📦'}</div>
        <p>${hasData ? 'No orders match your search or filter.' : 'No orders yet — tap + to add your first checkout!'}</p>
      </div>
    `;
    return;
  }

  const total = getOrderGroups().length;
  const shown = groups.length;
  const countLabel = (orderFilter.query || orderFilter.status) && shown < total
    ? `<p class="result-count">Showing ${shown} of ${total} orders</p>`
    : '';

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
    ${countLabel}
    <section class="orders-table-shell">
      <div class="orders-table-head">
        <div>Customer</div><div>Order Date</div><div>Status</div>
        <div>Tracking</div><div>Revenue</div><div>Profit</div>
      </div>
      ${rows}
    </section>
  `;
}

/* ─── Customer History View ───────────────────────────── */
function renderCustomerHistory() {
  const allGroups = getOrderGroups();
  // Build per-customer summaries
  const customerMap = new Map();
  allGroups.forEach(g => {
    const name = g.checkouts[0]?.customerName || 'Unknown';
    if (!customerMap.has(name)) customerMap.set(name, []);
    customerMap.get(name).push(g);
  });

  let customers = [...customerMap.entries()].map(([name, groups]) => {
    const totalProfit = groups.reduce((s, g) => s + g.totalProfit, 0);
    const totalRevenue = groups.reduce((s, g) => s + g.checkouts.reduce((ss, c) => ss + Number(c.totalPrice||0), 0), 0);
    const totalItems = groups.reduce((s, g) => s + g.totalItems, 0);
    const lastOrder = groups[0].orderDate;
    return { name, groups, totalProfit, totalRevenue, totalItems, lastOrder };
  }).sort((a, b) => b.totalProfit - a.totalProfit);

  // Filter by search
  if (customerQuery) {
    const q = customerQuery.toLowerCase();
    customers = customers.filter(c => c.name.toLowerCase().includes(q));
  }

  if (!customers.length) {
    els.customersList.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">👤</div>
        <p>${customerQuery ? 'No customers match your search.' : 'No customer data yet.'}</p>
      </div>
    `;
    return;
  }

  els.customersList.innerHTML = customers.map(c => {
    const recentOrders = c.groups.slice(0, 3);
    return `
      <article class="customer-card" data-open-customer="${escapeAttr(c.name)}">
        <div class="customer-card-header">
          <div>
            <div class="customer-card-name">${escapeHtml(c.name)}</div>
            <div class="customer-card-meta">${c.groups.length} order batch${c.groups.length > 1 ? 'es' : ''} · Last: ${formatDate(c.lastOrder)}</div>
          </div>
          <div class="customer-card-right">
            <div class="customer-stat">
              <span class="cs-val">${peso(c.totalRevenue)}</span>
              <span class="cs-lbl">Revenue</span>
            </div>
            <div class="customer-stat">
              <span class="cs-val" style="color:var(--green)">${peso(c.totalProfit)}</span>
              <span class="cs-lbl">Profit</span>
            </div>
            <div class="customer-stat">
              <span class="cs-val">${c.totalItems}</span>
              <span class="cs-lbl">Items</span>
            </div>
          </div>
        </div>
        <div class="customer-orders-preview">
          ${recentOrders.map(g => `
            <span class="customer-order-chip">
              <span class="badge ${normalizeStatusClass(g.status)}" style="font-size:10px;padding:1px 6px">${g.status}</span>
              ${formatDate(g.orderDate)} · ${peso(g.totalProfit)}
            </span>
          `).join('')}
          ${c.groups.length > 3 ? `<span style="font-size:12px;color:var(--text-3);align-self:center">+${c.groups.length - 3} more</span>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

/* ─── Customer History Modal ──────────────────────────── */
function openCustomerModal(customerName) {
  const allGroups = getOrderGroups().filter(g => g.checkouts[0]?.customerName === customerName);
  if (!allGroups.length) return;

  const totalProfit = allGroups.reduce((s, g) => s + g.totalProfit, 0);
  const totalRevenue = allGroups.reduce((s, g) => s + g.checkouts.reduce((ss, c) => ss + Number(c.totalPrice||0), 0), 0);
  const totalItems = allGroups.reduce((s, g) => s + g.totalItems, 0);
  const totalCheckouts = allGroups.reduce((s, g) => s + g.checkouts.length, 0);

  els.customerModalTitle.textContent = customerName;
  els.customerModalStats.innerHTML = `
    <div class="chg-card"><span class="field-label">Order Batches</span><span class="field-main">${allGroups.length}</span></div>
    <div class="chg-card"><span class="field-label">Checkouts</span><span class="field-main">${totalCheckouts}</span></div>
    <div class="chg-card"><span class="field-label">Revenue</span><span class="field-main">${peso(totalRevenue)}</span></div>
    <div class="chg-card"><span class="field-label">Profit</span><span class="field-main" style="color:var(--green)">${peso(totalProfit)}</span></div>
  `;
  els.customerModalStats.className = 'customer-history-grid';

  els.customerModalOrders.innerHTML = allGroups.map(g => {
    const revenue = g.checkouts.reduce((s, i) => s + Number(i.totalPrice||0), 0);
    return `
      <article class="checkout-detail-card" style="cursor:pointer" data-open-batch="${g.batchId}">
        <div class="checkout-detail-grid" style="grid-template-columns:repeat(4,1fr)">
          <div><span class="field-label">Date</span><span class="field-main">${formatDate(g.orderDate)}</span></div>
          <div><span class="field-label">Status</span><span class="badge ${normalizeStatusClass(g.status)}">${g.status}</span></div>
          <div><span class="field-label">Revenue</span><span class="field-main">${peso(revenue)}</span></div>
          <div><span class="field-label">Profit</span><span class="field-main" style="color:var(--green)">${peso(g.totalProfit)}</span></div>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px">${g.checkouts.length} checkout${g.checkouts.length>1?'s':''} · Tracking: ${escapeHtml(uniqueTracking(g.checkouts).join(', ')||'—')}</div>
      </article>
    `;
  }).join('');

  openModal(els.customerModal);
}

/* ─── Account Modal ───────────────────────────────────── */
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
  if (!payload.email || !payload.availableVouchers.length) return alert('Please complete the account fields.');

  // Strict duplicate voucher check: warn if vouchers already exist on another account
  const dupes = payload.availableVouchers.filter(v =>
    state.accounts.some(a => a.id !== id && a.availableVouchers.some(av => voucherKey(av) === voucherKey(v)))
  );
  if (dupes.length) {
    const ok = confirm(`⚠️ Warning: ${dupes.map(escapeHtml).join(', ')} already exist on another account. Add anyway?`);
    if (!ok) return;
  }

  if (id) {
    Object.assign(state.accounts.find(a => a.id === id), payload);
  } else {
    state.accounts.unshift({ id: uid('acct'), purchasedAt: new Date().toISOString(), ...payload });
  }
  saveState();
  closeModal(els.accountModal);
  render();
  showToast('Account saved ✓', 'success');
}

/* ─── Checkout Groups ─────────────────────────────────── */
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
  els.checkoutGroups.innerHTML = Array.from({ length: count }, (_, i) => {
    const old = oldValues[i] || {};
    return `
      <article class="checkout-card">
        <div class="checkout-card-head">
          <span class="checkout-num">Checkout ${i + 1}</span>
        </div>
        <div class="form-row checkout-card-row">
          <div class="form-group">
            <label class="form-label">Account *</label>
            <select class="form-select group-account-select" name="accountId[]" data-index="${i}" required>
              <option value="">Select account…</option>
              ${state.accounts.map(a => `<option value="${a.id}" ${old.accountId === a.id ? 'selected' : ''}>${escapeHtml(a.email)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Voucher *</label>
            <select class="form-select group-voucher-select" name="voucherUsed[]" data-index="${i}" required></select>
            <span class="voucher-warn" id="vwarn-${i}">⚠ Voucher already used on another order</span>
          </div>
          <div class="form-group">
            <label class="form-label">Tracking Number</label>
            <input class="form-input" name="tracking[]" placeholder="Tracking #" value="${escapeAttr(old.tracking || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Item Count *</label>
            <input class="form-input" name="itemCount[]" type="number" min="1" step="1" placeholder="1" value="${escapeAttr(old.itemCount || '1')}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Total Price (₱) *</label>
            <input class="form-input" name="totalPrice[]" type="number" step="0.01" min="0" placeholder="0.00" value="${escapeAttr(old.totalPrice || '')}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Discounted Price (₱) *</label>
            <input class="form-input" name="discountedPrice[]" type="number" step="0.01" min="0" placeholder="0.00" value="${escapeAttr(old.discountedPrice || '')}" required />
          </div>
          <div class="form-group">
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
  const selections = cards.map((card, i) => ({
    index: i,
    accountId: card.querySelector('.group-account-select')?.value || '',
    voucherUsed: card.querySelector('.group-voucher-select')?.value || oldValues?.[i]?.voucherUsed || ''
  }));
  cards.forEach((card, i) => {
    const accountId = card.querySelector('.group-account-select').value;
    const voucherSelect = card.querySelector('.group-voucher-select');
    const current = selections[i].voucherUsed;
    const pendingSelections = selections.filter((item, idx) => idx !== i && item.accountId && item.voucherUsed);
    fillVoucherSelect(voucherSelect, accountId, { pendingSelections, preserve: current });
    // Show dupe warning if no vouchers available (all used)
    const warn = document.getElementById(`vwarn-${i}`);
    if (warn) {
      const allUsed = accountId && !getRemainingVouchers(accountId, { pendingSelections }).length;
      warn.classList.toggle('visible', allUsed);
    }
  });
}

/* ─── Add Order Batch ─────────────────────────────────── */
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

  // Strict cross-checkout duplicate check
  const seen = new Set();
  for (const c of checkouts) {
    const key = `${c.accountId}::${voucherKey(c.voucherUsed)}`;
    if (seen.has(key)) return alert(`Duplicate voucher "${c.voucherUsed}" used more than once in this batch.`);
    seen.add(key);
  }

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
  showToast(`${checkouts.length} checkout${checkouts.length>1?'s':''} saved ✓`, 'success');
}

/* ─── Batch Modal ─────────────────────────────────────── */
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
      <!-- Quick status buttons -->
      <div class="quick-status-bar">
        <span class="qs-label">Quick:</span>
        <button class="qbtn qbtn-processing" type="button" data-quick-status="Processing" data-order-id="${order.id}">Processing</button>
        <button class="qbtn qbtn-shipped" type="button" data-quick-status="Shipped" data-order-id="${order.id}">Shipped</button>
        <button class="qbtn qbtn-delivered" type="button" data-quick-status="Delivered" data-order-id="${order.id}">Delivered</button>
        <button class="qbtn qbtn-cancelled" type="button" data-quick-status="Cancelled" data-order-id="${order.id}">Cancelled</button>
      </div>
      <div class="checkout-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-edit-order="${order.id}">Edit</button>
        <button type="button" class="btn btn-danger btn-sm" data-delete-order="${order.id}">Delete</button>
      </div>
    </article>
  `).join('');
}

/* ─── Edit Checkout ───────────────────────────────────── */
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
  if (!customerName || !accountId || !voucherUsed) return alert('Please complete required fields.');

  // Strict: check voucher is valid for account
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
  showToast('Checkout updated ✓', 'success');
}

/* ─── Rename Batch ────────────────────────────────────── */
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

/* ─── Status Updates ──────────────────────────────────── */
function updateInlineStatus(orderId, status) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.deliveryStatus = normalizeStatus(status);
  saveState();
  render();
  if (currentBatchId) openBatchModal(currentBatchId);
}

/* ─── Delete ──────────────────────────────────────────── */
function deleteAccount(accountId) {
  if (state.orders.some(o => o.accountId === accountId)) return alert('This account has checkouts. Move or delete those first.');
  if (!confirm('Delete this account?')) return;
  state.accounts = state.accounts.filter(a => a.id !== accountId);
  saveState(); render();
  showToast('Account deleted', 'success');
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
  showToast('Checkout deleted', 'success');
}

/* ─── Export / Import ─────────────────────────────────── */
function exportBackup() {
  const data = JSON.stringify({ accounts: state.accounts, orders: state.orders, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `shein-pos-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported ✓', 'success');
}

function importBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.orders)) throw new Error('Invalid file');
      const ok = confirm(`Import ${parsed.accounts.length} accounts and ${parsed.orders.length} orders?\n\nThis will REPLACE all current data.`);
      if (!ok) return;
      state.accounts = parsed.accounts;
      state.orders = parsed.orders;
      saveState();
      render();
      showToast(`Imported ${parsed.accounts.length} accounts, ${parsed.orders.length} orders ✓`, 'success');
    } catch {
      showToast('Import failed — invalid file', 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

/* ─── Toast ───────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.className = `toast ${type}`;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('show'));
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
    setTimeout(() => { els.toast.hidden = true; }, 280);
  }, 2800);
}

/* ─── Modal helpers ───────────────────────────────────── */
function openModal(modal) { modal.hidden = false; document.body.classList.add('modal-open'); }
function closeModal(modal) {
  modal.hidden = true;
  const allModals = [els.accountModal, els.checkoutModal, els.batchModal, els.editCheckoutModal, els.customerModal];
  if (allModals.every(m => m.hidden)) document.body.classList.remove('modal-open');
}

/* ─── Data helpers ────────────────────────────────────── */
function getOrderGroups() {
  const map = new Map();
  [...state.orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(o => {
    if (!map.has(o.batchId)) map.set(o.batchId, []);
    map.get(o.batchId).push(o);
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
function getExpiresAt(a) { return new Date(new Date(a.purchasedAt).getTime() + a.expiryHours * 3600000); }
function hoursLeftLabel(a) { const hrs = (getExpiresAt(a).getTime() - Date.now()) / 3600000; return hrs <= 0 ? 'Expired' : `${Math.floor(hrs)}h left`; }

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

function sortAccounts(a, b, sort) {
  if (sort === 'newest') return new Date(b.purchasedAt) - new Date(a.purchasedAt);
  if (sort === 'oldest') return new Date(a.purchasedAt) - new Date(b.purchasedAt);
  const rank = info => info.status === 'Available' ? 0 : info.status === 'Used' ? 1 : 2;
  const aR = rank(getAccountStatusInfo(a)), bR = rank(getAccountStatusInfo(b));
  return sort === 'expired' ? bR - aR : aR - bR;
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

/* ─── Utility ─────────────────────────────────────────── */
function voucherKey(v) { return String(v || '').trim().toLowerCase(); }
function splitVouchers(v) { return uniqueByVoucherKey(String(v || '').split(/[,+]/).map(s => s.trim()).filter(Boolean)); }
function uniqueByVoucherKey(items) { const seen = new Set(); return items.filter(i => { const k = voucherKey(i); if (!k || seen.has(k)) return false; seen.add(k); return true; }); }
function normalizeStatus(v) { const m = STATUS_OPTIONS.find(s => s.toLowerCase() === String(v||'').toLowerCase()); return m || 'Processing'; }
function normalizeStatusClass(v) { return normalizeStatus(v).toLowerCase(); }
function uniqueTracking(checkouts) { return [...new Set(checkouts.map(i => String(i.tracking||'').trim()).filter(Boolean))]; }
function uid(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
function peso(v) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(v||0)); }
function formatDate(v) { return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v)); }
function formatTime(v) { return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(v)); }
function formatDateTime(v) { return `${formatDate(v)} · ${formatTime(v)}`; }
function slugify(v) { return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/(^-|-$)/g,'').toUpperCase(); }
function clampNumber(v, min, fallback) { const n = Number(v); return Number.isFinite(n) && n >= min ? n : fallback; }
function escapeHtml(v) { return String(v||'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(v) { return escapeHtml(v); }

/* ─── Persistence ─────────────────────────────────────── */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : { accounts: [], orders: [] };
    parsed.accounts ||= []; parsed.orders ||= [];
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
        saveState(); break;
      }
    } catch {}
  }
}
