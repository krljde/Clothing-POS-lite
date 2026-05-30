/* ─── Constants ───────────────────────────────────────── */
const STORAGE_KEY = 'shein_pos_lite_v10';
const STATUS_OPTIONS = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
const SYNC_STATUS_LABELS = {
  saved: 'Saved',
  saving: 'Saving...',
  offline: 'Offline',
  error: 'Sync error',
  pending: 'Update waiting'
};

/* ─── State ───────────────────────────────────────────── */
const state = loadState();
let activeView = 'home-view';
let currentBatchId = null;
let orderFilter = { query: '', status: '' };
let customerQuery = '';
let statsRange = { type: 'today', from: null, to: null };
const adSpendOpenMonths = new Set([dayKey(new Date()).slice(0, 7)]); // months expanded in the Ad Spend Log
let pendingRemoteState = null;
let pendingRemoteBaseJson = null;
let lastFocusedBeforeModal = null;

/* ─── Element refs ────────────────────────────────────── */
const els = {
  views: [...document.querySelectorAll('.view')],
  navBtns: [...document.querySelectorAll('.nav-btn')],
  tabBtns: [...document.querySelectorAll('.tab-btn[data-view-target]')],
  statCheckouts: document.getElementById('stat-checkouts'),
  statProfit: document.getElementById('stat-profit'),
  statAdspend: document.getElementById('stat-adspend'),
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
  fabToggle: document.getElementById('fab-toggle'),
  fabMenu: document.getElementById('fab-menu'),
  fabMenuBackdrop: document.getElementById('fab-menu-backdrop'),
  adspendModal: document.getElementById('adspend-modal'),
  adspendModalForm: document.getElementById('adspend-modal-form'),
  exportBtn: document.getElementById('export-btn-desktop'),
  importInput: document.getElementById('import-input-desktop'),
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
  statsRangeChips: document.getElementById('stats-range-chips'),
  statsCustomRange: document.getElementById('stats-custom-range'),
  statsDateFrom: document.getElementById('stats-date-from'),
  statsDateTo: document.getElementById('stats-date-to'),
  statsApplyRange: document.getElementById('stats-apply-range'),
  statsKpiGrid: document.getElementById('stats-kpi-grid'),
  statsSummaryCard: document.getElementById('stats-summary-card'),
  statsBreakdown: document.getElementById('stats-breakdown'),
  statsAdspendCard: document.getElementById('stats-adspend-card'),
  syncStatus: document.getElementById('sync-status'),
  adminPanelBtn: document.getElementById('admin-panel-btn'),
  adminPanelBtnDesktop: document.getElementById('admin-panel-btn-desktop'),
};

/* ─── Boot ────────────────────────────────────────────── */
bindEvents();
syncCheckoutGroups();
render();
openViewFromHash();

