import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, onSnapshot, query, where, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as L from "./lib.js";

// Same Firebase project as the mobile apps and the website.
const firebaseConfig = {
  apiKey: "AIzaSyAfB61zHgxWxnzbWOvFPVhvn0Yz9ejZ9-A",
  authDomain: "bill-apps-3d675.firebaseapp.com",
  projectId: "bill-apps-3d675",
  storageBucket: "bill-apps-3d675.firebasestorage.app",
  messagingSenderId: "1072408505617",
  appId: "1:1072408505617:web:939ae2d2be43d456e730b0"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const esc = L.esc;

// ───────── state ─────────
const S = {
  uid: null, rid: null, email: '', restaurant: {}, categories: [], products: [], tables: [],
  orders: [], ordersLoaded: false, view: 'orders', ordersFilter: 'active', ordersSearch: '',
  cart: [], orderType: 'DINE_IN', tableId: '', customer: { name: '', phone: '', address: '' },
  discount: 0, payMethod: 'CASH', received: '', posCat: 'ALL', posSearch: '',
  menuCat: 'ALL', menuSearch: '', reportOrders: [], reportPreset: 'today', alerts: [], unsubs: []
};
const cfg = Object.assign({ paper: '80', silent: false, printer: '', sound: true, autoPrint: true },
  JSON.parse(localStorage.getItem('cfg') || '{}'));
const saveCfg = () => localStorage.setItem('cfg', JSON.stringify(cfg));

const cur = () => S.restaurant.currency || 'PKR';
const MC = n => L.money(n, cur());
const path = (...p) => ['restaurants', S.rid, ...p];
const toast = (msg, ms = 2800) => { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); };
const openModal = html => { $('modal').innerHTML = html; $('modalBack').classList.remove('hidden'); };
const closeModal = () => $('modalBack').classList.add('hidden');

// ───────── sound + alerts ─────────
let audioCtx = null, soundTimer = null, soundStart = 0;
function beep() {
  if (!cfg.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [[880, 0], [1175, 0.22], [880, 0.44], [1175, 0.66]].forEach(([f, d]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.45, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
      o.connect(g); g.connect(audioCtx.destination); o.start(t + d); o.stop(t + d + 0.22);
    });
  } catch (e) { /* audio not available */ }
}
function startSound() {
  if (soundTimer) return;
  soundStart = Date.now(); beep();
  soundTimer = setInterval(() => { if (Date.now() - soundStart > 180000) stopSound(); else beep(); }, 2600);
}
function stopSound() { clearInterval(soundTimer); soundTimer = null; }

function pushAlert(o) {
  S.alerts.push(o); renderBanner(); startSound();
  try { new Notification('New order ' + (o.orderNumber || ''), { body: (o.customerName || '') + ' - ' + MC(o.total) }); } catch (e) { }
}
function ackAlerts() { S.alerts = []; stopSound(); renderBanner(); }
function renderBanner() {
  const b = $('alertBanner');
  if (!S.alerts.length) { b.classList.add('hidden'); return; }
  const last = S.alerts[S.alerts.length - 1];
  b.classList.remove('hidden');
  b.innerHTML = `<span style="font-size:26px">🔔</span><b>${S.alerts.length} new order${S.alerts.length > 1 ? 's' : ''}: ${esc(last.orderNumber || '')} ${esc(last.customerName || '')} (${esc(typeLabel(last.orderType))}) - ${MC(last.total)}</b>
   <button class="btn primary" data-act="alert-view">View</button><button class="btn" data-act="alert-silence">Silence</button>`;
}

const typeLabel = t => ({ DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' }[t] || t || '');

// ───────── auth ─────────
function showLogin() { $('appShell').classList.add('hidden'); $('loginScreen').classList.remove('hidden'); }
function showApp() { $('loginScreen').classList.add('hidden'); $('appShell').classList.remove('hidden'); }
function loginError(m) { $('loginError').textContent = m || ''; }

onAuthStateChanged(auth, async user => {
  if (!user) { stopListeners(); showLogin(); return; }
  try {
    const m = await getDoc(doc(db, 'userRestaurants', user.uid));
    if (!m.exists()) { loginError('This account is not linked to a restaurant.'); await signOut(auth); return; }
    S.uid = user.uid; S.email = user.email || ''; S.rid = m.data().restaurantId;
  } catch (e) { loginError('Could not load account: ' + e.message); showLogin(); return; }
  showApp(); startListeners(); switchView(S.view);
  try { if (Notification.permission === 'default') Notification.requestPermission(); } catch (e) { }
});

// ───────── realtime data ─────────
function stopListeners() { S.unsubs.forEach(u => u()); S.unsubs = []; S.ordersLoaded = false; }
function startListeners() {
  stopListeners();
  const err = e => console.error(e);
  S.unsubs.push(onSnapshot(doc(db, ...path()), s => { S.restaurant = { id: S.rid, ...(s.data() || {}) }; refreshBrand(); if (S.view === 'pos') renderCart(); }, err));
  S.unsubs.push(onSnapshot(collection(db, ...path('categories')), s => {
    S.categories = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    if (S.view === 'pos') renderPOSProducts(); if (S.view === 'menu') renderMenu();
  }, err));
  S.unsubs.push(onSnapshot(collection(db, ...path('products')), s => {
    S.products = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (S.view === 'pos') renderPOSProducts(); if (S.view === 'menu') renderMenu();
  }, err));
  S.unsubs.push(onSnapshot(collection(db, ...path('tables')), s => {
    S.tables = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true }));
    if (S.view === 'pos') renderCart();
  }, err));
  const since = Date.now() - 45 * 86400000;
  S.unsubs.push(onSnapshot(query(collection(db, ...path('orders')), where('createdAt', '>=', since)), s => {
    if (S.ordersLoaded) {
      s.docChanges().forEach(ch => {
        const d = ch.doc.data();
        if (ch.type === 'added' && d.status === 'NEW' && !ch.doc.metadata.hasPendingWrites) pushAlert({ id: ch.doc.id, ...d });
      });
    }
    S.orders = s.docs.map(d => ({ id: d.id, ...d.data() }));
    S.ordersLoaded = true;
    const n = S.orders.filter(o => o.status === 'NEW').length;
    $('newBadge').textContent = n; $('newBadge').classList.toggle('hidden', n === 0);
    if (S.view === 'orders') renderOrders();
  }, err));
}
function refreshBrand() {
  $('brandName').textContent = S.restaurant.name || 'Restaurant';
  document.title = (S.restaurant.name || 'Restaurant') + ' - POS';
}

