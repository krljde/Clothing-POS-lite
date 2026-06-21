export function voucherKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function uniqueByVoucherKey(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = voucherKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function peso(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function escapeAttr(value) {
  return escapeHtml(value);
}