/* ─── Event Binding ───────────────────────────────────── */
function bindEvents() {
  els.navBtns.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.viewTarget)));
  els.tabBtns.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.viewTarget)));
  window.addEventListener('hashchange', openViewFromHash);

  // More sheet (mobile)
  const moreBtn = document.getElementById('more-tab-btn');
  const moreSheet = document.getElementById('more-sheet');
  const moreBackdrop = document.getElementById('more-sheet-backdrop');
  moreBtn.setAttribute('aria-haspopup', 'dialog');
  moreBtn.setAttribute('aria-expanded', 'false');
  function openMoreSheet() {
    moreSheet.hidden = false; moreBackdrop.hidden = false;
    moreBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => { moreSheet.classList.add('visible'); moreBackdrop.classList.add('visible'); });
  }
  function closeMoreSheet() {
    moreSheet.classList.remove('visible'); moreBackdrop.classList.remove('visible');
    moreBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { moreSheet.hidden = true; moreBackdrop.hidden = true; }, 220);
  }
  moreBtn.addEventListener('click', openMoreSheet);
  moreBackdrop.addEventListener('click', closeMoreSheet);
  document.getElementById('export-btn').addEventListener('click', () => { closeMoreSheet(); exportBackup(); });
  document.getElementById('gmail-dot-btn').addEventListener('click', () => { closeMoreSheet(); openGmailDotModal(); });
  document.getElementById('gmail-dot-generate').addEventListener('click', generateGmailDots);
  els.openAccountBtn.addEventListener('click', () => openAccountModal());

  // FAB quick-actions menu
  function openFabMenu() {
    els.fabMenu.hidden = false; els.fabMenuBackdrop.hidden = false;
    requestAnimationFrame(() => { els.fabMenu.classList.add('visible'); els.fabMenuBackdrop.classList.add('visible'); });
    els.fabToggle.classList.add('open');
    els.fabToggle.setAttribute('aria-expanded', 'true');
  }
  function closeFabMenu() {
    els.fabMenu.classList.remove('visible'); els.fabMenuBackdrop.classList.remove('visible');
    els.fabToggle.classList.remove('open');
    els.fabToggle.setAttribute('aria-expanded', 'false');
    setTimeout(() => { els.fabMenu.hidden = true; els.fabMenuBackdrop.hidden = true; }, 220);
  }
  els.fabToggle.addEventListener('click', () => {
    (els.fabMenu.classList.contains('visible') ? closeFabMenu : openFabMenu)();
  });
  els.fabMenuBackdrop.addEventListener('click', closeFabMenu);
  const fabAction = fn => () => { closeFabMenu(); fn(); };
  document.getElementById('fab-add-checkout').addEventListener('click', fabAction(() => { syncCheckoutGroups(); openModal(els.checkoutModal); }));
  document.getElementById('fab-add-account').addEventListener('click', fabAction(() => openAccountModal()));
  document.getElementById('fab-add-adspend').addEventListener('click', fabAction(() => openAdSpendModal()));
  els.adspendModalForm.addEventListener('submit', onSaveAdSpendModal);

  // Stats range chips
  els.statsRangeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-range]');
    if (!chip) return;
    els.statsRangeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const range = chip.dataset.range;
    els.statsCustomRange.hidden = range !== 'custom';
    if (range !== 'custom') {
      statsRange = { type: range, from: null, to: null };
      renderStats_view();
    }
  });
  els.statsApplyRange.addEventListener('click', () => {
    const from = els.statsDateFrom.value;
    const to = els.statsDateTo.value;
    if (!from || !to) return alert('Please select both dates.');
    if (from > to) return alert('Start date must be before end date.');
    statsRange = { type: 'custom', from, to };
    renderStats_view();
  });
  els.accountSort.addEventListener('change', renderAccounts);
  els.accountForm.addEventListener('submit', onSaveAccount);
  document.getElementById('voucher-picker').addEventListener('change', syncVoucherHidden);
  els.orderForm.addEventListener('submit', onAddOrderBatch);
  els.checkoutCount.addEventListener('change', syncCheckoutGroups);
  els.editOrderForm.addEventListener('submit', onSaveCheckoutEdit);

  // Export / Import
  document.getElementById('export-btn-desktop').addEventListener('click', exportBackup);
  els.adminPanelBtnDesktop?.addEventListener('click', () => {
    const cogDrop = document.getElementById('cog-dropdown');
    if (cogDrop) cogDrop.hidden = true;
    document.getElementById('cog-toggle').setAttribute('aria-expanded', 'false');
    setView('admin-view');
  });
  els.adminPanelBtn?.addEventListener('click', () => {
    closeMoreSheet();
    setView('admin-view');
  });
  document.getElementById('gmail-dot-btn-desktop').addEventListener('click', () => {
    const cogDrop = document.getElementById('cog-dropdown');
    cogDrop.hidden = true;
    document.getElementById('cog-toggle').setAttribute('aria-expanded', 'false');
    openGmailDotModal();
  });
  document.querySelectorAll('#import-input, #import-input-desktop').forEach(inp => inp.addEventListener('change', (e) => {
    closeMoreSheet();
    importBackup(e);
  }));

  // Cog menu toggle
  const cogToggle = document.getElementById('cog-toggle');
  const cogDropdown = document.getElementById('cog-dropdown');
  cogToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !cogDropdown.hidden;
    cogDropdown.hidden = isOpen;
    cogToggle.setAttribute('aria-expanded', String(!isOpen));
  });
  document.addEventListener('click', () => {
    cogDropdown.hidden = true;
    cogToggle.setAttribute('aria-expanded', 'false');
  });
  cogDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openModals = getOpenModals();
    if (openModals.length) {
      e.preventDefault();
      closeModal(openModals.at(-1));
      return;
    }
    if (els.fabMenu.classList.contains('visible')) {
      e.preventDefault();
      closeFabMenu();
      return;
    }
    if (!moreSheet.hidden) {
      e.preventDefault();
      closeMoreSheet();
      return;
    }
    if (!cogDropdown.hidden) {
      e.preventDefault();
      cogDropdown.hidden = true;
      cogToggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('focusout', () => setTimeout(flushPendingRemoteState, 0));

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
    if (closeId) {
      closeModal(document.getElementById(closeId)); return;
    }

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

    if (e.target.id === 'adspend-add') { onAddAdSpend(); return; }

    const deleteAdSpendDay = e.target.getAttribute('data-delete-adspend');
    if (deleteAdSpendDay) { deleteAdSpendEntry(deleteAdSpendDay); return; }

    const toggleMonth = e.target.closest('[data-toggle-month]')?.getAttribute('data-toggle-month');
    if (toggleMonth) {
      adSpendOpenMonths.has(toggleMonth) ? adSpendOpenMonths.delete(toggleMonth) : adSpendOpenMonths.add(toggleMonth);
      renderAdSpendEditor();
      return;
    }

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
    if (e.target.matches('.adspend-input')) {
      onAdSpendInput(e.target);
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
  els.tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.viewTarget === viewId));
  if (viewId === 'customers-view') renderCustomerHistory();
  if (viewId === 'stats-view') renderStats_view();
  window.dispatchEvent(new CustomEvent('pos:viewchange', { detail: { viewId } }));
}

function openViewFromHash() {
  const viewId = window.location.hash.slice(1);
  if (viewId && els.views.some(v => v.id === viewId)) setView(viewId);
}

/* ─── Render All ──────────────────────────────────────── */
function render() {
  const profitContext = createProfitContext();
  renderBrand();
  renderStats(profitContext);
  renderCustomers();
  renderRecentOrders(profitContext);
  renderAccounts(profitContext);
  renderOrders(profitContext);
  if (activeView === 'customers-view') renderCustomerHistory(profitContext);
}

/* ─── Brand (header shop name) ────────────────────────── */
function renderBrand() {
  const el = document.querySelector('.brand-name');
  if (el) el.textContent = state.shopName || 'My Shop';
}