// ───────── navigation ─────────
function switchView(v) {
  S.view = v;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('hidden', s.id !== 'view-' + v));
  if (v === 'orders') { renderOrders(); }
  if (v === 'pos') { buildPOS(); renderPOSProducts(); renderCart(); }
  if (v === 'menu') { buildMenu(); renderMenu(); }
  if (v === 'reports') { buildReports(); }
  if (v === 'settings') { renderSettings(); }
}

// ───────── printing ─────────
async function printOrder(o) {
  const html = L.receiptHtml(o, { ...S.restaurant, currency: cur() }, cfg.paper);
  if (window.desktop) {
    const r = await window.desktop.printHtml(html, cfg.silent, cfg.printer);
    if (!r.ok) toast('Print failed' + (r.reason ? ': ' + r.reason : ''));
  } else {
    const f = document.createElement('iframe'); f.style.display = 'none'; document.body.appendChild(f);
    f.onload = () => { f.contentWindow.print(); setTimeout(() => f.remove(), 2000); };
    f.srcdoc = html;
  }
}

// ───────── LIVE ORDERS ─────────
const NEXT = { NEW: ['PREPARING', 'Start Preparing'], PREPARING: ['READY', 'Mark Ready'], READY: ['COMPLETED', 'Complete'] };
const RIDER_LABEL = { ACCEPTED: 'Rider accepted', ARRIVED: 'Rider at restaurant', PICKED_UP: 'Picked up', ON_THE_WAY: 'On the way', DELIVERED: 'Delivered' };

function renderOrders() {
  const v = $('view-orders');
  if (!v.dataset.built) {
    v.dataset.built = 1;
    v.innerHTML = `<div class="view-head"><h2>Live Orders</h2><div class="chips" id="ofilters"></div><div class="grow"></div>
      <input id="osearch" placeholder="Search order #, name, phone" style="width:260px"></div><div id="obody"></div>`;
    $('osearch').addEventListener('input', e => { S.ordersSearch = e.target.value.trim().toLowerCase(); renderOrders(); });
  }
  const by = f => S.orders.filter(f).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const active = by(o => ['NEW', 'PREPARING', 'READY'].includes(o.status));
  const filters = [
    ['active', 'Active', active.length], ['completed', 'Completed', S.orders.filter(o => o.status === 'COMPLETED').length],
    ['cancelled', 'Cancelled', S.orders.filter(o => o.status === 'CANCELLED').length], ['all', 'All', S.orders.length]
  ];
  $('ofilters').innerHTML = filters.map(([k, n, c]) => `<span class="chip ${S.ordersFilter === k ? 'active' : ''}" data-act="ofilter" data-f="${k}">${n} (${c})</span>`).join('');

  const q = S.ordersSearch;
  const match = o => !q || [o.orderNumber, o.customerName, o.customerPhone, o.tableLabel].some(x => String(x || '').toLowerCase().includes(q));
  const body = $('obody');
  if (S.ordersFilter === 'active') {
    const cols = [['NEW', '🆕 NEW'], ['PREPARING', '👨‍🍳 PREPARING'], ['READY', '✅ READY']];
    body.innerHTML = `<div class="cols">${cols.map(([st, title]) => {
      const list = active.filter(o => o.status === st && match(o));
      return `<div><div class="col-title">${title} (${list.length})</div>${list.map(orderCard).join('') || '<div class="muted small">No orders</div>'}</div>`;
    }).join('')}</div>`;
  } else {
    const st = { completed: 'COMPLETED', cancelled: 'CANCELLED' }[S.ordersFilter];
    const list = by(o => (!st || o.status === st) && match(o)).slice(0, 200);
    body.innerHTML = `<div class="grid">${list.map(orderCard).join('') || '<div class="muted">No orders</div>'}</div>`;
  }
}

