// ===== STORAGE KEY =====
const STORAGE_KEY = "shein_pos_lite_v12";

// ===== STATE =====
let state = {
  accounts: [],
  orders: []
};

// ===== INIT =====
function init() {
  loadData();
  normalizeData();
  saveData();
  renderAll();
}

// ===== LOAD =====
function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    state = JSON.parse(raw);
  } else {
    // try old keys
    const oldKeys = [
      "shein_pos_lite_v11",
      "shein_pos_lite_v10",
      "shein_pos_lite_v9",
      "shein_pos_lite_v8"
    ];

    for (let key of oldKeys) {
      const old = localStorage.getItem(key);
      if (old) {
        state = JSON.parse(old);
        break;
      }
    }
  }
}

// ===== SAVE =====
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ===== NORMALIZE =====
function normalizeData() {
  // ACCOUNTS
  state.accounts = (state.accounts || []).map((acc, i) => ({
    id: acc.id || "acc_" + Date.now() + "_" + i,
    email: acc.email || "",
    password: acc.password || "",
    accountCost: Number(acc.accountCost || 190),
    purchasedAt: acc.purchasedAt || new Date().toISOString(),
    expiryHours: Number(acc.expiryHours || 20),
    availableVouchers: acc.availableVouchers || "",
  }));

  // ORDERS (CHECKOUTS)
  state.orders = (state.orders || []).map((o, i) => ({
    id: o.id || "ord_" + Date.now() + "_" + i,
    customerName: o.customerName || "Unknown",
    customerNote: o.customerNote || "",
    batchId: o.batchId || generateBatchId(o.customerName),
    checkoutId: o.checkoutId || generateCheckoutId(),
    itemCount: Number(o.itemCount || 1),
    accountId: o.accountId || "",
    voucher: o.voucher || "",
    trackingNumber: o.trackingNumber || "",
    totalPrice: Number(o.totalPrice || 0),
    discountedPrice: Number(o.discountedPrice || 0),
    refund: Number(o.refund || 0),
    status: o.status || "Processing",
    createdAt: o.createdAt || new Date().toISOString()
  }));
}

// ===== ID HELPERS =====
function generateBatchId(name) {
  const base = (name || "CUSTOMER").toUpperCase().replace(/\s/g, "");
  return base + "-" + Math.floor(Math.random() * 1000);
}

function generateCheckoutId() {
  return "CHK-" + Math.floor(Math.random() * 100000);
}

// ===== CALCULATIONS =====
function getProfit(o) {
  return (o.totalPrice || 0) - (o.discountedPrice || 0) + (o.refund || 0);
}

function getRevenue() {
  return state.orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
}

function getTotalProfit() {
  return state.orders.reduce((sum, o) => sum + getProfit(o), 0);
}

function getTotalItems() {
  return state.orders.reduce((sum, o) => sum + (o.itemCount || 0), 0);
}

// ===== ACCOUNT STATUS =====
function getAccountStatus(acc) {
  const expiry = new Date(acc.purchasedAt);
  expiry.setHours(expiry.getHours() + acc.expiryHours);

  if (new Date() > expiry) return "Expired";

  const vouchers = (acc.availableVouchers || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  const used = state.orders
    .filter(o => o.accountId === acc.id)
    .flatMap(o => o.voucher.split("+").map(v => v.trim()));

  const remaining = vouchers.filter(v => !used.includes(v));

  if (remaining.length === 0) return "Used";
  return "Available";
}

// ===== RENDER =====
function renderAll() {
  renderDashboard();
  renderAccounts();
  renderOrders();
}

// ===== DASHBOARD =====
function renderDashboard() {
  document.getElementById("totalCheckouts").innerText = state.orders.length;
  document.getElementById("totalProfit").innerText = getTotalProfit().toFixed(2);
  document.getElementById("totalRevenue").innerText = getRevenue().toFixed(2);
  document.getElementById("totalItems").innerText = getTotalItems();

  const available = state.accounts.filter(a => getAccountStatus(a) === "Available").length;
  const expired = state.accounts.filter(a => getAccountStatus(a) === "Expired").length;

  document.getElementById("availableAccounts").innerText = available;
  document.getElementById("expiredAccounts").innerText = expired;
}

// ===== ACCOUNTS =====
function renderAccounts() {
  const container = document.getElementById("accountsList");
  if (!container) return;

  container.innerHTML = "";

  state.accounts.forEach(acc => {
    const status = getAccountStatus(acc);

    const row = document.createElement("div");
    row.className = "account-row";

    row.innerHTML = `
      <div>${acc.email}</div>
      <div>${status}</div>
      <div>${acc.availableVouchers}</div>
    `;

    container.appendChild(row);
  });
}

// ===== ORDERS =====
function renderOrders() {
  const container = document.getElementById("ordersList");
  if (!container) return;

  container.innerHTML = "";

  const grouped = {};

  state.orders.forEach(o => {
    if (!grouped[o.batchId]) grouped[o.batchId] = [];
    grouped[o.batchId].push(o);
  });

  Object.values(grouped).forEach(group => {
    const first = group[0];

    const row = document.createElement("div");
    row.className = "order-row";

    row.innerHTML = `
      <div>${first.customerName}</div>
      <div>${new Date(first.createdAt).toLocaleDateString()}</div>
      <div>${first.status}</div>
      <div>${group.map(o => o.trackingNumber).join(", ")}</div>
    `;

    container.appendChild(row);
  });
}

// ===== START =====
init();