/* ─── Stats ───────────────────────────────────────────── */
function renderStats(profitContext = createProfitContext()) {
  const grossProfit = state.orders.reduce((s, o) => s + getOrderProfit(o, profitContext), 0);
  const adSpend = getTotalAdSpend();
  const profit = grossProfit - adSpend; // net of all-time ad spend
  const revenue = state.orders.reduce((s, o) => s + (Number(o.totalPrice) || 0), 0);
  const statuses = state.accounts.map(getAccountStatusInfo);
  els.statCheckouts.textContent = String(state.orders.length);
  els.statProfit.textContent = peso(profit);
  if (els.statProfit) els.statProfit.style.color = profit < 0 ? '#c0392b' : '';
  if (els.statAdspend) els.statAdspend.textContent = peso(adSpend);
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
function renderRecentOrders(profitContext = createProfitContext()) {
  const groups = getOrderGroups(profitContext).slice(0, 5);
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
      <span class="order-mini-profit" style="${g.totalProfit < 0 ? 'color:#c0392b' : ''}">${peso(g.totalProfit)}</span>
    </button>
  `).join('');
}

/* ─── Accounts ────────────────────────────────────────── */
function renderAccounts() {
  const sort = els.accountSort.value;
  const accounts = [...state.accounts].sort((a, b) => sortAccounts(a, b, sort));
  const ordersByAccount = groupOrdersByAccount();
  if (!accounts.length) {
    els.accountsList.innerHTML = '<div class="recent-card"><p class="empty-note">No accounts yet — add your first account!</p></div>';
    return;
  }
  els.accountsList.innerHTML = accounts.map(account => {
    const info = getAccountStatusInfo(account);
    const title = info.remainingVouchers.length ? `Available: ${info.remainingVouchers.join(', ')}` : info.status;
    const ordersOnAccount = ordersByAccount.get(account.id) || [];
    const totalRevenue = ordersOnAccount.reduce((s, o) => s + Number(o.totalPrice || 0), 0);
    const totalCheckoutCost = ordersOnAccount.reduce((s, o) => s + Number(o.discountedPrice || 0), 0);
    const totalRefund = ordersOnAccount.reduce((s, o) => s + Number(o.refund || 0), 0);
    const netProfit = totalRevenue - totalCheckoutCost + totalRefund - Number(account.cost || 0);
    const pnlClass = netProfit > 0 ? 'profit' : netProfit < 0 ? 'loss' : 'neutral';
    const pnlLabel = netProfit > 0
      ? `+${peso(netProfit)} profit`
      : netProfit < 0
        ? `${peso(Math.abs(netProfit))} to break even`
        : 'Break even';
    return `
      <article class="account-row">
        <div class="account-main">
          <div>
            <span class="field-label">Account</span>
            <span class="field-main wrap">${escapeHtml(account.email)}</span>
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
          <div>
            <span class="field-label">P&amp;L</span>
            <span class="acct-pnl ${pnlClass}">${pnlLabel}</span>
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
function renderOrders(profitContext = createProfitContext()) {
  const allGroups = getOrderGroups(profitContext);
  let groups = allGroups;

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
    const hasData = allGroups.length > 0;
    els.ordersList.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">${hasData ? '🔍' : '📦'}</div>
        <p>${hasData ? 'No orders match your search or filter.' : 'No orders yet — tap + to add your first checkout!'}</p>
      </div>
    `;
    return;
  }

  const total = allGroups.length;
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
        <div style="font-weight:700;font-size:14px;${group.totalProfit < 0 ? 'color:#c0392b' : 'color:var(--green)'}">${peso(group.totalProfit)}</div>
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
function renderCustomerHistory(profitContext = createProfitContext()) {
  const allGroups = getOrderGroups(profitContext);
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
              <span class="cs-val" style="${c.totalProfit < 0 ? 'color:#c0392b' : 'color:var(--green)'}">${peso(c.totalProfit)}</span>
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
  const profitContext = createProfitContext();
  const allGroups = getOrderGroups(profitContext).filter(g => g.checkouts[0]?.customerName === customerName);
  if (!allGroups.length) return;

  const totalProfit = allGroups.reduce((s, g) => s + g.totalProfit, 0);
  const totalRevenue = allGroups.reduce((s, g) => s + g.checkouts.reduce((ss, c) => ss + Number(c.totalPrice||0), 0), 0);
  const totalCheckouts = allGroups.reduce((s, g) => s + g.checkouts.length, 0);

  els.customerModalTitle.textContent = customerName;
  els.customerModalStats.innerHTML = `
    <div class="chg-card"><span class="field-label">Order Batches</span><span class="field-main">${allGroups.length}</span></div>
    <div class="chg-card"><span class="field-label">Checkouts</span><span class="field-main">${totalCheckouts}</span></div>
    <div class="chg-card"><span class="field-label">Revenue</span><span class="field-main">${peso(totalRevenue)}</span></div>
    <div class="chg-card"><span class="field-label">Profit</span><span class="field-main" style="${totalProfit < 0 ? 'color:#c0392b' : 'color:var(--green)'}">${peso(totalProfit)}</span></div>
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
          <div><span class="field-label">Profit</span><span class="field-main" style="${g.totalProfit < 0 ? 'color:#c0392b' : 'color:var(--green)'}">${peso(g.totalProfit)}</span></div>
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
  // Sync voucher checkboxes
  const existingVouchers = (account?.availableVouchers || []).map(v => voucherKey(v));
  document.querySelectorAll('#voucher-picker input[type="checkbox"]').forEach(cb => {
    cb.checked = existingVouchers.includes(voucherKey(cb.value));
  });
  syncVoucherHidden();
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
  const profitContext = createProfitContext();
  const group = getOrderGroups(profitContext).find(g => g.batchId === batchId);
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
      <div class="batch-metric"><span class="field-label">Profit</span><span class="field-main" style="${group.totalProfit < 0 ? 'color:#c0392b' : 'color:var(--green)'}">${peso(group.totalProfit)}</span></div>
    </div>
  `;
  renderBatchCheckouts(group.checkouts, profitContext);
  openModal(els.batchModal);
}

function renderBatchCheckouts(checkouts, profitContext = createProfitContext()) {
  els.batchCheckouts.innerHTML = checkouts.map(order => {
    const account = getAccountById(order.accountId);
    const accountCost = Number(account?.cost || 0);
    const ordersOnAccount = profitContext.orderCountByAccount.get(order.accountId) || 1;
    const costShare = accountCost / ordersOnAccount;
    const profit = getOrderProfit(order, profitContext);
    return `
    <article class="checkout-detail-card">
      <div class="checkout-detail-grid">
        <div><span class="field-label">Voucher</span><span class="field-main">${escapeHtml(order.voucherUsed)}</span></div>
        <div><span class="field-label">Account</span><span class="field-main wrap">${escapeHtml(account?.email || 'Unknown')}</span></div>
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
        <div>
          <span class="field-label">Acct Cost Share</span>
          <span class="field-main" style="color:var(--text-3)">−${peso(costShare)}</span>
          <span class="field-sub">${peso(accountCost)} ÷ ${ordersOnAccount} order${ordersOnAccount !== 1 ? 's' : ''}</span>
        </div>
        <div><span class="field-label">Profit</span><span class="field-main" style="${profit < 0 ? 'color:#c0392b' : 'color:var(--green)'}">${peso(profit)}</span></div>
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
  `; }).join('');
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

/* ─── Statistics View ─────────────────────────────────── */
function getStatsDateRange() {
  const now = new Date();
  const startOf = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endOf   = d => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  switch (statsRange.type) {
    case 'today':
      return { from: startOf(now), to: endOf(now), label: 'Today', prevFrom: startOf(new Date(now - 86400000)), prevTo: endOf(new Date(now - 86400000)) };
    case 'yesterday': {
      const y = new Date(now - 86400000);
      return { from: startOf(y), to: endOf(y), label: 'Yesterday', prevFrom: startOf(new Date(now - 172800000)), prevTo: endOf(new Date(now - 172800000)) };
    }
    case '7d': {
      const f = startOf(new Date(now - 6 * 86400000));
      return { from: f, to: endOf(now), label: 'Last 7 Days', prevFrom: startOf(new Date(now - 13 * 86400000)), prevTo: endOf(new Date(now - 7 * 86400000)) };
    }
    case '30d': {
      const f = startOf(new Date(now - 29 * 86400000));
      return { from: f, to: endOf(now), label: 'Last 30 Days', prevFrom: startOf(new Date(now - 59 * 86400000)), prevTo: endOf(new Date(now - 30 * 86400000)) };
    }
    case 'month': {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pme = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOf(f), to: endOf(now), label: 'This Month', prevFrom: startOf(pm), prevTo: endOf(pme) };
    }
    case 'custom': {
      const f = startOf(new Date(statsRange.from));
      const t = endOf(new Date(statsRange.to));
      const diff = t - f;
      const fmt = v => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'));
      const isSameYear = statsRange.from.slice(0,4) === statsRange.to.slice(0,4);
      const fmtShort = v => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', ...(isSameYear ? {} : { year: 'numeric' }) }).format(new Date(v + 'T00:00:00'));
      const rangeLabel = statsRange.from === statsRange.to ? fmt(statsRange.from) : `${fmtShort(statsRange.from)} – ${fmt(statsRange.to)}`;
      return { from: f, to: t, label: rangeLabel, prevFrom: new Date(f - diff), prevTo: new Date(f - 1) };
    }
    default: return { from: startOf(now), to: endOf(now), label: 'Today', prevFrom: startOf(new Date(now - 86400000)), prevTo: endOf(new Date(now - 86400000)) };
  }
}

function calcMetrics(orders, profitContext = createProfitContext()) {
  const revenue   = orders.reduce((s, o) => s + Number(o.totalPrice || 0), 0);
  const profit    = orders.reduce((s, o) => s + getOrderProfit(o, profitContext), 0);
  const items     = orders.reduce((s, o) => s + Number(o.itemCount || 0), 0);
  const checkouts = orders.length;
  const batches   = new Set(orders.map(o => o.batchId)).size;
  const avgOrderValue = batches ? revenue / batches : 0;
  return { revenue, profit, items, checkouts, batches, avgOrderValue };
}

function deltaArrow(curr, prev) {
  if (prev === 0 && curr === 0) return { pct: 0, cls: 'flat', arrow: '─' };
  if (prev === 0) return { pct: 100, cls: 'up', arrow: '▲' };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, cls: 'flat', arrow: '─' };
  return pct > 0 ? { pct, cls: 'up', arrow: '▲' } : { pct, cls: 'down', arrow: '▼' };
}

function renderStats_view() {
  if (!els.statsKpiGrid) return;
  const profitContext = createProfitContext();
  const { from, to, label, prevFrom, prevTo } = getStatsDateRange();
  const inRange = (o, f, t) => { const d = new Date(o.createdAt); return d >= f && d <= t; };
  const curr = state.orders.filter(o => inRange(o, from, to));
  const prev = state.orders.filter(o => inRange(o, prevFrom, prevTo));
  const cm = calcMetrics(curr, profitContext);
  const pm = calcMetrics(prev, profitContext);

  // Ad spend attributable to each range, and net profit (gross − ad spend)
  const adCurr = adSpendForRange(from, to);
  const adPrev = adSpendForRange(prevFrom, prevTo);
  const netCurr = cm.profit - adCurr;
  const netPrev = pm.profit - adPrev;

  // Editor is always available, even with no orders in range
  renderAdSpendEditor();

  if (!curr.length && !adCurr) {
    els.statsKpiGrid.innerHTML = '';
    els.statsSummaryCard.innerHTML = '';
    els.statsBreakdown.innerHTML = `
      <div class="stats-no-data">
        <div class="stats-no-data-icon">📭</div>
        <p>No orders found for <strong>${label}</strong>.</p>
      </div>`;
    return;
  }

  // KPI cards
  const kpis = [
    { label: 'Net Profit', value: peso(netCurr),      raw: netCurr,      prev: netPrev,      green: true, val: netCurr },
    { label: 'Revenue',    value: peso(cm.revenue),   raw: cm.revenue,   prev: pm.revenue,   green: false },
    { label: 'Ad Spend',   value: peso(adCurr),       raw: adCurr,       prev: adPrev,       green: false },
    { label: 'Checkouts',  value: cm.checkouts,       raw: cm.checkouts, prev: pm.checkouts, green: false },
    { label: 'Items Sold', value: cm.items,            raw: cm.items,     prev: pm.items,     green: false },
  ];
  els.statsKpiGrid.innerHTML = kpis.map(k => {
    const d = deltaArrow(k.raw, k.prev);
    return `
      <div class="stats-kpi-card">
        <span class="stats-kpi-label">${k.label}</span>
        <span class="stats-kpi-value ${k.green ? (k.val !== undefined ? (k.val < 0 ? 'red' : 'green') : 'green') : ''}">${k.value}</span>
        <div class="stats-kpi-delta ${d.cls}">${d.arrow} ${Math.abs(d.pct).toFixed(0)}% vs prev period</div>
      </div>`;
  }).join('');

  // Summary (margin & avg based on NET profit, after ad spend)
  const margin = cm.revenue ? ((netCurr / cm.revenue) * 100).toFixed(1) : '0.0';
  const avgProfit = cm.batches ? (netCurr / cm.batches).toFixed(2) : '0.00';
  els.statsSummaryCard.innerHTML = `
    <div class="stats-summary-title">Summary — ${label}</div>
    <div class="stats-summary-grid">
      <div class="stats-summary-item"><span class="s-label">Gross Profit</span><span class="s-val ${cm.profit >= 0 ? 'green' : 'red'}">${peso(cm.profit)}</span></div>
      <div class="stats-summary-item"><span class="s-label">Ad Spend</span><span class="s-val">−${peso(adCurr)}</span></div>
      <div class="stats-summary-item"><span class="s-label">Net Profit</span><span class="s-val ${netCurr >= 0 ? 'green' : 'red'}">${peso(netCurr)}</span></div>
      <div class="stats-summary-item"><span class="s-label">Order Batches</span><span class="s-val">${cm.batches}</span></div>
      <div class="stats-summary-item"><span class="s-label">Avg Order Value</span><span class="s-val">${peso(cm.avgOrderValue)}</span></div>
      <div class="stats-summary-item"><span class="s-label">Net Margin</span><span class="s-val ${Number(margin) >= 0 ? 'green' : 'red'}">${margin}%</span></div>
      <div class="stats-summary-item"><span class="s-label">Avg Net / Batch</span><span class="s-val ${Number(avgProfit) >= 0 ? 'green' : 'red'}">${peso(avgProfit)}</span></div>
      <div class="stats-summary-item"><span class="s-label">Total Checkout Cost</span><span class="s-val">${peso(curr.reduce((s,o) => s + Number(o.discountedPrice||0), 0))}</span></div>
      <div class="stats-summary-item"><span class="s-label">Total Refunds</span><span class="s-val">${peso(curr.reduce((s,o) => s + Number(o.refund||0), 0))}</span></div>
    </div>`;

  // Daily breakdown
  const dayMap = new Map();
  curr.forEach(o => {
    const day = o.createdAt.slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day).push(o);
  });
  const days = [...dayMap.entries()].sort((a,b) => b[0].localeCompare(a[0]));
  const showBreakdown = days.length > 1 || statsRange.type === 'custom' || ['7d','30d','month'].includes(statsRange.type);
  if (!showBreakdown) { els.statsBreakdown.innerHTML = ''; return; }
  els.statsBreakdown.innerHTML = `
    <div class="stats-breakdown-head">
      <div>Date</div><div>Revenue</div><div>Profit</div><div>Checkouts</div><div>Items</div>
    </div>
    ${days.map(([day, orders]) => {
      const m = calcMetrics(orders, profitContext);
      const d = new Date(day + 'T00:00:00');
      const label = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
      return `
        <div class="stats-breakdown-row">
          <div><span class="bd-mob-label">Date</span><strong>${label}</strong></div>
          <div><span class="bd-mob-label">Revenue</span>${peso(m.revenue)}</div>
          <div class="bd-profit ${m.profit < 0 ? 'neg' : ''}"><span class="bd-mob-label">Profit</span>${peso(m.profit)}</div>
          <div><span class="bd-mob-label">Checkouts</span>${m.checkouts}</div>
          <div><span class="bd-mob-label">Items</span>${m.items}</div>
        </div>`;
    }).join('')}`;
}

/* ─── Ad Spend Log (Stats view) ───────────────────────── */
function renderAdSpendEditor() {
  if (!els.statsAdspendCard) return;
  const entries = Object.entries(state.adSpend || {})
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => b[0].localeCompare(a[0])); // newest day first

  // Group days under their month, with a monthly subtotal
  const byMonth = new Map();
  entries.forEach(([day, amt]) => {
    const mk = day.slice(0, 7);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push([day, amt]);
  });

  const groupsHtml = [...byMonth.entries()].map(([mk, rows]) => {
    const monthTotal = rows.reduce((s, [, v]) => s + Number(v || 0), 0);
    const open = adSpendOpenMonths.has(mk);
    const daysHtml = rows.map(([day, amt]) => `
          <div class="adspend-row">
            <span class="adspend-day">${formatDayKey(day)}</span>
            <div class="adspend-input-wrap">
              <span class="adspend-peso">₱</span>
              <input class="form-input adspend-input" type="number" inputmode="decimal" step="0.01" min="0"
                     data-day="${day}" value="${Number(amt)}" />
            </div>
            <button type="button" class="adspend-del" data-delete-adspend="${day}" title="Remove entry" aria-label="Remove entry">✕</button>
          </div>`).join('');
    return `
      <div class="adspend-group">
        <button type="button" class="adspend-month-head${open ? ' open' : ''}" data-toggle-month="${mk}" aria-expanded="${open}">
          <span class="adspend-chevron">▸</span>
          <span class="adspend-group-month">${formatMonthKey(mk)}</span>
          <span class="adspend-group-count">${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}</span>
          <span class="adspend-group-total">${peso(monthTotal)}</span>
        </button>
        ${open ? `<div class="adspend-days">${daysHtml}</div>` : ''}
      </div>`;
  }).join('');

  const today = dayKey(new Date());
  els.statsAdspendCard.innerHTML = `
    <div class="stats-summary-title">Ad Spend Log</div>
    <p class="adspend-note">Log what you spent on ads each day. Edit any amount inline, or remove an entry with ✕.</p>
    <div class="adspend-add">
      <input type="date" id="adspend-date" class="form-input" value="${today}" max="${today}" />
      <div class="adspend-input-wrap">
        <span class="adspend-peso">₱</span>
        <input class="form-input adspend-amount-new" id="adspend-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" />
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="adspend-add">Add</button>
    </div>
    ${entries.length ? `<div class="adspend-groups">${groupsHtml}</div>` : '<p class="empty-note" style="margin:14px 0">No ad spend logged yet.</p>'}
    <div class="adspend-total">
      <span class="s-label">Total Ad Spend (all time)</span>
      <span class="s-val">${peso(getTotalAdSpend())}</span>
    </div>`;
}

// Shared logging path: accumulates same-day, persists, re-renders. Returns false if invalid.
function addAdSpendEntry(day, amt) {
  if (!day) { alert('Pick a date.'); return false; }
  if (!amt) { alert('Enter an amount.'); return false; }
  state.adSpend[day] = (Number(state.adSpend[day]) || 0) + amt; // logging twice in a day accumulates
  adSpendOpenMonths.add(day.slice(0, 7)); // expand the month we just logged into
  saveState();
  renderStats();
  renderStats_view();
  showToast('Ad spend logged ✓', 'success');
  return true;
}

function onAddAdSpend() {
  const day = document.getElementById('adspend-date')?.value;
  const amt = clampNumber(document.getElementById('adspend-amount')?.value, 0, 0);
  addAdSpendEntry(day, amt);
}

function openAdSpendModal() {
  els.adspendModalForm.reset();
  els.adspendModalForm.date.value = dayKey(new Date());
  els.adspendModalForm.date.max = dayKey(new Date());
  openModal(els.adspendModal);
}

function onSaveAdSpendModal(e) {
  e.preventDefault();
  const day = els.adspendModalForm.date.value;
  const amt = clampNumber(els.adspendModalForm.amount.value, 0, 0);
  if (addAdSpendEntry(day, amt)) closeModal(els.adspendModal);
}

function onAdSpendInput(input) {
  const day = input.dataset.day;
  if (!day) return;
  const val = clampNumber(input.value, 0, 0);
  if (val) state.adSpend[day] = val;
  else delete state.adSpend[day]; // clearing the field removes the entry
  saveState();
  renderStats();        // home net profit + ad spend card
  renderStats_view();   // KPIs, summary, and the log
}

function deleteAdSpendEntry(day) {
  delete state.adSpend[day];
  saveState();
  renderStats();
  renderStats_view();
  showToast('Ad spend entry removed', 'success');
}

/* ─── Gmail Dot Generator ─────────────────────────────── */
function openGmailDotModal() {
  document.getElementById('gmail-dot-input').value = '';
  document.getElementById('gmail-dot-results').innerHTML = '';
  openModal(document.getElementById('gmail-dot-modal'));
}

function generateGmailDots() {
  const raw = document.getElementById('gmail-dot-input').value.trim().toLowerCase();
  if (!raw) return alert('Please enter a Gmail address.');

  // Extract local part (strip @gmail.com or @googlemail.com)
  const atIdx = raw.indexOf('@');
  const local = atIdx !== -1 ? raw.slice(0, atIdx) : raw;
  const domain = '@gmail.com';

  // Normalize: remove existing dots
  const base = local.replace(/\./g, '');
  if (!base) return alert('Invalid email address.');

  const n = base.length;
  const totalCombos = Math.pow(2, n - 1);

  // Get all dot variants already used in saved accounts (same base email)
  const usedVariants = new Set(
    state.accounts
      .map(a => a.email.toLowerCase())
      .filter(e => e.split('@')[0].replace(/\./g, '') === base)
      .map(e => e.split('@')[0])
  );

  // Build full list of all possible variants
  const allVariants = [];
  for (let mask = 0; mask < totalCombos; mask++) {
    let variant = base[0];
    for (let i = 1; i < n; i++) {
      if (mask & (1 << (i - 1))) variant += '.';
      variant += base[i];
    }
    allVariants.push(variant);
  }

  const availableVariants = allVariants.filter(v => !usedVariants.has(v));

  const resultsEl = document.getElementById('gmail-dot-results');

  if (!availableVariants.length) {
    resultsEl.innerHTML = '<p style="color:var(--text-3);font-size:13px;margin-top:12px">All dot variants are already used in your accounts.</p>';
    return;
  }

  // Pick one random unused variant
  const picked = availableVariants[Math.floor(Math.random() * availableVariants.length)] + domain;
  const usedCount = usedVariants.size;
  const remainingCount = availableVariants.length - 1;

  resultsEl.innerHTML = `
    <div style="margin-top:16px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px">
        Generated · ${usedCount} already in accounts · ${remainingCount} others available
      </div>
      <div class="gmail-dot-list">
        <div class="gmail-dot-item available">
          <span class="gmail-dot-email">${escapeHtml(picked)}</span>
          <button class="gmail-dot-copy" type="button" data-email="${escapeHtml(picked)}" title="Copy">⎘</button>
        </div>
      </div>
      ${remainingCount > 0 ? `<p style="font-size:12px;color:var(--text-3);margin-top:8px">Hit Generate again for a different one.</p>` : ''}
    </div>`;
}

// Copy on click inside results
document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.gmail-dot-copy');
  if (copyBtn) {
    navigator.clipboard.writeText(copyBtn.dataset.email).then(() => showToast('Copied!', 'success'));
  }
});

/* ─── Export / Import ─────────────────────────────────── */
function exportBackup() {
  const cogDrop = document.getElementById('cog-dropdown'); if (cogDrop) cogDrop.hidden = true;
  const moreSheetEl = document.getElementById('more-sheet'); if (moreSheetEl) { moreSheetEl.classList.remove('visible'); setTimeout(() => { moreSheetEl.hidden = true; }, 220); }
  const moreBackEl = document.getElementById('more-sheet-backdrop'); if (moreBackEl) { moreBackEl.classList.remove('visible'); setTimeout(() => { moreBackEl.hidden = true; }, 220); }
  const data = JSON.stringify({ shopName: state.shopName, accounts: state.accounts, orders: state.orders, adSpend: state.adSpend, exportedAt: new Date().toISOString() }, null, 2);
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
      if (parsed.adSpend && typeof parsed.adSpend === 'object') state.adSpend = parsed.adSpend;
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

function setSyncStatus(status = 'saved', message = '') {
  if (!els.syncStatus) return;
  const normalized = SYNC_STATUS_LABELS[status] ? status : 'saved';
  const label = message || SYNC_STATUS_LABELS[normalized];
  els.syncStatus.dataset.state = normalized;
  els.syncStatus.title = label;
  const textEl = els.syncStatus.querySelector('.sync-status-text');
  if (textEl) textEl.textContent = label;
}

function setAdminMode(isAdmin) {
  const enabled = Boolean(isAdmin);
  window.POS.isAdmin = enabled;
  if (els.adminPanelBtn) els.adminPanelBtn.hidden = !enabled;
  if (els.adminPanelBtnDesktop) els.adminPanelBtnDesktop.hidden = !enabled;
  window.dispatchEvent(new CustomEvent('pos:adminchange', { detail: { isAdmin: enabled } }));
}

/* ─── Modal helpers ───────────────────────────────────── */
function getOpenModals() { return [...document.querySelectorAll('.modal')].filter(m => !m.hidden); }

function focusFirstModalField(modal) {
  const focusable =
    modal.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])') ||
    modal.querySelector('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (focusable) focusable.focus({ preventScroll: true });
}

function openModal(modal) {
  if (!modal) return;
  lastFocusedBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => focusFirstModalField(modal));
}

function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  if (!getOpenModals().length) {
    document.body.classList.remove('modal-open');
    if (lastFocusedBeforeModal && document.contains(lastFocusedBeforeModal)) {
      lastFocusedBeforeModal.focus({ preventScroll: true });
    }
    lastFocusedBeforeModal = null;
    setTimeout(flushPendingRemoteState, 0);
  }
}

/* ─── Data helpers ────────────────────────────────────── */
function createProfitContext() {
  return { orderCountByAccount: getOrderCountByAccount() };
}

function getOrderCountByAccount() {
  const counts = new Map();
  state.orders.forEach(o => counts.set(o.accountId, (counts.get(o.accountId) || 0) + 1));
  return counts;
}

function groupOrdersByAccount() {
  const groups = new Map();
  state.orders.forEach(o => {
    if (!groups.has(o.accountId)) groups.set(o.accountId, []);
    groups.get(o.accountId).push(o);
  });
  return groups;
}

function getOrderGroups(profitContext = createProfitContext()) {
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
      totalProfit: sorted.reduce((s, i) => s + getOrderProfit(i, profitContext), 0),
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

function getOrderProfit(o, profitContext = createProfitContext()) {
  const account = getAccountById(o.accountId);
  const accountCost = Number(account?.cost || 0);
  const ordersOnAccount = profitContext.orderCountByAccount.get(o.accountId) || 1;
  const costShare = accountCost / ordersOnAccount;
  return Number(o.totalPrice||0) - Number(o.discountedPrice||0) + Number(o.refund||0) - costShare;
}

/* ─── Ad Spend (logged per day) ───────────────────────── */
// state.adSpend is keyed by local date: { 'YYYY-MM-DD': amount }
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getTotalAdSpend() { return Object.values(state.adSpend || {}).reduce((s, v) => s + Number(v || 0), 0); }

// Exact sum of daily ad-spend entries whose date falls within [from, to].
function adSpendForRange(from, to) {
  if (!from || !to) return 0;
  const f = new Date(from), t = new Date(to);
  return Object.entries(state.adSpend || {}).reduce((sum, [day, amt]) => {
    const d = new Date(day + 'T00:00:00'); // local midnight of the logged day
    return (d >= f && d <= t) ? sum + Number(amt || 0) : sum;
  }, 0);
}

function formatMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}
function formatDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d));
}

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
function syncVoucherHidden() {
  const checked = [...document.querySelectorAll('#voucher-picker input[type="checkbox"]:checked')].map(cb => cb.value);
  document.getElementById('vouchers-hidden').value = checked.join(', ');
}
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

/* ─── Remote state safety ─────────────────────────────── */
function normalizeCloudState(data = {}) {
  return {
    shopName: data.shopName || '',
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    adSpend: data.adSpend && typeof data.adSpend === 'object' ? data.adSpend : {}
  };
}

function comparableStateJson(data) { return JSON.stringify(normalizeCloudState(data)); }
function currentStateJson() { return comparableStateJson(state); }

function isEditingElement(el = document.activeElement) {
  return el instanceof HTMLElement &&
    el !== document.body &&
    (el.matches('input, select, textarea') || el.isContentEditable);
}

function shouldDeferRemoteState() {
  return document.body.classList.contains('modal-open') || isEditingElement();
}

function applyRemoteStateNow(data) {
  const next = normalizeCloudState(data);
  if (comparableStateJson(next) === currentStateJson()) return false;
  state.shopName = next.shopName;
  state.accounts = next.accounts;
  state.orders = next.orders;
  state.adSpend = next.adSpend;
  cacheState();
  render();
  if (activeView === 'stats-view') renderStats_view();
  return true;
}

function flushPendingRemoteState() {
  if (!pendingRemoteState || shouldDeferRemoteState()) return;
  const next = pendingRemoteState;
  const baseJson = pendingRemoteBaseJson;
  pendingRemoteState = null;
  pendingRemoteBaseJson = null;
  if (baseJson && currentStateJson() !== baseJson) {
    setSyncStatus('saved');
    showToast('Remote update skipped after local changes', 'error');
    return;
  }
  applyRemoteStateNow(next);
  setSyncStatus('saved');
}

/* ─── Persistence ─────────────────────────────────────── */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : { shopName: '', accounts: [], orders: [], adSpend: {} };
    parsed.shopName ||= ''; parsed.accounts ||= []; parsed.orders ||= []; parsed.adSpend ||= {};
    return parsed;
  } catch { return { shopName: '', accounts: [], orders: [], adSpend: {} }; }
}
function cacheState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function saveState() { cacheState(); window.POSCloud?.push(state); } // local cache + debounced cloud push

/* ─── Cloud sync hooks (used by js/sync.js) ───────────── */
window.POS = {
  isAdmin: false,
  getState: () => state,
  // Replace local state with the cloud snapshot (cache only — no re-push, avoids echo loops)
  applyRemoteState(data, options = {}) {
    if (!data) return;
    const next = normalizeCloudState(data);
    if (comparableStateJson(next) === currentStateJson()) return;
    if (!options.force && shouldDeferRemoteState()) {
      pendingRemoteState = next;
      pendingRemoteBaseJson ||= currentStateJson();
      setSyncStatus('pending');
      return;
    }
    pendingRemoteState = null;
    pendingRemoteBaseJson = null;
    applyRemoteStateNow(next);
  },
  setSyncStatus,
  setAdminMode,
  setView,
  showToast,
  setShopName(name) {
    state.shopName = String(name || '').trim();
    saveState();
    renderBrand();
  },
  // On logout: wipe local copy so a shared device doesn't leak the previous user's data
  clearState() {
    state.shopName = ''; state.accounts = []; state.orders = []; state.adSpend = {};
    localStorage.removeItem(STORAGE_KEY);
    render();
  }
};