function orderCard(o) {
  const stCls = { NEW: 'orange', PREPARING: 'blue', READY: 'green', COMPLETED: 'green', CANCELLED: 'red' }[o.status] || '';
  const t = o.createdAt ? new Date(o.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '';
  const items = (o.items || []).map(i => {
    const extra = [i.variantName, ...(i.addOnNames || [])].filter(Boolean).join(', ');
    return `<div><span>${esc(i.quantity)} x ${esc(i.name)}</span><span>${L.money(i.lineTotal)}</span></div>${extra ? `<span class="sub">${esc(extra)}</span>` : ''}`;
  }).join('');
  const nxt = NEXT[o.status];
  const canCancel = ['NEW', 'PREPARING', 'READY'].includes(o.status);
  const loc = o.deliveryLocation, live = o.liveLocation;
  return `<div class="glass ocard ${o.status === 'NEW' ? 'new' : ''}">
    <div class="ohead"><span class="onum">${esc(o.orderNumber)}</span><span class="pill ${stCls}">${esc(o.status)}</span></div>
    <div class="muted small">${esc(t)} &bull; <span class="pill">${esc(typeLabel(o.orderType))}</span>${o.tableLabel ? ' &bull; ' + esc(o.tableLabel) : ''}${o.cashierName === 'Website' ? ' &bull; <span class="pill blue">Website</span>' : ''}</div>
    ${(o.customerName || o.customerPhone) ? `<div style="margin-top:6px">👤 ${esc(o.customerName)} ${esc(o.customerPhone)}</div>` : ''}
    ${o.orderType === 'DELIVERY' && o.customerAddress ? `<div class="muted small">📍 ${esc(o.customerAddress)}</div>` : ''}
    ${o.riderStatus ? `<div style="margin-top:4px"><span class="pill blue">🏍️ ${esc(o.riderName || 'Rider')}: ${esc(RIDER_LABEL[o.riderStatus] || o.riderStatus)}</span></div>` : ''}
    <div class="items">${items}</div>
    <div style="display:flex;justify-content:space-between"><span class="muted">${esc(o.paymentMethod || 'Unpaid')}</span><b style="color:var(--accent2);font-size:16px">${MC(o.total)}</b></div>
    <div class="actions">
      ${nxt ? `<button class="btn primary sm" data-act="adv" data-id="${o.id}" data-st="${nxt[0]}">${nxt[1]}</button>` : ''}
      <button class="btn sm" data-act="print-order" data-id="${o.id}">🖨️ Slip</button>
      ${loc ? `<button class="btn sm" data-act="map" data-lat="${loc.lat}" data-lng="${loc.lng}">📍 Customer</button>` : ''}
      ${live && ['NEW', 'PREPARING', 'READY'].includes(o.status) ? `<button class="btn sm" data-act="map" data-lat="${live.lat}" data-lng="${live.lng}">🏍️ Rider</button>` : ''}
      ${canCancel ? `<button class="btn sm danger" data-act="cancel-order" data-id="${o.id}">Cancel</button>` : ''}
    </div></div>`;
}

// ───────── POS BILLING ─────────
function buildPOS() {
  const v = $('view-pos');
  if (v.dataset.built) return;
  v.dataset.built = 1;
  v.innerHTML = `<div class="pos">
    <div class="pos-left"><div class="view-head"><h2>POS Billing</h2><div class="grow"></div><input id="psearch" placeholder="Search items..." style="width:260px"></div>
      <div class="chips" id="pcats"></div><div class="pgrid" id="pgrid"></div></div>
    <div class="glass cart">
      <div class="seg" id="ptype">
        <button class="btn sm" data-act="pos-type" data-t="DINE_IN">Dine-in</button>
        <button class="btn sm" data-act="pos-type" data-t="TAKEAWAY">Takeaway</button>
        <button class="btn sm" data-act="pos-type" data-t="DELIVERY">Delivery</button></div>
      <div id="tableRow"><label>Table</label><select id="ptable"></select></div>
      <div id="custRow"><div class="two"><div><label>Customer name</label><input id="cname"></div><div><label>Phone</label><input id="cphone"></div></div>
        <div id="addrRow"><label>Delivery address</label><input id="caddr"></div></div>
      <div class="cart-lines" id="clines"></div>
      <div class="two"><div><label>Discount (amount)</label><input id="pdisc" type="number" min="0" placeholder="0"></div>
        <div><label>Payment</label><select id="ppay"><option>CASH</option><option>CARD</option><option>EASYPAISA</option><option>JAZZCASH</option><option>BANK</option><option>OTHER</option></select></div></div>
      <div id="recvRow"><label>Amount received</label><input id="precv" type="number" min="0" placeholder="0"></div>
      <div id="ptotals" style="margin-top:8px"></div>
      <label style="display:flex;gap:8px;align-items:center"><input id="pprint" type="checkbox" style="width:auto"> Print slip after placing order</label>
      <div class="two" style="margin-top:10px"><button class="btn" data-act="pos-clear">Clear</button><button class="btn primary" id="placeBtn" data-act="pos-place">Place Order</button></div>
    </div></div>`;
  $('psearch').addEventListener('input', e => { S.posSearch = e.target.value.trim().toLowerCase(); renderPOSProducts(); });
  $('cname').addEventListener('input', e => S.customer.name = e.target.value);
  $('cphone').addEventListener('input', e => S.customer.phone = e.target.value);
  $('caddr').addEventListener('input', e => S.customer.address = e.target.value);
  $('pdisc').addEventListener('input', e => { S.discount = parseFloat(e.target.value) || 0; renderCart(); });
  $('ppay').addEventListener('change', e => { S.payMethod = e.target.value; renderCart(); });
  $('precv').addEventListener('input', e => { S.received = e.target.value; renderCart(); });
  $('ptable').addEventListener('change', e => S.tableId = e.target.value);
  $('pprint').checked = cfg.autoPrint;
  $('pprint').addEventListener('change', e => { cfg.autoPrint = e.target.checked; saveCfg(); });
}

function renderPOSProducts() {
  const cats = [{ id: 'ALL', name: 'All' }, ...S.categories];
  $('pcats').innerHTML = cats.map(c => `<span class="chip ${S.posCat === c.id ? 'active' : ''}" data-act="pos-cat" data-id="${c.id}">${esc(c.name)}</span>`).join('');
  const list = S.products.filter(p => (S.posCat === 'ALL' || p.categoryId === S.posCat) && (!S.posSearch || (p.name || '').toLowerCase().includes(S.posSearch)));
  $('pgrid').innerHTML = list.map(p => `<div class="pcard ${p.available === false ? 'off' : ''}" data-act="pos-add" data-id="${p.id}">
    ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" loading="lazy" onerror="this.remove()">` : ''}<b>${esc(p.name)}</b><span>${MC(p.price)}</span>${p.available === false ? '<div class="muted small">Unavailable</div>' : ''}</div>`).join('')
    || '<div class="muted">No items. Add them in Menu &amp; Prices.</div>';
}

function cartTotals() { return L.totals(S.cart, S.restaurant.taxPercent, S.restaurant.serviceChargePercent, S.discount); }

function renderCart() {
  document.querySelectorAll('#ptype button').forEach(b => b.classList.toggle('primary', b.dataset.t === S.orderType));
  $('tableRow').classList.toggle('hidden', S.orderType !== 'DINE_IN');
  $('custRow').classList.toggle('hidden', S.orderType === 'DINE_IN');
  $('addrRow').classList.toggle('hidden', S.orderType !== 'DELIVERY');
  const ts = $('ptable'); const keep = S.tableId;
  ts.innerHTML = '<option value="">- none -</option>' + S.tables.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
  ts.value = keep;
  $('clines').innerHTML = S.cart.map(l => `<div class="cline"><div class="nm">${esc(l.name)}<small>${esc([l.variantName, ...l.addOnNames].filter(Boolean).join(', '))} ${L.money(l.unitPrice)}</small></div>
    <div class="qty"><button data-act="cart-dec" data-key="${esc(l.key)}">-</button><b>${l.quantity}</b><button data-act="cart-inc" data-key="${esc(l.key)}">+</button></div>
    <b style="min-width:70px;text-align:right">${L.money(l.unitPrice * l.quantity)}</b><button class="btn sm danger" data-act="cart-del" data-key="${esc(l.key)}">✕</button></div>`).join('')
    || '<div class="muted" style="padding:20px 0;text-align:center">Cart is empty. Tap an item to add.</div>';
  const t = cartTotals();
  const tp = S.restaurant.taxPercent, sp = S.restaurant.serviceChargePercent;
  const change = S.payMethod === 'CASH' && S.received ? Math.max(0, (parseFloat(S.received) || 0) - t.total) : 0;
  $('recvRow').classList.toggle('hidden', S.payMethod !== 'CASH');
  $('ptotals').innerHTML = `<div class="trow"><span>Subtotal</span><span>${MC(t.subtotal)}</span></div>
    ${t.discount ? `<div class="trow"><span>Discount</span><span>-${MC(t.discount)}</span></div>` : ''}
    ${tp > 0 ? `<div class="trow"><span>Tax (${tp}%)</span><span>${MC(t.tax)}</span></div>` : ''}
    ${sp > 0 ? `<div class="trow"><span>Service (${sp}%)</span><span>${MC(t.serviceCharge)}</span></div>` : ''}
    <div class="trow total"><span>Total</span><span>${MC(t.total)}</span></div>
    ${change ? `<div class="trow"><span>Change</span><span style="color:var(--green)">${MC(change)}</span></div>` : ''}`;
  $('placeBtn').disabled = !S.cart.length;
}

function addToCart(line) {
  const ex = S.cart.find(l => l.key === line.key);
  if (ex) ex.quantity += line.quantity; else S.cart.push(line);
  renderCart();
}

function openItemModal(p) {
  const vars = p.variants || [], adds = p.addOns || [];
  openModal(`<h3>${esc(p.name)} - ${MC(p.price)}</h3>
    ${vars.length ? `<label>Size / Variant</label>${vars.map((v, i) => `<label style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input type="radio" name="var" value="${i}" style="width:auto" ${i === 0 ? 'checked' : ''}> ${esc(v.name)} ${v.priceDelta ? '(+' + L.money(v.priceDelta) + ')' : ''}</label>`).join('')}` : ''}
    ${adds.length ? `<label>Add-ons</label>${adds.map((a, i) => `<label style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input type="checkbox" class="addon" value="${i}" style="width:auto"> ${esc(a.name)} (+${L.money(a.price)})</label>`).join('')}` : ''}
    <div class="foot"><button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" data-act="item-add" data-id="${p.id}">Add to cart</button></div>`);
}

async function nextOrderNumber() {
  const ref = doc(db, ...path('settings', 'config'));
  const n = await runTransaction(db, async t => {
    const s = await t.get(ref); const cur = s.exists() ? (s.data().orderCounter || 0) : 0;
    t.set(ref, { orderCounter: cur + 1 }, { merge: true }); return cur + 1;
  });
  return '#' + String(n).padStart(6, '0');
}

async function placeOrder() {
  if (!S.cart.length) return;
  if (S.orderType === 'DELIVERY' && !S.customer.address.trim()) { toast('Please enter the delivery address'); return; }
  const btn = $('placeBtn'); btn.disabled = true; btn.textContent = 'Placing...';
  try {
    const t = cartTotals();
    const table = S.tables.find(x => x.id === S.tableId);
    const orderNumber = await nextOrderNumber();
    const received = S.payMethod === 'CASH' ? (parseFloat(S.received) || t.total) : t.total;
    const data = {
      orderNumber,
      items: S.cart.map(l => ({ productId: l.productId, name: l.name, variantName: l.variantName, addOnNames: l.addOnNames, unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.unitPrice * l.quantity })),
      orderType: S.orderType, tableId: S.orderType === 'DINE_IN' && table ? table.id : null, tableLabel: S.orderType === 'DINE_IN' && table ? table.label : null,
      customerName: S.customer.name.trim(), customerPhone: S.customer.phone.trim(), customerAddress: S.orderType === 'DELIVERY' ? S.customer.address.trim() : '',
      subtotal: t.subtotal, discount: t.discount, tax: t.tax, serviceCharge: t.serviceCharge, total: t.total,
      paymentMethod: S.payMethod, amountReceived: received, changeDue: Math.max(0, received - t.total),
      status: 'NEW', cashierName: (S.email || 'Laptop').split('@')[0], createdAt: Date.now()
    };
    const ref = doc(collection(db, ...path('orders')));
    await setDoc(ref, data);
    toast('Order ' + orderNumber + ' placed');
    if (cfg.autoPrint) printOrder({ id: ref.id, ...data });
    S.cart = []; S.discount = 0; S.received = ''; S.customer = { name: '', phone: '', address: '' };
    ['pdisc', 'precv', 'cname', 'cphone', 'caddr'].forEach(id => $(id).value = '');
  } catch (e) { toast('Could not place order: ' + e.message, 5000); }
  btn.textContent = 'Place Order'; renderCart();
}

// ───────── MENU ─────────
function buildMenu() {
  const v = $('view-menu');
  if (v.dataset.built) return;
  v.dataset.built = 1;
  v.innerHTML = `<div class="view-head"><h2>Menu &amp; Prices</h2><div class="grow"></div>
    <input id="msearch" placeholder="Search items..." style="width:240px"><button class="btn primary" data-act="prod-add">+ Add Item</button></div>
    <div class="split"><div class="glass card-pad" style="margin:0"><div style="display:flex;align-items:center;margin-bottom:8px"><h3 style="margin:0;flex:1">Categories</h3><button class="btn sm" data-act="cat-add">+ New</button></div><div id="mcats"></div></div>
    <div class="glass card-pad" style="margin:0;overflow:auto"><div id="mtable"></div></div></div>`;
  $('msearch').addEventListener('input', e => { S.menuSearch = e.target.value.trim().toLowerCase(); renderMenu(); });
}

function renderMenu() {
  const cats = [{ id: 'ALL', name: 'All items' }, ...S.categories];
  $('mcats').innerHTML = cats.map(c => `<div class="list-item ${S.menuCat === c.id ? 'active' : ''}" data-act="menu-cat" data-id="${c.id}">
    <span class="grow">${esc(c.name)}</span>${c.id !== 'ALL' ? `<button class="btn sm" data-act="cat-edit" data-id="${c.id}">Edit</button>` : ''}</div>`).join('');
  const list = S.products.filter(p => (S.menuCat === 'ALL' || p.categoryId === S.menuCat) && (!S.menuSearch || (p.name || '').toLowerCase().includes(S.menuSearch)));
  const catName = id => (S.categories.find(c => c.id === id) || {}).name || '-';
  $('mtable').innerHTML = `<table><tr><th>Item</th><th>Category</th><th>Price (${esc(cur())})</th><th>Available</th><th></th></tr>
    ${list.map(p => `<tr><td><b>${esc(p.name)}</b>${p.featured ? ' ⭐' : ''}</td><td>${esc(catName(p.categoryId))}</td>
      <td><input class="pricein" data-id="${p.id}" type="number" min="0" value="${Number(p.price) || 0}" style="width:110px;padding:7px 10px"></td>
      <td><div class="toggle ${p.available !== false ? 'on' : ''}" data-act="prod-toggle" data-id="${p.id}"></div></td>
      <td class="right"><button class="btn sm" data-act="prod-edit" data-id="${p.id}">Edit</button> <button class="btn sm danger" data-act="prod-del" data-id="${p.id}">Delete</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="muted">No items</td></tr>'}</table>`;
}

function categoryModal(c) {
  openModal(`<h3>${c ? 'Edit' : 'New'} category</h3><label>Name</label><input id="catName" value="${esc(c ? c.name : '')}">
    <label>Sort order</label><input id="catSort" type="number" value="${c ? (c.sortOrder || 0) : S.categories.length}">
    <div class="foot">${c ? `<button class="btn danger" data-act="cat-del" data-id="${c.id}">Delete</button>` : ''}<button class="btn" data-act="modal-close">Cancel</button>
    <button class="btn primary" data-act="cat-save" data-id="${c ? c.id : ''}">Save</button></div>`);
}

function productModal(p) {
  p = p || { name: '', description: '', price: 0, costPrice: 0, imageUrl: '', categoryId: S.menuCat !== 'ALL' ? S.menuCat : '', sku: '', taxPercent: 0, available: true, featured: false, variants: [], addOns: [] };
  openModal(`<h3>${p.id ? 'Edit' : 'New'} item</h3>
    <label>Name</label><input id="pName" value="${esc(p.name)}">
    <div class="two"><div><label>Price</label><input id="pPrice" type="number" value="${p.price}"></div><div><label>Cost price</label><input id="pCost" type="number" value="${p.costPrice || 0}"></div></div>
    <div class="two"><div><label>Category</label><select id="pCat"><option value="">- none -</option>${S.categories.map(c => `<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div><label>Tax % (item)</label><input id="pTax" type="number" value="${p.taxPercent || 0}"></div></div>
    <label>Description</label><textarea id="pDesc" style="min-height:52px">${esc(p.description || '')}</textarea>
    <label>Image link (optional)</label><input id="pImg" value="${esc(p.imageUrl || '')}" placeholder="https://...">
    <label>Sizes / variants (one per line: Name, extra price)</label><textarea id="pVars" placeholder="Large, 150">${esc(L.variantsToText(p.variants))}</textarea>
    <label>Add-ons (one per line: Name, price)</label><textarea id="pAdds" placeholder="Extra cheese, 50">${esc(L.addOnsToText(p.addOns))}</textarea>
    <div class="two"><label style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input id="pAvail" type="checkbox" style="width:auto" ${p.available !== false ? 'checked' : ''}> Available</label>
      <label style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input id="pFeat" type="checkbox" style="width:auto" ${p.featured ? 'checked' : ''}> Featured</label></div>
    <div class="foot"><button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" data-act="prod-save" data-id="${p.id || ''}">Save</button></div>`);
}

// ───────── REPORTS ─────────
function buildReports() {
  const v = $('view-reports');
  if (!v.dataset.built) {
    v.dataset.built = 1;
    const d = new Date().toISOString().slice(0, 10);
    v.innerHTML = `<div class="view-head"><h2>Sales Reports</h2><div class="chips" id="rpresets"></div><div class="grow"></div>
      <input id="rfrom" type="date" value="${d}" style="width:150px"><input id="rto" type="date" value="${d}" style="width:150px">
      <button class="btn" data-act="report-custom">Show</button><button class="btn" data-act="report-csv">⬇ Export CSV</button></div><div id="rbody"></div>`;
  }
  runReport(S.reportPreset);
}
async function runReport(preset, custom) {
  S.reportPreset = preset;
  const names = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']];
  $('rpresets').innerHTML = names.map(([k, n]) => `<span class="chip ${preset === k ? 'active' : ''}" data-act="report-preset" data-k="${k}">${n}</span>`).join('');
  const r = custom || L.rangeFor(preset);
  $('rbody').innerHTML = '<div class="muted">Loading...</div>';
  try {
    const snap = await getDocs(query(collection(db, ...path('orders')), where('createdAt', '>=', r.from), where('createdAt', '<=', r.to)));
    S.reportOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { $('rbody').innerHTML = '<div class="error">Could not load: ' + esc(e.message) + '</div>'; return; }
  const rep = L.computeReport(S.reportOrders, S.products);
  const kpi = (l, v) => `<div class="glass kpi"><small>${l}</small><b>${v}</b></div>`;
  const rowsOf = obj => Object.entries(obj).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="right">${MC(v)}</td></tr>`).join('') || '<tr><td class="muted">No data</td></tr>';
  const days = Object.entries(rep.days).sort();
  const max = Math.max(1, ...days.map(([, v]) => v));
  $('rbody').innerHTML = `<div class="kpis">${kpi('Total sales', MC(rep.sales))}${kpi('Orders', rep.orders)}${kpi('Average order', MC(rep.avg))}
      ${kpi('Est. profit', MC(rep.profit))}${kpi('Tax collected', MC(rep.tax))}${kpi('Discounts given', MC(rep.discount))}${kpi('Cancelled orders', rep.cancelled)}</div>
    <div class="glass card-pad"><h3>Sales per day</h3><div class="bars" style="margin-bottom:26px">${days.map(([d, v]) => `<div class="bar" style="height:${Math.max(4, v / max * 100)}%"><em>${L.money(v)}</em><small>${d.slice(5)}</small></div>`).join('') || '<div class="muted">No sales in this period</div>'}</div></div>
    <div class="two"><div class="glass card-pad"><h3>Top selling items</h3><table><tr><th>Item</th><th class="right">Qty</th><th class="right">Revenue</th></tr>
      ${rep.topItems.map(i => `<tr><td>${esc(i.name)}</td><td class="right">${i.qty}</td><td class="right">${MC(i.revenue)}</td></tr>`).join('') || '<tr><td class="muted">No data</td></tr>'}</table></div>
      <div><div class="glass card-pad"><h3>By payment method</h3><table>${rowsOf(rep.byPayment)}</table></div>
      <div class="glass card-pad"><h3>By order type</h3><table>${rowsOf(Object.fromEntries(Object.entries(rep.byType).map(([k, v]) => [typeLabel(k), v])))}</table></div>
      <div class="glass card-pad"><h3>Restaurant vs Website</h3><table>${rowsOf(rep.bySource)}</table></div></div></div>`;
}

// ───────── SETTINGS ─────────
async function renderSettings() {
  const r = S.restaurant;
  const f = (id, label, val, type = 'text') => `<div><label>${label}</label><input id="${id}" type="${type}" value="${esc(val ?? '')}"></div>`;
  $('view-settings').innerHTML = `<div class="view-head"><h2>Settings</h2></div>
    <div class="glass card-pad"><h3>Restaurant details (shown on slips &amp; website)</h3>
      <div class="two">${f('sName', 'Restaurant name', r.name)}${f('sOwner', 'Owner name', r.ownerName)}${f('sPhone', 'Phone', r.phone)}${f('sAddr', 'Address', r.address)}
      ${f('sCur', 'Currency', r.currency || 'PKR')}${f('sFoot', 'Slip footer', r.receiptFooter || 'Thank You! Visit Again')}
      ${f('sTax', 'Tax %', r.taxPercent || 0, 'number')}${f('sSvc', 'Service charge %', r.serviceChargePercent || 0, 'number')}</div>
      <div class="foot" style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="save-restaurant">Save</button></div></div>
    <div class="glass card-pad"><h3>Slip printing</h3><div class="two">
      <div><label>Paper width</label><select id="cfgPaper"><option value="80" ${cfg.paper === '80' ? 'selected' : ''}>80 mm</option><option value="58" ${cfg.paper === '58' ? 'selected' : ''}>58 mm</option></select></div>
      <div><label>Printer</label><select id="cfgPrinter"><option value="">Default printer</option></select></div></div>
      <label style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input id="cfgSilent" type="checkbox" style="width:auto" ${cfg.silent ? 'checked' : ''}> Print directly without showing the print dialog</label>
      <div class="foot" style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px"><button class="btn" data-act="test-print">Test print</button><button class="btn primary" data-act="save-print">Save</button></div></div>
    <div class="glass card-pad"><h3>New order alert</h3>
      <label style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input id="cfgSound" type="checkbox" style="width:auto" ${cfg.sound ? 'checked' : ''}> Play sound when a new order arrives</label>
      <div class="foot" style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px"><button class="btn" data-act="test-sound">Test sound</button><button class="btn primary" data-act="save-sound">Save</button></div></div>
    <div class="glass card-pad"><h3>Account</h3><p class="muted">Signed in as ${esc(S.email)}</p><button class="btn danger" data-act="logout">Logout</button></div>`;
  if (window.desktop) {
    const printers = await window.desktop.getPrinters();
    const sel = $('cfgPrinter');
    if (sel) sel.innerHTML = '<option value="">Default printer</option>' + printers.map(p => `<option value="${esc(p.name)}" ${p.name === cfg.printer ? 'selected' : ''}>${esc(p.displayName || p.name)}</option>`).join('');
  }
}

// ───────── actions ─────────
const val = id => $(id).value;
const orderById = id => S.orders.find(o => o.id === id);
const ACTS = {
  async login() {
    loginError(''); const b = $('loginBtn'); b.disabled = true; b.textContent = 'Signing in...';
    try { await signInWithEmailAndPassword(auth, val('loginEmail').trim(), val('loginPass')); }
    catch (e) { loginError(/invalid|wrong|user-not-found|credential/i.test(e.code + e.message) ? 'Wrong email or password' : e.message); }
    b.disabled = false; b.textContent = 'Login';
  },
  nav(el) { if (el.dataset.view === 'orders') ackAlerts(); switchView(el.dataset.view); },
  'alert-view'() { ackAlerts(); S.ordersFilter = 'active'; switchView('orders'); },
  'alert-silence'() { ackAlerts(); },
  ofilter(el) { S.ordersFilter = el.dataset.f; renderOrders(); },
  async adv(el) { await updateDoc(doc(db, ...path('orders', el.dataset.id)), { status: el.dataset.st, ...(el.dataset.st === 'COMPLETED' ? { completedAt: Date.now() } : {}) }); },
  async 'cancel-order'(el) { if (confirm('Cancel this order?')) await updateDoc(doc(db, ...path('orders', el.dataset.id)), { status: 'CANCELLED' }); },
  'print-order'(el) { const o = orderById(el.dataset.id); if (o) printOrder(o); },
  map(el) { const u = `https://www.google.com/maps?q=${el.dataset.lat},${el.dataset.lng}`; window.desktop ? window.desktop.openExternal(u) : window.open(u, '_blank'); },
  'pos-cat'(el) { S.posCat = el.dataset.id; renderPOSProducts(); },
  'pos-type'(el) { S.orderType = el.dataset.t; renderCart(); },
  'pos-add'(el) {
    const p = S.products.find(x => x.id === el.dataset.id); if (!p) return;
    if (p.available === false) { toast('This item is marked unavailable'); return; }
    if ((p.variants || []).length || (p.addOns || []).length) openItemModal(p); else addToCart(L.buildLine(p, null, [], 1));
  },
  'item-add'(el) {
    const p = S.products.find(x => x.id === el.dataset.id);
    const rv = document.querySelector('input[name="var"]:checked');
    const variant = rv ? p.variants[+rv.value] : null;
    const adds = [...document.querySelectorAll('.addon:checked')].map(c => p.addOns[+c.value]);
    addToCart(L.buildLine(p, variant, adds, 1)); closeModal();
  },
  'cart-inc'(el) { const l = S.cart.find(x => x.key === el.dataset.key); if (l) { l.quantity++; renderCart(); } },
  'cart-dec'(el) { const l = S.cart.find(x => x.key === el.dataset.key); if (l) { l.quantity--; if (l.quantity <= 0) S.cart = S.cart.filter(x => x !== l); renderCart(); } },
  'cart-del'(el) { S.cart = S.cart.filter(x => x.key !== el.dataset.key); renderCart(); },
  'pos-clear'() { S.cart = []; S.discount = 0; S.received = ''; ['pdisc', 'precv'].forEach(id => $(id).value = ''); renderCart(); },
  'pos-place'() { return placeOrder(); },
  'modal-close'() { closeModal(); },
  'menu-cat'(el) { S.menuCat = el.dataset.id; renderMenu(); },
  'cat-add'() { categoryModal(null); },
  'cat-edit'(el, e) { e.stopPropagation(); categoryModal(S.categories.find(c => c.id === el.dataset.id)); },
  async 'cat-save'(el) {
    const name = val('catName').trim(); if (!name) { toast('Enter a name'); return; }
    const ref = el.dataset.id ? doc(db, ...path('categories', el.dataset.id)) : doc(collection(db, ...path('categories')));
    await setDoc(ref, { name, sortOrder: parseInt(val('catSort')) || 0 }); closeModal(); toast('Category saved');
  },
  async 'cat-del'(el) {
    if (S.products.some(p => p.categoryId === el.dataset.id) && !confirm('This category still has items. Delete it anyway?')) return;
    if (!confirm('Delete this category?')) return;
    await deleteDoc(doc(db, ...path('categories', el.dataset.id))); S.menuCat = 'ALL'; closeModal();
  },
  'prod-add'() { productModal(null); },
  'prod-edit'(el) { productModal(S.products.find(p => p.id === el.dataset.id)); },
  async 'prod-toggle'(el) { const p = S.products.find(x => x.id === el.dataset.id); await updateDoc(doc(db, ...path('products', p.id)), { available: p.available === false }); },
  async 'prod-del'(el) { const p = S.products.find(x => x.id === el.dataset.id); if (confirm(`Delete "${p.name}"?`)) await deleteDoc(doc(db, ...path('products', p.id))); },
  async 'prod-save'(el) {
    const name = val('pName').trim(); if (!name) { toast('Enter an item name'); return; }
    const data = {
      name, description: val('pDesc').trim(), price: parseFloat(val('pPrice')) || 0, costPrice: parseFloat(val('pCost')) || 0,
      imageUrl: val('pImg').trim(), categoryId: val('pCat'), sku: '', available: $('pAvail').checked, featured: $('pFeat').checked,
      taxPercent: parseFloat(val('pTax')) || 0, variants: L.parseVariants(val('pVars')), addOns: L.parseAddOns(val('pAdds'))
    };
    const old = S.products.find(p => p.id === el.dataset.id); if (old && old.sku) data.sku = old.sku;
    const ref = el.dataset.id ? doc(db, ...path('products', el.dataset.id)) : doc(collection(db, ...path('products')));
    await setDoc(ref, data); closeModal(); toast('Item saved');
  },
  'report-preset'(el) { runReport(el.dataset.k); },
  'report-custom'() {
    const from = new Date(val('rfrom') + 'T00:00:00').getTime(), to = new Date(val('rto') + 'T23:59:59').getTime();
    if (isNaN(from) || isNaN(to)) { toast('Pick both dates'); return; }
    runReport('custom', { from, to });
  },
  'report-csv'() {
    if (!S.reportOrders.length) { toast('No orders to export'); return; }
    const blob = new Blob([L.ordersToCsv(S.reportOrders)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  },
  async 'save-restaurant'() {
    await setDoc(doc(db, ...path()), {
      name: val('sName').trim(), ownerName: val('sOwner').trim(), phone: val('sPhone').trim(), address: val('sAddr').trim(),
      currency: val('sCur').trim() || 'PKR', receiptFooter: val('sFoot').trim(),
      taxPercent: parseFloat(val('sTax')) || 0, serviceChargePercent: parseFloat(val('sSvc')) || 0
    }, { merge: true });
    toast('Saved');
  },
  'save-print'() { cfg.paper = val('cfgPaper'); cfg.printer = val('cfgPrinter'); cfg.silent = $('cfgSilent').checked; saveCfg(); toast('Printer settings saved'); },
  'test-print'() {
    ACTS['save-print']();
    printOrder({ orderNumber: '#TEST', createdAt: Date.now(), orderType: 'DINE_IN', items: [{ quantity: 1, name: 'Test item', lineTotal: 100 }], subtotal: 100, total: 100, paymentMethod: 'CASH' });
  },
  'save-sound'() { cfg.sound = $('cfgSound').checked; saveCfg(); toast('Saved'); },
  'test-sound'() { const s = cfg.sound; cfg.sound = true; beep(); cfg.sound = s; },
  async logout() { if (confirm('Logout?')) { ackAlerts(); await signOut(auth); } }
};

document.addEventListener('click', async e => {
  const back = e.target;
  if (back.id === 'modalBack') { closeModal(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTS[el.dataset.act]; if (!fn) return;
  try { await fn(el, e); } catch (err) { console.error(err); toast('Error: ' + (err.message || err), 5000); }
});
document.addEventListener('change', async e => {
  if (e.target.classList.contains('pricein')) {
    try { await updateDoc(doc(db, ...path('products', e.target.dataset.id)), { price: parseFloat(e.target.value) || 0 }); toast('Price updated'); }
    catch (err) { toast('Error: ' + err.message); }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('loginScreen').classList.contains('hidden')) ACTS.login(); if (e.key === 'Escape') closeModal(); });

const setNet = () => { const on = navigator.onLine; $('netDot').classList.toggle('on', on); $('netText').textContent = on ? 'Online' : 'Offline - working locally'; };
window.addEventListener('online', setNet); window.addEventListener('offline', setNet); setNet();
