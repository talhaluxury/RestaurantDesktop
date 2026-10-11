// Pure helper functions (no Firebase / DOM) so they can be tested on their own.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function money(n, currency = '') {
  const v = Number(n) || 0;
  const s = v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return currency ? `${currency} ${s}` : s;
}

export function lineKey(productId, variantName, addOnNames) {
  return [productId, variantName || '', (addOnNames || []).slice().sort().join('+')].join('|');
}

export function buildLine(product, variant, addOns, qty = 1) {
  const unitPrice = (Number(product.price) || 0) + (variant ? Number(variant.priceDelta) || 0 : 0) +
    (addOns || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
  const addOnNames = (addOns || []).map(a => a.name);
  const variantName = variant ? variant.name : null;
  return {
    key: lineKey(product.id, variantName, addOnNames),
    productId: product.id, name: product.name, variantName, addOnNames, unitPrice, quantity: qty,
    lineTotal: unitPrice * qty
  };
}

export function totals(cart, taxPct, svcPct, discount, deliveryCharge = 0) {
  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const tax = subtotal * ((Number(taxPct) || 0) / 100);
  const serviceCharge = subtotal * ((Number(svcPct) || 0) / 100);
  const disc = Math.max(0, Number(discount) || 0);
  const delivery = Math.max(0, Number(deliveryCharge) || 0);
  const total = Math.max(0, subtotal - disc + tax + serviceCharge + delivery);
  return { subtotal, tax, serviceCharge, discount: disc, deliveryCharge: delivery, total };
}

// "Large, 150" or "Large, +150" -> {name:'Large', priceDelta:150}; one per line
export function parseVariants(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.lastIndexOf(',');
    if (i < 0) return { name: l, priceDelta: 0 };
    return { name: l.slice(0, i).trim(), priceDelta: parseFloat(l.slice(i + 1).replace('+', '')) || 0 };
  });
}
export function parseAddOns(text) {
  return parseVariants(text).map(v => ({ name: v.name, price: v.priceDelta }));
}
export function variantsToText(list) { return (list || []).map(v => `${v.name}, ${v.priceDelta}`).join('\n'); }
export function addOnsToText(list) { return (list || []).map(a => `${a.name}, ${a.price}`).join('\n'); }

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function rangeFor(preset, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  switch (preset) {
    case 'today': return { from: start, to: start + day - 1 };
    case 'yesterday': return { from: start - day, to: start - 1 };
    case '7d': return { from: start - 6 * day, to: start + day - 1 };
    case '30d': return { from: start - 29 * day, to: start + day - 1 };
    case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: start + day - 1 };
    default: return { from: start, to: start + day - 1 };
  }
}

export function computeReport(orders, products = []) {
  const costOf = new Map(products.map(p => [p.id, Number(p.costPrice) || 0]));
  const valid = orders.filter(o => o.status !== 'CANCELLED');
  const cancelled = orders.length - valid.length;
  const r = {
    orders: valid.length, cancelled, sales: 0, tax: 0, discount: 0, service: 0, cost: 0,
    byPayment: {}, byType: {}, bySource: { 'Restaurant': 0, 'Website': 0 }, items: {}, days: {}
  };
  for (const o of valid) {
    const total = Number(o.total) || 0;
    r.sales += total; r.tax += Number(o.tax) || 0; r.discount += Number(o.discount) || 0; r.service += Number(o.serviceCharge) || 0;
    const pay = o.paymentMethod || 'UNPAID';
    r.byPayment[pay] = (r.byPayment[pay] || 0) + total;
    r.byType[o.orderType || 'DINE_IN'] = (r.byType[o.orderType || 'DINE_IN'] || 0) + total;
    r.bySource[o.cashierName === 'Website' ? 'Website' : 'Restaurant'] += total;
    const dk = dayKey(o.createdAt || Date.now());
    r.days[dk] = (r.days[dk] || 0) + total;
    for (const it of (o.items || [])) {
      const q = Number(it.quantity) || 0;
      const e = r.items[it.name] || (r.items[it.name] = { qty: 0, revenue: 0 });
      e.qty += q; e.revenue += Number(it.lineTotal) || 0;
      r.cost += q * (costOf.get(it.productId) || 0);
    }
  }
  r.avg = r.orders ? r.sales / r.orders : 0;
  r.profit = r.sales - r.tax - r.service - r.cost;
  r.topItems = Object.entries(r.items).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 10);
  return r;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function ordersToCsv(orders) {
  const head = ['Order', 'Date', 'Type', 'Status', 'Payment Status', 'Customer', 'Phone', 'Items', 'Subtotal', 'Discount', 'Delivery Charge', 'Tax', 'Service', 'Total', 'Payment', 'Cashier'];
  const rows = orders.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(o => [
    o.orderNumber, new Date(o.createdAt || 0).toLocaleString(), o.orderType, o.status, o.paymentStatus === 'UNPAID' ? 'UNPAID' : 'PAID', o.customerName, o.customerPhone,
    (o.items || []).map(i => `${i.quantity}x ${i.name}`).join('; '), o.subtotal, o.discount, o.deliveryCharge || 0, o.tax, o.serviceCharge, o.total,
    o.paymentMethod || '', o.cashierName
  ].map(csvCell).join(','));
  return '\ufeff' + [head.join(','), ...rows].join('\n');
}

