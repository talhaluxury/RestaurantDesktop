import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, onSnapshot, query, where, runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as L from "./lib.js";
import { MENU_SEED, CATEGORY_EMOJI } from "./menu-seed.js";

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

// Persistent offline cache: every order, menu item and category you've loaded stays on
// this computer's disk. The counter (table, orders list, menu, reports already viewed)
// keeps working with no internet, new orders/edits are queued locally and sent the
// moment the connection comes back - nothing is lost either way.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
});


// Offline-safe writes: Firestore applies the write to the local cache instantly (screen
// updates, order is queued on disk) but the returned promise only resolves once the
// SERVER confirms - which never happens offline, so "await" would freeze the UI forever
// ("Sending..." stuck). So we don't wait for the server; real errors still show a toast.
const _bg = p => { Promise.resolve(p).catch(e => { try { toast('Could not save: ' + (e && e.message || e), 5000); } catch (_) { } }); return Promise.resolve(); };
const wSet = (...a) => _bg(setDoc(...a));
const wUpd = (...a) => _bg(updateDoc(...a));
const wDel = (...a) => _bg(deleteDoc(...a));

const $ = id => document.getElementById(id);
const esc = L.esc;

// ───────── state ─────────
const S = {
  uid: null, rid: null, email: '', restaurant: {}, categories: [], products: [], tables: [],
  orders: [], ordersLoaded: false, view: 'orders', ordersFilter: 'active', ordersSearch: '',
  cart: [], orderType: 'DINE_IN', tableId: '', customer: { name: '', phone: '', address: '' },
  discount: 0, posCat: 'ALL', posSearch: '',
  menuCat: 'ALL', menuSearch: '', reportOrders: [], reportPreset: 'today', alerts: [], unsubs: []
};
const cfg = Object.assign({ paper: '80', silent: false, printer: '', sound: true, theme: 'dark' },
  JSON.parse(localStorage.getItem('cfg') || '{}'));
const saveCfg = () => localStorage.setItem('cfg', JSON.stringify(cfg));
function applyTheme() {
  document.documentElement.setAttribute('data-theme', cfg.theme);
  document.querySelectorAll('.theme-toggle button').forEach(b => b.classList.toggle('active', b.dataset.v === cfg.theme));
}
applyTheme();
document.addEventListener('DOMContentLoaded', applyTheme);

const cur = () => S.restaurant.currency || 'PKR';
const MC = n => L.money(n, cur());
const path = (...p) => ['restaurants', S.rid, ...p];
const toast = (msg, ms = 2800) => { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); };
const openModal = html => { $('modal').innerHTML = html; $('modalBack').classList.remove('hidden'); };
const closeModal = () => { $('modalBack').classList.add('hidden'); _activePaymentModal = null; };

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
function productImage(p) {
  const cat = S.categories.find(c => c.id === p.categoryId);
  const emoji = (cat && CATEGORY_EMOJI[cat.name]) || '🍽️';
  return L.emojiImage(emoji);
}

// ───────── auth ─────────
function showLogin() { $('appShell').classList.add('hidden'); $('loginScreen').classList.remove('hidden'); }
function showApp() { $('loginScreen').classList.add('hidden'); $('appShell').classList.remove('hidden'); }
function loginError(m) { $('loginError').textContent = m || ''; }

let licenseUnsub = null;