export function receiptHtml(o, r, paper = '80') {
  const w = paper === '58' ? '58mm' : '80mm';
  const cur = r.currency || '';
  const m = n => money(n);
  const items = (o.items || []).map(i => {
    const extra = [i.variantName, ...(i.addOnNames || [])].filter(Boolean).join(', ');
    return `<div class="row"><span>${esc(i.quantity)} x ${esc(i.name)}</span><span>${m(i.lineTotal)}</span></div>` +
      (extra ? `<div class="sub">${esc(extra)}</div>` : '');
  }).join('');
  const line = (label, val) => Number(val) ? `<div class="row"><span>${label}</span><span>${m(val)}</span></div>` : '';
  const payLabel = o.paymentStatus === 'UNPAID' ? 'UNPAID' : (o.paymentMethod || '');
  const typeLabel = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' }[o.orderType] || o.orderType || '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${w} auto;margin:0}
body{font-family:'Courier New',monospace;width:${w};margin:0;padding:3mm;font-size:12px;color:#000}
h1{font-size:16px;text-align:center;margin:0 0 2px}.c{text-align:center}.sub{font-size:10px;padding-left:10px;color:#333}
.row{display:flex;justify-content:space-between;gap:6px;margin:2px 0}.hr{border-top:1px dashed #000;margin:5px 0}
.tot{font-size:15px;font-weight:bold}</style></head><body>
<h1>${esc(r.name || 'Restaurant')}</h1>
<div class="c">${esc(r.address || '')}</div><div class="c">${esc(r.phone || '')}</div>
<div class="hr"></div>
<div class="row"><span>Order</span><span><b>${esc(o.orderNumber)}</b></span></div>
<div class="row"><span>Date</span><span>${esc(new Date(o.createdAt || Date.now()).toLocaleString())}</span></div>
<div class="row"><span>Type</span><span>${esc(typeLabel)}${o.tableLabel ? ' - ' + esc(o.tableLabel) : ''}</span></div>
${o.customerName ? `<div class="row"><span>Customer</span><span>${esc(o.customerName)}</span></div>` : ''}
${o.customerPhone ? `<div class="row"><span>Phone</span><span>${esc(o.customerPhone)}</span></div>` : ''}
${o.orderType === 'DELIVERY' && o.customerAddress ? `<div>${esc(o.customerAddress)}</div>` : ''}
<div class="hr"></div>${items}<div class="hr"></div>
${line('Subtotal', o.subtotal)}${line('Discount', -Math.abs(o.discount || 0))}${line('Delivery Charge', o.deliveryCharge)}${line('Tax', o.tax)}${line('Service', o.serviceCharge)}
<div class="row tot"><span>TOTAL</span><span>${esc(cur)} ${m(o.total)}</span></div>
${payLabel ? `<div class="row"><span>${o.paymentStatus === 'UNPAID' ? 'Status' : 'Paid by'}</span><span>${esc(payLabel)}</span></div>` : ''}
${Number(o.amountReceived) ? `<div class="row"><span>Received</span><span>${m(o.amountReceived)}</span></div><div class="row"><span>Change</span><span>${m(o.changeDue)}</span></div>` : ''}
<div class="hr"></div><div class="c">${esc(r.receiptFooter || 'Thank You! Visit Again')}</div>
</body></html>`;
}


// Themed placeholder "photo" for a menu item when it has no real image link yet -
// a nice icon card in the category's colour, rendered as a data: URI (no network needed,
// never breaks). Real photos can always be added later via Menu & Prices > Edit > Image link.
const EMOJI_BG = {
  '\ud83c\udf89': ['#7C3AED', '#C026D3'], '\ud83c\udf5f': ['#F59E0B', '#DC2626'], '\u2b50': ['#FFD166', '#FF9D2E'],
  '\ud83c\udf54': ['#F59E0B', '#B45309'], '\ud83c\udf57': ['#D97706', '#92400E'], '\ud83c\udf2f': ['#EA580C', '#9A3412'],
  '\ud83e\udd6a': ['#DC2626', '#7F1D1D'], '\ud83c\udf56': ['#B91C1C', '#450A0A'], '\ud83c\udf62': ['#F97316', '#7C2D12'],
  '\ud83c\udf55': ['#DC2626', '#991B1B'], '\ud83c\udf5d': ['#EAB308', '#854D0E'], '\ud83e\udd58': ['#CA8A04', '#78350F'],
  '\ud83c\udf72': ['#B45309', '#78350F'], '\ud83e\udd64': ['#0EA5E9', '#0369A1']
};
export function emojiImage(emoji) {
  const [c1, c2] = EMOJI_BG[emoji] || ['#FF9D2E', '#B45309'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="300" height="220" rx="18" fill="url(#g)"/>
    <text x="150" y="132" font-size="88" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