onAuthStateChanged(auth, async user => {
  if (!user) { stopListeners(); if (licenseUnsub) { licenseUnsub(); licenseUnsub = null; } showLogin(); return; }
  try {
    const m = await getDoc(doc(db, 'userRestaurants', user.uid));
    if (!m.exists()) { loginError('This account is not linked to a restaurant.'); await signOut(auth); return; }
    S.uid = user.uid; S.email = user.email || ''; S.rid = m.data().restaurantId;

    // License check - lets the developer remotely disable this login (e.g. unpaid account).
    const licRef = doc(db, 'licenses', user.uid);
    const lic = await getDoc(licRef);
    if (!lic.exists()) {
      // First time this account has opened the Desktop app - register it, enabled by default.
      let restaurantName = '';
      try { restaurantName = (await getDoc(doc(db, 'restaurants', S.rid))).data()?.name || ''; } catch (e) { }
      await setDoc(licRef, { email: user.email, restaurantId: S.rid, restaurantName, enabled: true, createdAt: Date.now() });
    } else if (lic.data().enabled === false) {
      loginError('Access to this software has been disabled. Please contact support.');
      await signOut(auth); return;
    }
    // Keep watching - if access is switched off while the app is open, log out immediately.
    licenseUnsub = onSnapshot(licRef, snap => {
      if (snap.exists() && snap.data().enabled === false && auth.currentUser) {
        signOut(auth);
        showLogin();
        loginError('Access to this software has been disabled. Please contact support.');
      }
    });
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
    reconcileOfflineOrderNumbers();
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
  const pending = by(o => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED');
  const filters = [
    ['active', 'Active', active.length], ['pending', '💰 Pending Payment', pending.length],
    ['completed', 'Completed', S.orders.filter(o => o.status === 'COMPLETED').length],
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
  } else if (S.ordersFilter === 'pending') {
    const list = pending.filter(match);
    body.innerHTML = `<div class="grid">${list.map(orderCard).join('') || '<div class="muted">Nothing waiting for payment.</div>'}</div>`;
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
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span>${o.paymentStatus === 'UNPAID' ? '<span class="pending-dot"></span><span style="color:var(--red);font-weight:700">Payment Pending</span>' : `<span class="muted">${esc(o.paymentMethod || '')}</span>`}</span>
      <b style="color:var(--accent2);font-size:16px">${MC(o.total)}</b></div>
    <div class="actions">
      ${nxt ? `<button class="btn primary sm" data-act="adv" data-id="${o.id}" data-st="${nxt[0]}">${nxt[1]}</button>` : ''}
      ${o.paymentStatus === 'UNPAID'
        ? `<button class="btn sm green" data-act="collect-pay" data-id="${o.id}">💰 Collect Payment</button>${o.status !== 'CANCELLED' ? `<button class="btn sm" data-act="print-order" data-id="${o.id}">🖨️ Unpaid Slip</button>` : ''}`
        : `<button class="btn sm" data-act="print-order" data-id="${o.id}">🖨️ Slip</button>${o.status !== 'CANCELLED' ? `<button class="btn sm" data-act="edit-slip" data-id="${o.id}">✏️ Edit Slip</button>` : ''}`}
      ${loc ? `<button class="btn sm" data-act="map" data-lat="${loc.lat}" data-lng="${loc.lng}">📍 Customer</button>` : ''}
      ${live && ['NEW', 'PREPARING', 'READY'].includes(o.status) ? `<button class="btn sm" data-act="map" data-lat="${live.lat}" data-lng="${live.lng}">🏍️ Rider</button>` : ''}
      ${canCancel ? `<button class="btn sm danger" data-act="cancel-order" data-id="${o.id}">Cancel</button>` : ''}
    </div></div>`;
}

// ───────── Payment / print-preview modal (used for first payment AND later slip edits) ─────────
function paymentModal(order) {
  const isDelivery = order.orderType === 'DELIVERY';
  openModal(`
    <h3>${order.paymentStatus === 'UNPAID' ? 'Collect Payment' : 'Edit Slip'} - ${esc(order.orderNumber)}</h3>
    <div class="pay-split">
      <div>
        <div class="muted small">${esc(order.customerName || '')} ${esc(order.customerPhone || '')}</div>
        <label>Discount (amount)</label><input id="payDisc" type="number" min="0" value="${order.discount || 0}">
        ${isDelivery ? `<label>Delivery charge</label><input id="payDeliv" type="number" min="0" value="${order.deliveryCharge || 0}">
          <div class="chips" style="margin-top:6px"><span class="chip" data-qd="50">Rs 50</span><span class="chip" data-qd="100">Rs 100</span><span class="chip" data-qd="150">Rs 150</span></div>` : ''}
        <label>Payment method</label>
        <select id="payMethod"><option>CASH</option><option>CARD</option><option>EASYPAISA</option><option>JAZZCASH</option><option>BANK</option><option>OTHER</option></select>
        <label>Amount received</label><input id="payRecv" type="number" min="0" value="${order.amountReceived || order.total || 0}">
        <div id="payChangeRow" class="trow" style="margin-top:10px"></div>
        <div id="payTotalsRow"></div>
      </div>
      <div><label>Slip preview</label><iframe id="slipFrame" class="slip-preview" style="width:100%;border:none"></iframe></div>
    </div>
    <div class="foot"><button class="btn" data-act="modal-close">Close</button>
      <button class="btn" data-act="pay-save" data-id="${order.id}">Save (no print)</button>
      <button class="btn primary" data-act="pay-print" data-id="${order.id}">🖨️ Print &amp; Save</button></div>`);

  $('payMethod').value = order.paymentMethod || 'CASH';

  function currentOrder() {
    const disc = parseFloat($('payDisc').value) || 0;
    const deliv = isDelivery ? (parseFloat($('payDeliv').value) || 0) : 0;
    const t = L.totals(order.items, S.restaurant.taxPercent, S.restaurant.serviceChargePercent, disc, deliv);
    const received = parseFloat($('payRecv').value) || 0;
    return { ...order, discount: t.discount, deliveryCharge: t.deliveryCharge, tax: t.tax, serviceCharge: t.serviceCharge, total: t.total, paymentMethod: $('payMethod').value, amountReceived: received, changeDue: Math.max(0, received - t.total) };
  }
  function updatePreview() {
    const o = currentOrder();
    $('slipFrame').srcdoc = L.receiptHtml(o, { ...S.restaurant, currency: cur() }, cfg.paper);
    const change = Math.max(0, o.amountReceived - o.total);
    $('payChangeRow').innerHTML = `<span>Total: <b>${MC(o.total)}</b></span><span style="color:var(--green)">Change: ${MC(change)}</span>`;
  }
  ['payDisc', 'payDeliv', 'payMethod', 'payRecv'].forEach(id => { const el = $(id); if (el) el.addEventListener('input', updatePreview); });
  document.querySelectorAll('#modal [data-qd]').forEach(c => c.addEventListener('click', () => { $('payDeliv').value = c.dataset.qd; updatePreview(); }));
  updatePreview();

  return { currentOrder };
}
let _activePaymentModal = null;

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
        <div id="addrRow"><label>Delivery address</label><input id="caddr">
          <label>Delivery charge</label>
          <div class="two" style="align-items:center">
            <input id="pdeliv" type="number" min="0" placeholder="0">
            <div class="chips"><span class="chip" data-act="quick-deliv" data-v="50">Rs 50</span><span class="chip" data-act="quick-deliv" data-v="100">Rs 100</span><span class="chip" data-act="quick-deliv" data-v="150">Rs 150</span></div>
          </div></div></div>
      <div class="cart-lines" id="clines"></div>
      <label>Discount (amount)</label><input id="pdisc" type="number" min="0" placeholder="0">
      <div id="ptotals" style="margin-top:8px"></div>
      <div class="muted small" style="margin-top:6px">Payment is collected after the order is sent to the kitchen - see <b>Pending Payment</b> in Live Orders.</div>
      <div class="two" style="margin-top:10px"><button class="btn" data-act="pos-clear">Clear</button><button class="btn primary" id="placeBtn" data-act="pos-place">Send Order</button></div>
    </div></div>`;
  $('psearch').addEventListener('input', e => { S.posSearch = e.target.value.trim().toLowerCase(); renderPOSProducts(); });
  $('cname').addEventListener('input', e => S.customer.name = e.target.value);
  $('cphone').addEventListener('input', e => S.customer.phone = e.target.value);
  $('caddr').addEventListener('input', e => S.customer.address = e.target.value);
  $('pdeliv').addEventListener('input', e => { S_delivery = parseFloat(e.target.value) || 0; renderCart(); });
  $('pdisc').addEventListener('input', e => { S.discount = parseFloat(e.target.value) || 0; renderCart(); });
  $('ptable').addEventListener('change', e => S.tableId = e.target.value);
}

function renderPOSProducts() {
  const cats = [{ id: 'ALL', name: 'All' }, ...S.categories];
  $('pcats').innerHTML = cats.map(c => `<span class="chip ${S.posCat === c.id ? 'active' : ''}" data-act="pos-cat" data-id="${c.id}">${esc(c.name)}</span>`).join('');
  const list = S.products.filter(p => (S.posCat === 'ALL' || p.categoryId === S.posCat) && (!S.posSearch || (p.name || '').toLowerCase().includes(S.posSearch)));
  $('pgrid').innerHTML = list.map(p => `<div class="pcard ${p.available === false ? 'off' : ''}" data-act="pos-add" data-id="${p.id}">
    <img src="${esc(p.imageUrl || productImage(p))}" loading="lazy"><b>${esc(p.name)}</b><span>${MC(p.price)}</span>${p.available === false ? '<div class="muted small">Unavailable</div>' : ''}</div>`).join('')
    || '<div class="muted">No items. Add them in Menu &amp; Prices.</div>';
}

let S_delivery = 0;
function cartTotals() { return L.totals(S.cart, S.restaurant.taxPercent, S.restaurant.serviceChargePercent, S.discount, S.orderType === 'DELIVERY' ? S_delivery : 0); }

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
  $('ptotals').innerHTML = `<div class="trow"><span>Subtotal</span><span>${MC(t.subtotal)}</span></div>
    ${t.discount ? `<div class="trow"><span>Discount</span><span>-${MC(t.discount)}</span></div>` : ''}
    ${t.deliveryCharge ? `<div class="trow"><span>Delivery Charge</span><span>${MC(t.deliveryCharge)}</span></div>` : ''}
    ${tp > 0 ? `<div class="trow"><span>Tax (${tp}%)</span><span>${MC(t.tax)}</span></div>` : ''}
    ${sp > 0 ? `<div class="trow"><span>Service (${sp}%)</span><span>${MC(t.serviceCharge)}</span></div>` : ''}
    <div class="trow total"><span>Total</span><span>${MC(t.total)}</span></div>`;
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

// Firestore transactions need a live connection, so they're skipped while offline.
// An offline order instead gets a temporary "OFFLINE-xxxx" number immediately (so the
// kitchen slip and screen both work right away) and is swapped for a real queued
// "#000123" number automatically the moment the connection comes back (see
// reconcileOfflineOrderNumbers below) - the order itself is never delayed or lost.
async function nextOrderNumber() {
  if (!navigator.onLine) return 'OFFLINE-' + Date.now().toString(36).toUpperCase();
  try {
    const ref = doc(db, ...path('settings', 'config'));
    const n = await runTransaction(db, async t => {
      const s = await t.get(ref); const cur = s.exists() ? (s.data().orderCounter || 0) : 0;
      t.set(ref, { orderCounter: cur + 1 }, { merge: true }); return cur + 1;
    });
    return '#' + String(n).padStart(6, '0');
  } catch (e) {
    return 'OFFLINE-' + Date.now().toString(36).toUpperCase();
  }
}

let reconciling = false;
async function reconcileOfflineOrderNumbers() {
  if (reconciling || !navigator.onLine) return;
  const pending = S.orders.filter(o => (o.orderNumber || '').startsWith('OFFLINE-'));
  if (!pending.length) return;
  reconciling = true;
  for (const o of pending) {
    try {
      const real = await nextOrderNumber();
      if (real.startsWith('OFFLINE-')) break; // still offline/unreachable - stop for now
      await updateDoc(doc(db, ...path('orders', o.id)), { orderNumber: real });
    } catch (e) { /* will retry next time connectivity fires */ }
  }
  reconciling = false;
}


// ───────── product photo upload ─────────
let pendingImg = null; // data URL of a freshly picked photo (resized), not yet saved
function resizeImage(file, max = 1280, q = 0.8) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Could not read the image'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('Not a valid image'));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
// ── Cloudinary settings (same account/preset as the mobile app) ──
const CLOUDINARY_CLOUD_NAME = 'pwyofud8';
const CLOUDINARY_UPLOAD_PRESET = 'restaurantpos_unsigned';

// Online: upload to Cloudinary and use its https link (works in the mobile app & website too).
// Offline / not configured / upload failed: keep the small resized photo inside the item
// itself so saving never gets stuck.
async function resolveProductImage(dataUrl, productId) {
  if (!navigator.onLine || CLOUDINARY_CLOUD_NAME.startsWith('YOUR_')) return dataUrl;
  try {
    const fd = new FormData();
    fd.append('file', dataUrl);
    fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    fd.append('folder', `restaurants/${S.rid}/products`);
    fd.append('public_id', productId);
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: fd, signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    if (!r.ok || !j.secure_url) throw new Error((j.error && j.error.message) || 'Upload failed');
    return j.secure_url;
  } catch (e) { toast('Cloudinary upload failed - photo saved inside the item instead (' + e.message + ')', 5000); return dataUrl; }
}

async function placeOrder() {
  if (!S.cart.length) return;
  if (S.orderType === 'DELIVERY' && !S.customer.address.trim()) { toast('Please enter the delivery address'); return; }
  const btn = $('placeBtn'); btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const t = cartTotals();
    const table = S.tables.find(x => x.id === S.tableId);
    const orderNumber = await nextOrderNumber();
    const data = {
      orderNumber,
      items: S.cart.map(l => ({ productId: l.productId, name: l.name, variantName: l.variantName, addOnNames: l.addOnNames, unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.unitPrice * l.quantity })),
      orderType: S.orderType, tableId: S.orderType === 'DINE_IN' && table ? table.id : null, tableLabel: S.orderType === 'DINE_IN' && table ? table.label : null,
      customerName: S.customer.name.trim(), customerPhone: S.customer.phone.trim(), customerAddress: S.orderType === 'DELIVERY' ? S.customer.address.trim() : '',
      subtotal: t.subtotal, discount: t.discount, deliveryCharge: t.deliveryCharge, tax: t.tax, serviceCharge: t.serviceCharge, total: t.total,
      paymentMethod: null, amountReceived: 0, changeDue: 0, paymentStatus: 'UNPAID',
      status: 'NEW', cashierName: (S.email || 'Laptop').split('@')[0], createdAt: Date.now()
    };
    const ref = doc(collection(db, ...path('orders')));
    await wSet(ref, data);
    // No slip here: only ONE slip is printed per order - the paid (cash) slip when payment is collected.
    toast('Order ' + orderNumber + ' sent to kitchen - pending payment');
    S.cart = []; S.discount = 0; S_delivery = 0; S.customer = { name: '', phone: '', address: '' };
    ['pdisc', 'pdeliv', 'cname', 'cphone', 'caddr'].forEach(id => $(id) && ($(id).value = ''));
  } catch (e) { toast('Could not place order: ' + e.message, 5000); }
  btn.textContent = 'Send Order'; renderCart();
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
    ${list.map(p => `<tr><td style="display:flex;align-items:center;gap:8px"><img src="${esc(p.imageUrl || productImage(p))}" style="width:34px;height:34px;border-radius:8px;object-fit:cover"><b>${esc(p.name)}</b>${p.featured ? ' ⭐' : ''}</td><td>${esc(catName(p.categoryId))}</td>
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
  pendingImg = null;
  p = p || { name: '', description: '', price: 0, costPrice: 0, imageUrl: '', categoryId: S.menuCat !== 'ALL' ? S.menuCat : '', sku: '', taxPercent: 0, available: true, featured: false, variants: [], addOns: [] };
  openModal(`<h3>${p.id ? 'Edit' : 'New'} item</h3>
    <label>Name</label><input id="pName" value="${esc(p.name)}">
    <div class="two"><div><label>Price</label><input id="pPrice" type="number" value="${p.price}"></div><div><label>Cost price</label><input id="pCost" type="number" value="${p.costPrice || 0}"></div></div>
    <div class="two"><div><label>Category</label><select id="pCat"><option value="">- none -</option>${S.categories.map(c => `<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div><label>Tax % (item)</label><input id="pTax" type="number" value="${p.taxPercent || 0}"></div></div>
    <label>Description</label><textarea id="pDesc" style="min-height:52px">${esc(p.description || '')}</textarea>
    <label>Image (optional - a themed icon is used automatically if left blank)</label>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
      <img id="pImgPrev" src="${esc(p.imageUrl || '')}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;${p.imageUrl ? '' : 'display:none'}">
      <input id="pImgFile" type="file" accept="image/*" style="display:none">
      <button class="btn" type="button" data-act="pimg-pick">📷 Upload photo</button>
      <button class="btn sm" type="button" data-act="pimg-clear">Remove</button>
    </div>
    <input id="pImg" value="${/^data:/.test(p.imageUrl || '') ? '' : esc(p.imageUrl || '')}" placeholder="...or paste an image link https://...">
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
    <div class="glass card-pad"><h3>Starter menu</h3>
      <p class="muted small">One-time import of Malik Taste Point's full menu (${MENU_SEED.length} items across ${new Set(MENU_SEED.map(m => m.cat)).size} categories) with prices and sizes, so you don't have to type it all in by hand. Safe to run more than once - it skips items that already exist by name. A few prices that weren't clearly printed were estimated and are worth double-checking afterward (Water Bottle, Cold Drink 345ml, Half Chargha, Flavour Pasta variants).</p>
      <div class="foot" style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn primary" data-act="import-menu">Import Full Menu</button></div></div>
    <div class="glass card-pad"><h3>Appearance</h3><p class="muted small">Theme can also be switched from the bottom of the sidebar.</p>
      <div class="theme-toggle"><button data-act="theme" data-v="dark">🌙 Dark</button><button data-act="theme" data-v="light">☀️ Light</button></div></div>
    <div class="glass card-pad"><h3>Change password</h3>
      <label>Current password</label><input id="pwOld" type="password" autocomplete="current-password">
      <label>New password (at least 6 characters)</label><input id="pwNew" type="password" autocomplete="new-password">
      <label>Confirm new password</label><input id="pwNew2" type="password" autocomplete="new-password">
      <div class="foot" style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary" data-act="change-pass">Change Password</button></div>
      <div class="muted small">Needs an internet connection.</div></div>
    <div class="glass card-pad"><h3>Account</h3><p class="muted">Signed in as ${esc(S.email)}</p><button class="btn danger" data-act="logout">Logout</button></div>`;
  document.querySelectorAll('#view-settings .theme-toggle button').forEach(b => b.classList.toggle('active', b.dataset.v === cfg.theme));
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
  async adv(el) { await wUpd(doc(db, ...path('orders', el.dataset.id)), { status: el.dataset.st, ...(el.dataset.st === 'COMPLETED' ? { completedAt: Date.now() } : {}) }); },
  async 'cancel-order'(el) { if (confirm('Cancel this order?')) await wUpd(doc(db, ...path('orders', el.dataset.id)), { status: 'CANCELLED' }); },
  'print-order'(el) { const o = orderById(el.dataset.id); if (o) printOrder(o); },
  'collect-pay'(el) { const o = orderById(el.dataset.id); if (o) _activePaymentModal = paymentModal(o); },
  'edit-slip'(el) { const o = orderById(el.dataset.id); if (o) _activePaymentModal = paymentModal(o); },
  async 'pay-save'(el) {
    if (!_activePaymentModal) return;
    const o = _activePaymentModal.currentOrder();
    await wUpd(doc(db, ...path('orders', el.dataset.id)), {
      discount: o.discount, deliveryCharge: o.deliveryCharge, tax: o.tax, serviceCharge: o.serviceCharge, total: o.total,
      paymentMethod: o.paymentMethod, amountReceived: o.amountReceived, changeDue: o.changeDue, paymentStatus: 'PAID'
    });
    closeModal(); toast('Saved');
  },
  async 'pay-print'(el) {
    if (!_activePaymentModal) return;
    const o = _activePaymentModal.currentOrder();
    await wUpd(doc(db, ...path('orders', el.dataset.id)), {
      discount: o.discount, deliveryCharge: o.deliveryCharge, tax: o.tax, serviceCharge: o.serviceCharge, total: o.total,
      paymentMethod: o.paymentMethod, amountReceived: o.amountReceived, changeDue: o.changeDue, paymentStatus: 'PAID'
    });
    await printOrder(o);
    closeModal(); toast('Paid and printed');
  },
  map(el) { const u = `https://www.google.com/maps?q=${el.dataset.lat},${el.dataset.lng}`; window.desktop ? window.desktop.openExternal(u) : window.open(u, '_blank'); },
  'pos-cat'(el) { S.posCat = el.dataset.id; renderPOSProducts(); },
  'pos-type'(el) { S.orderType = el.dataset.t; if (el.dataset.t !== 'DELIVERY') { S_delivery = 0; $('pdeliv').value = ''; } renderCart(); },
  'quick-deliv'(el) { S_delivery = parseFloat(el.dataset.v) || 0; $('pdeliv').value = S_delivery; renderCart(); },
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
  'pos-clear'() { S.cart = []; S.discount = 0; S_delivery = 0; ['pdisc', 'pdeliv'].forEach(id => $(id) && ($(id).value = '')); renderCart(); },
  'pos-place'() { return placeOrder(); },
  'modal-close'() { closeModal(); },
  'menu-cat'(el) { S.menuCat = el.dataset.id; renderMenu(); },
  'cat-add'() { categoryModal(null); },
  'cat-edit'(el, e) { e.stopPropagation(); categoryModal(S.categories.find(c => c.id === el.dataset.id)); },
  async 'cat-save'(el) {
    const name = val('catName').trim(); if (!name) { toast('Enter a name'); return; }
    const ref = el.dataset.id ? doc(db, ...path('categories', el.dataset.id)) : doc(collection(db, ...path('categories')));
    await wSet(ref, { name, sortOrder: parseInt(val('catSort')) || 0 }); closeModal(); toast('Category saved');
  },
  async 'cat-del'(el) {
    if (S.products.some(p => p.categoryId === el.dataset.id) && !confirm('This category still has items. Delete it anyway?')) return;
    if (!confirm('Delete this category?')) return;
    await wDel(doc(db, ...path('categories', el.dataset.id))); S.menuCat = 'ALL'; closeModal();
  },
  'prod-add'() { productModal(null); },
  'prod-edit'(el) { productModal(S.products.find(p => p.id === el.dataset.id)); },
  async 'prod-toggle'(el) { const p = S.products.find(x => x.id === el.dataset.id); await wUpd(doc(db, ...path('products', p.id)), { available: p.available === false }); },
  async 'prod-del'(el) { const p = S.products.find(x => x.id === el.dataset.id); if (confirm(`Delete "${p.name}"?`)) await wDel(doc(db, ...path('products', p.id))); },
  'pimg-pick'() { pendingImg = null; $('pImgFile').value = ''; $('pImgFile').click(); },
  'pimg-clear'() { pendingImg = null; $('pImg').value = ''; $('pImgFile').value = ''; const i = $('pImgPrev'); i.removeAttribute('src'); i.style.display = 'none'; pendingImg = ''; },
  async 'prod-save'(el) {
    const name = val('pName').trim(); if (!name) { toast('Enter an item name'); return; }
    const ref = el.dataset.id ? doc(db, ...path('products', el.dataset.id)) : doc(collection(db, ...path('products')));
    let imageUrl = val('pImg').trim();
    if (pendingImg) { const b = el; b.disabled = true; b.textContent = 'Saving...'; imageUrl = await resolveProductImage(pendingImg, ref.id); }
    else if (pendingImg === '') imageUrl = '';
    else if (!imageUrl) { const o = S.products.find(p => p.id === el.dataset.id); if (o && /^data:/.test(o.imageUrl || '')) imageUrl = o.imageUrl; }
    pendingImg = null;
    const data = {
      name, description: val('pDesc').trim(), price: parseFloat(val('pPrice')) || 0, costPrice: parseFloat(val('pCost')) || 0,
      imageUrl, categoryId: val('pCat'), sku: '', available: $('pAvail').checked, featured: $('pFeat').checked,
      taxPercent: parseFloat(val('pTax')) || 0, variants: L.parseVariants(val('pVars')), addOns: L.parseAddOns(val('pAdds'))
    };
    const old = S.products.find(p => p.id === el.dataset.id); if (old && old.sku) data.sku = old.sku;
    await wSet(ref, data); closeModal(); toast('Item saved');
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
    await wSet(doc(db, ...path()), {
      name: val('sName').trim(), ownerName: val('sOwner').trim(), phone: val('sPhone').trim(), address: val('sAddr').trim(),
      currency: val('sCur').trim() || 'PKR', receiptFooter: val('sFoot').trim(),
      taxPercent: parseFloat(val('sTax')) || 0, serviceChargePercent: parseFloat(val('sSvc')) || 0
    }, { merge: true });
    toast('Saved');
  },
  async 'change-pass'(el) {
    const oldP = val('pwOld'), n1 = val('pwNew'), n2 = val('pwNew2');
    if (!oldP || !n1) { toast('Please fill in all the fields'); return; }
    if (n1.length < 6) { toast('New password must be at least 6 characters'); return; }
    if (n1 !== n2) { toast('New passwords do not match'); return; }
    if (n1 === oldP) { toast('New password must be different from the current one'); return; }
    if (!navigator.onLine) { toast('Connect to the internet to change your password'); return; }
    el.disabled = true; el.textContent = 'Changing...';
    try {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, oldP));
      await updatePassword(u, n1);
      ['pwOld', 'pwNew', 'pwNew2'].forEach(id => $(id).value = '');
      toast('Password changed successfully');
    } catch (e) {
      const c = e && e.code || '';
      toast(/wrong-password|invalid-credential|invalid-login/.test(c) ? 'Current password is incorrect'
        : /weak-password/.test(c) ? 'New password is too weak'
        : /too-many-requests/.test(c) ? 'Too many attempts - try again in a few minutes'
        : /network/.test(c) ? 'No internet connection'
        : 'Could not change password: ' + (e.message || c), 5000);
    }
    el.disabled = false; el.textContent = 'Change Password';
  },
  'save-print'() { cfg.paper = val('cfgPaper'); cfg.printer = val('cfgPrinter'); cfg.silent = $('cfgSilent').checked; saveCfg(); toast('Printer settings saved'); },
  'test-print'() {
    ACTS['save-print']();
    printOrder({ orderNumber: '#TEST', createdAt: Date.now(), orderType: 'DINE_IN', items: [{ quantity: 1, name: 'Test item', lineTotal: 100 }], subtotal: 100, total: 100, paymentMethod: 'CASH' });
  },
  'save-sound'() { cfg.sound = $('cfgSound').checked; saveCfg(); toast('Saved'); },
  async 'import-menu'(el) {
    if (!confirm(`Import ${MENU_SEED.length} menu items now? This only adds items that don't already exist (matched by name).`)) return;
    el.disabled = true; el.textContent = 'Importing...';
    try {
      const catIds = {};
      let sort = S.categories.length;
      for (const name of [...new Set(MENU_SEED.map(m => m.cat))]) {
        const existing = S.categories.find(c => c.name === name);
        if (existing) { catIds[name] = existing.id; continue; }
        const ref = doc(collection(db, ...path('categories')));
        await wSet(ref, { name, sortOrder: sort++ });
        catIds[name] = ref.id;
      }
      const existingNames = new Set(S.products.map(p => p.name));
      let batch = writeBatch(db), n = 0, added = 0;
      for (const item of MENU_SEED) {
        if (existingNames.has(item.name)) continue;
        const ref = doc(collection(db, ...path('products')));
        batch.set(ref, {
          name: item.name, description: item.description || '', price: item.price, costPrice: 0,
          imageUrl: '', categoryId: catIds[item.cat], sku: '', available: true, featured: !!item.featured,
          taxPercent: 0, variants: item.variants || [], addOns: []
        });
        n++; added++;
        if (n >= 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
      }
      if (n > 0) await batch.commit();
      toast(added > 0 ? `Imported ${added} new items` : 'Everything was already imported');
    } catch (e) { toast('Import failed: ' + e.message, 5000); }
    el.disabled = false; el.textContent = 'Import Full Menu';
  },
  'test-sound'() { const s = cfg.sound; cfg.sound = true; beep(); cfg.sound = s; },
  async logout() { if (confirm('Logout?')) { ackAlerts(); await signOut(auth); } },
  theme(el) { cfg.theme = el.dataset.v; saveCfg(); applyTheme(); }
};

document.addEventListener('click', async e => {
  const back = e.target;
  if (back.id === 'modalBack') { closeModal(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTS[el.dataset.act]; if (!fn) return;
  try { await fn(el, e); } catch (err) { console.error(err); toast('Error: ' + (err.message || err), 5000); }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'pImgFile' && e.target.files[0]) {
    try {
      pendingImg = await resizeImage(e.target.files[0]);
      const i = $('pImgPrev'); i.src = pendingImg; i.style.display = ''; $('pImg').value = '';
    } catch (err) { toast(err.message); }
    return;
  }
  if (e.target.classList.contains('pricein')) {
    try { await wUpd(doc(db, ...path('products', e.target.dataset.id)), { price: parseFloat(e.target.value) || 0 }); toast('Price updated'); }
    catch (err) { toast('Error: ' + err.message); }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !$('loginScreen').classList.contains('hidden')) ACTS.login(); if (e.key === 'Escape') closeModal(); });

const setNet = () => {
  const on = navigator.onLine;
  $('netDot').classList.toggle('on', on);
  $('netText').textContent = on ? 'Online' : 'Offline - working locally';
  $('offlineBanner').classList.toggle('hidden', on);
};
window.addEventListener('online', () => { setNet(); reconcileOfflineOrderNumbers(); });
window.addEventListener('offline', setNet); setNet();
