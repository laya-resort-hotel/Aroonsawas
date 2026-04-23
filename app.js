import { db, saleCardCollections, legacyCollections, appConfig } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const DEFAULT_SETTINGS = {
  companyName: appConfig.companyName,
  currency: "THB",
  outlets: ["Aroonsawat", "Starbucks Counter", "Lobby Lounge"],
  defaultValidityDays: 180,
  freeVoucherUrl: appConfig.backToFreeVoucherUrl,
  saleCardRepoUrl: appConfig.saleCardRepoUrl
};

function tsValue(v) {
  if (!v) return 0;
  if (typeof v === "string") {
    const d = Date.parse(v);
    return Number.isNaN(d) ? 0 : d;
  }
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (v?.toDate) return v.toDate().getTime();
  return 0;
}

function safeString(v) {
  return String(v ?? "").trim();
}

export function formatMoney(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Number(v || 0));
}

export function escapeHtml(v = "") {
  return String(v).replace(/[&<>\"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));
}

export function getStatusClass(status) {
  return `status-pill status-${status || "draft"}`;
}

export function toDateValue(input) {
  if (!input) return "";
  if (typeof input === "string") return input.slice(0, 10);
  if (input?.toDate) return input.toDate().toISOString().slice(0, 10);
  return "";
}

export function toDateTimeText(input) {
  if (!input) return "-";
  if (typeof input === "string") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
  }
  if (input?.toDate) return input.toDate().toLocaleString();
  return "-";
}

export function todayBusinessDate() {
  return new Date().toISOString().slice(0, 10);
}

export function parseCardCode(raw = "") {
  const value = safeString(raw);
  if (!value) return "";
  try {
    const url = new URL(value);
    return safeString(url.searchParams.get("code") || url.searchParams.get("card") || url.pathname.split("/").filter(Boolean).pop() || value);
  } catch {
    return value.replace(/^card:/i, "").trim();
  }
}

function cardFromSnap(snap) {
  return { id: snap.id, ...snap.data() };
}
function txnFromSnap(snap) {
  return { id: snap.id, ...snap.data() };
}

function matchesDateRange(dateValue, fromDate, toDate) {
  const d = safeString(dateValue).slice(0, 10);
  if (!d) return false;
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}


export function getCardBatchInfo(cardOrCode) {
  const raw = typeof cardOrCode === "string" ? cardOrCode : (cardOrCode?.card_code || "");
  const code = parseCardCode(raw);
  const m = code.match(/^SV(\d+)-B([A-Z0-9]{1,4})-(\d{1,})$/i);
  if (!m) return null;
  const faceValue = Number(m[1] || 0);
  const batchNo = String(m[2] || '').toUpperCase();
  const runningNo = Number(m[3] || 0);
  return {
    code,
    faceValue,
    batchNo,
    runningNo,
    batchKey: `SV${faceValue}-B${batchNo}`,
    serialKey: `SV${faceValue}-B${batchNo}-${String(runningNo).padStart(4, '0')}`
  };
}

export function inferVoucherPackage(card = {}) {
  const sold = Number(card?.sold_price || 0);
  const face = Number(card?.face_value || 0);
  if (sold === 500 || face === 600) {
    return {
      purchaseAmount: 500,
      voucherValue: 600,
      shortLabel: '500→600',
      fullLabel: 'Buy THB 500 = THB 600',
      frontAsset: 'assets/voucher-value/front-500.png'
    };
  }
  if (sold === 1000 || face === 1200) {
    return {
      purchaseAmount: 1000,
      voucherValue: 1200,
      shortLabel: '1000→1200',
      fullLabel: 'Buy THB 1,000 = THB 1,200',
      frontAsset: 'assets/voucher-value/front-1000.png'
    };
  }
  const purchaseAmount = sold > 0 ? sold : face;
  const voucherValue = face > 0 ? face : sold;
  return {
    purchaseAmount,
    voucherValue,
    shortLabel: purchaseAmount && voucherValue ? `${purchaseAmount}→${voucherValue}` : 'Custom',
    fullLabel: purchaseAmount && voucherValue ? `Buy THB ${new Intl.NumberFormat('en-US').format(purchaseAmount)} = THB ${new Intl.NumberFormat('en-US').format(voucherValue)}` : 'Custom',
    frontAsset: ''
  };
}

export async function listCardsByBatch(seed) {
  const batch = getCardBatchInfo(seed);
  if (!batch?.batchKey) return [];
  const rows = await listCards({});
  return rows
    .filter(row => getCardBatchInfo(row)?.batchKey === batch.batchKey)
    .sort((a, b) => (getCardBatchInfo(a)?.runningNo || 0) - (getCardBatchInfo(b)?.runningNo || 0));
}

export async function getSettings() {
  const ref = doc(db, saleCardCollections.settings, "app");
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...snap.data() };
}

export async function saveSettings(data) {
  const ref = doc(db, saleCardCollections.settings, "app");
  await setDoc(ref, {
    companyName: data.companyName,
    currency: data.currency || "THB",
    outlets: Array.isArray(data.outlets) ? data.outlets.filter(Boolean) : DEFAULT_SETTINGS.outlets,
    defaultValidityDays: Number(data.defaultValidityDays || 180),
    freeVoucherUrl: data.freeVoucherUrl || appConfig.backToFreeVoucherUrl,
    saleCardRepoUrl: data.saleCardRepoUrl || appConfig.saleCardRepoUrl,
    updated_at: serverTimestamp()
  }, { merge: true });
}

export async function listCards(filters = {}) {
  const snap = await getDocs(collection(db, saleCardCollections.cards));
  let rows = snap.docs.map(cardFromSnap).sort((a, b) => tsValue(b.updated_at || b.created_at) - tsValue(a.updated_at || a.created_at));
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    rows = rows.filter(c => [c.card_code, c.card_label, c.card_serial, c.notes].join(" ").toLowerCase().includes(needle));
  }
  if (filters.status) rows = rows.filter(c => c.status === filters.status);
  if (filters.outlet) rows = rows.filter(c => String(c.outlet_scope || "").toLowerCase().includes(String(filters.outlet).toLowerCase()));
  return rows;
}

export async function getCardById(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, saleCardCollections.cards, id));
  return snap.exists() ? cardFromSnap(snap) : null;
}

export async function getCardByCode(code) {
  const trimmed = parseCardCode(code);
  if (!trimmed) return null;
  const cardsSnap = await getDocs(collection(db, saleCardCollections.cards));
  const rows = cardsSnap.docs.map(cardFromSnap);
  return rows.find(c => [c.card_code, c.card_label, c.card_serial].map(parseCardCode).includes(trimmed)) || null;
}

export async function createCard(data, actor) {
  const code = parseCardCode(data.card_code);
  if (!code) throw new Error("Card code is required.");
  const existing = await getCardByCode(code);
  if (existing) throw new Error("Card code already exists.");
  const faceValue = Number(data.face_value);
  const soldPrice = Number(data.sold_price);
  if (!(faceValue > 0)) throw new Error("Face value must be more than 0.");
  if (!(soldPrice > 0)) throw new Error("Sold price must be more than 0.");
  const actorName = actor.profile?.name || actor.profile?.employee_id || actor.user.email || "User";
  const payload = {
    card_code: code,
    card_label: safeString(data.card_label),
    card_serial: safeString(data.card_serial),
    face_value: faceValue,
    sold_price: soldPrice,
    remaining_balance: 0,
    currency: "THB",
    status: "draft",
    outlet_scope: data.outlet_scope || "Aroonsawat",
    valid_until: data.valid_until || "",
    notes: safeString(data.notes),
    created_by_uid: actor.user.uid,
    created_by_name: actorName,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };
  const ref = await addDoc(collection(db, saleCardCollections.cards), payload);
  return { id: ref.id, ...payload, created_at: null, updated_at: null };
}

export async function activateAndSell(cardId, soldPrice, outlet, note, actor) {
  const cardRef = doc(db, saleCardCollections.cards, cardId);
  const txnsRef = collection(db, saleCardCollections.transactions);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists()) throw new Error("Card not found.");
    const card = snap.data();
    if (card.status !== "draft") throw new Error("Only draft cards can be sold.");
    const actualSoldPrice = Number(soldPrice || card.sold_price || 0);
    if (!(actualSoldPrice > 0)) throw new Error("Sold price must be more than 0.");
    const actorName = actor.profile?.name || actor.profile?.employee_id || actor.user.email || "User";
    tx.update(cardRef, {
      sold_price: actualSoldPrice,
      remaining_balance: Number(card.face_value),
      status: "active",
      sold_at: serverTimestamp(),
      sold_by_uid: actor.user.uid,
      sold_by_name: actorName,
      updated_at: serverTimestamp()
    });
    const txnRef = doc(txnsRef);
    tx.set(txnRef, {
      card_id: snap.id,
      card_code: card.card_code,
      txn_type: "sale",
      amount: actualSoldPrice,
      balance_before: 0,
      balance_after: Number(card.face_value),
      outlet: outlet || card.outlet_scope || "Aroonsawat",
      staff_uid: actor.user.uid,
      staff_name: actorName,
      business_date: todayBusinessDate(),
      note: note || "Card sold",
      created_at: serverTimestamp(),
      voided: false
    });
    return { id: snap.id, ...card, sold_price: actualSoldPrice, remaining_balance: Number(card.face_value), status: "active" };
  });
}

export function isExpiredCard(card) {
  if (!card?.valid_until) return false;
  const today = todayBusinessDate();
  return String(card.valid_until).slice(0, 10) < today;
}

export async function deductBalance(cardId, amount, outlet, note, actor) {
  const cardRef = doc(db, saleCardCollections.cards, cardId);
  const txnsRef = collection(db, saleCardCollections.transactions);
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error("Amount must be more than 0.");
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists()) throw new Error("Card not found.");
    const card = snap.data();
    if (card.status !== "active") throw new Error("Only active cards can be deducted.");
    if (isExpiredCard(card)) throw new Error("This card has expired.");
    const before = Number(card.remaining_balance || 0);
    if (amt > before) throw new Error("Insufficient balance.");
    const after = before - amt;
    const actorName = actor.profile?.name || actor.profile?.employee_id || actor.user.email || "User";
    const patch = {
      remaining_balance: after,
      last_used_at: serverTimestamp(),
      last_used_by_uid: actor.user.uid,
      last_used_by_name: actorName,
      updated_at: serverTimestamp()
    };
    if (after === 0) patch.status = "empty";
    tx.update(cardRef, patch);
    const txnRef = doc(txnsRef);
    tx.set(txnRef, {
      card_id: snap.id,
      card_code: card.card_code,
      txn_type: "debit",
      amount: amt,
      balance_before: before,
      balance_after: after,
      outlet: outlet || card.outlet_scope || "Aroonsawat",
      staff_uid: actor.user.uid,
      staff_name: actorName,
      business_date: todayBusinessDate(),
      note: note || "Deduct balance",
      created_at: serverTimestamp(),
      voided: false
    });
    return { before, after, amount: amt, card: { id: snap.id, ...card, ...patch } };
  });
}

export async function adjustBalance(cardId, delta, note, actor) {
  const amt = Number(delta);
  if (!amt) throw new Error("Adjustment amount must not be 0.");
  const cardRef = doc(db, saleCardCollections.cards, cardId);
  const txnsRef = collection(db, saleCardCollections.transactions);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists()) throw new Error("Card not found.");
    const card = snap.data();
    if (["void", "expired"].includes(card.status)) throw new Error("This card cannot be adjusted.");
    const before = Number(card.remaining_balance || 0);
    const after = before + amt;
    if (after < 0) throw new Error("Adjustment would make balance negative.");
    const actorName = actor.profile?.name || actor.profile?.employee_id || actor.user.email || "User";
    const nextStatus = after === 0 ? "empty" : (card.status === "disabled" ? "disabled" : "active");
    tx.update(cardRef, {
      remaining_balance: after,
      status: nextStatus,
      last_used_at: serverTimestamp(),
      last_used_by_uid: actor.user.uid,
      last_used_by_name: actorName,
      updated_at: serverTimestamp()
    });
    const txnRef = doc(txnsRef);
    tx.set(txnRef, {
      card_id: snap.id,
      card_code: card.card_code,
      txn_type: amt > 0 ? "adjustment_plus" : "adjustment_minus",
      amount: Math.abs(amt),
      balance_before: before,
      balance_after: after,
      outlet: card.outlet_scope || "Aroonsawat",
      staff_uid: actor.user.uid,
      staff_name: actorName,
      business_date: todayBusinessDate(),
      note: note || (amt > 0 ? "Balance increased" : "Balance decreased"),
      created_at: serverTimestamp(),
      voided: false
    });
    return { before, after, amount: amt };
  });
}

export async function updateCardStatus(cardId, status, actor, note = "") {
  const ref = doc(db, saleCardCollections.cards, cardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Card not found.");
  const card = snap.data();
  const patch = { status, updated_at: serverTimestamp() };
  if (status === "active" && Number(card.remaining_balance || 0) <= 0) throw new Error("Cannot enable a card with zero balance. Use adjustment first.");
  await updateDoc(ref, patch);
  await addDoc(collection(db, saleCardCollections.transactions), {
    card_id: snap.id,
    card_code: card.card_code,
    txn_type: status === "disabled" ? "adjustment_minus" : "adjustment_plus",
    amount: 0,
    balance_before: Number(card.remaining_balance || 0),
    balance_after: Number(card.remaining_balance || 0),
    outlet: card.outlet_scope || "Aroonsawat",
    staff_uid: actor.user.uid,
    staff_name: actor.profile?.name || actor.profile?.employee_id || actor.user.email || "User",
    business_date: todayBusinessDate(),
    note: note || (status === "disabled" ? "Card disabled" : "Card enabled"),
    created_at: serverTimestamp(),
    voided: false
  });
}

export async function listTransactions(filters = {}) {
  const snap = await getDocs(collection(db, saleCardCollections.transactions));
  let rows = snap.docs.map(txnFromSnap).sort((a, b) => tsValue(b.created_at) - tsValue(a.created_at));
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    rows = rows.filter(t => [t.card_code, t.staff_name, t.outlet, t.note, t.txn_type].join(" ").toLowerCase().includes(needle));
  }
  if (filters.cardId) rows = rows.filter(t => t.card_id === filters.cardId);
  if (filters.outlet) rows = rows.filter(t => String(t.outlet || "").toLowerCase().includes(String(filters.outlet).toLowerCase()));
  if (filters.type) rows = rows.filter(t => t.txn_type === filters.type);
  if (filters.staff) rows = rows.filter(t => String(t.staff_name || "").toLowerCase().includes(String(filters.staff).toLowerCase()));
  if (filters.fromDate || filters.toDate) rows = rows.filter(t => matchesDateRange(t.business_date || toDateValue(t.created_at), filters.fromDate, filters.toDate));
  if (filters.onlyActiveVoidable) rows = rows.filter(t => t.txn_type === "debit" && !t.voided);
  return rows;
}

export async function getCardTransactions(cardId) {
  return listTransactions({ cardId });
}

export async function voidDebitTransaction(txnId, actor, note = "") {
  const txnRef = doc(db, saleCardCollections.transactions, txnId);
  const txnsRef = collection(db, saleCardCollections.transactions);
  return runTransaction(db, async (tx) => {
    const txnSnap = await tx.get(txnRef);
    if (!txnSnap.exists()) throw new Error("Transaction not found.");
    const txn = txnSnap.data();
    if (txn.txn_type !== "debit") throw new Error("Only debit transactions can be voided.");
    if (txn.voided) throw new Error("This transaction has already been voided.");
    const cardRef = doc(db, saleCardCollections.cards, txn.card_id);
    const cardSnap = await tx.get(cardRef);
    if (!cardSnap.exists()) throw new Error("Card not found.");
    const card = cardSnap.data();
    const before = Number(card.remaining_balance || 0);
    const after = before + Number(txn.amount || 0);
    const actorName = actor.profile?.name || actor.profile?.employee_id || actor.user.email || "User";
    tx.update(cardRef, {
      remaining_balance: after,
      status: after > 0 && card.status === "empty" ? "active" : card.status,
      updated_at: serverTimestamp(),
      last_used_at: serverTimestamp(),
      last_used_by_uid: actor.user.uid,
      last_used_by_name: actorName
    });
    tx.update(txnRef, {
      voided: true,
      voided_at: serverTimestamp(),
      voided_by_uid: actor.user.uid,
      voided_by_name: actorName
    });
    const reversalRef = doc(txnsRef);
    tx.set(reversalRef, {
      card_id: txn.card_id,
      card_code: txn.card_code,
      txn_type: "void_debit",
      amount: Number(txn.amount || 0),
      balance_before: before,
      balance_after: after,
      outlet: txn.outlet || card.outlet_scope || "Aroonsawat",
      staff_uid: actor.user.uid,
      staff_name: actorName,
      business_date: todayBusinessDate(),
      note: note || `Void debit ${txn.id}`,
      created_at: serverTimestamp(),
      voided: false,
      void_ref_txn_id: txnId
    });
    return { before, after, amount: Number(txn.amount || 0) };
  });
}

export async function dashboardData(filters = {}) {
  const cards = await listCards({});
  const txns = await listTransactions({ fromDate: filters.fromDate, toDate: filters.toDate, outlet: filters.outlet });
  const today = todayBusinessDate();
  const fromDate = filters.fromDate || today;
  const toDate = filters.toDate || today;
  const inRange = txns.filter(t => matchesDateRange(t.business_date || toDateValue(t.created_at), fromDate, toDate));
  const salesRows = inRange.filter(t => t.txn_type === "sale");
  const debitRows = inRange.filter(t => t.txn_type === "debit");

  const scopedCards = filters.outlet ? cards.filter(c => String(c.outlet_scope || "").toLowerCase().includes(String(filters.outlet).toLowerCase())) : cards;
  const stats = {
    salesToday: salesRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    cardsSoldToday: salesRows.length,
    redeemedToday: debitRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    outstanding: scopedCards.filter(c => ["active", "disabled"].includes(c.status)).reduce((sum, row) => sum + Number(row.remaining_balance || 0), 0),
    activeCards: scopedCards.filter(c => c.status === "active").length,
    emptyCards: scopedCards.filter(c => c.status === "empty").length,
    draftCards: scopedCards.filter(c => c.status === "draft").length,
    disabledCards: scopedCards.filter(c => c.status === "disabled").length
  };

  const byOutlet = Object.entries(debitRows.reduce((acc, row) => {
    const key = row.outlet || "Unspecified";
    acc[key] = (acc[key] || 0) + Number(row.amount || 0);
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const byStaff = Object.entries(debitRows.reduce((acc, row) => {
    const key = row.staff_name || "Unknown";
    acc[key] = (acc[key] || 0) + Number(row.amount || 0);
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const recentTransactions = inRange.slice(0, 12);
  const lowBalanceCards = scopedCards.filter(c => Number(c.remaining_balance || 0) > 0 && Number(c.remaining_balance || 0) <= 100).sort((a, b) => Number(a.remaining_balance || 0) - Number(b.remaining_balance || 0));
  const nearExpiryCards = scopedCards.filter(c => c.valid_until).sort((a, b) => String(a.valid_until).localeCompare(String(b.valid_until))).slice(0, 10);
  const recentlyEmptied = scopedCards.filter(c => c.status === "empty").sort((a, b) => tsValue(b.last_used_at) - tsValue(a.last_used_at)).slice(0, 10);

  const trendDays = [];
  const end = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayRows = txns.filter(t => matchesDateRange(t.business_date || toDateValue(t.created_at), key, key));
    trendDays.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sales: dayRows.filter(t => t.txn_type === "sale").reduce((sum, row) => sum + Number(row.amount || 0), 0),
      debit: dayRows.filter(t => t.txn_type === "debit").reduce((sum, row) => sum + Number(row.amount || 0), 0)
    });
  }

  return { cards: scopedCards, txns: inRange, stats, byOutlet, byStaff, recentTransactions, lowBalanceCards, nearExpiryCards, recentlyEmptied, trendDays, range: { fromDate, toDate } };
}

export async function listUsers() {
  const snap = await getDocs(collection(db, legacyCollections.users));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>String(a.employee_id||"").localeCompare(String(b.employee_id||"")));
}

export async function signInByEmployeeId(employeeId, password) {
  const { auth } = await import("./firebase-config.js");
  const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js");
  const loginRef = doc(db, legacyCollections.employeeLoginIndex, employeeId.trim().toUpperCase());
  const loginSnap = await getDoc(loginRef);
  if (!loginSnap.exists()) throw new Error("ไม่พบรหัสพนักงานนี้ในระบบ");
  const loginIndex = loginSnap.data();
  if (!loginIndex.active) throw new Error("บัญชีนี้ถูกปิดการใช้งาน");
  if (!loginIndex.email) throw new Error("บัญชีนี้ยังไม่ได้ผูกอีเมล");
  await signInWithEmailAndPassword(auth, loginIndex.email, password);
}

const externalScriptCache = new Map();

export function loadScriptOnce(src, checkFn = null) {
  if (checkFn?.()) return Promise.resolve(true);
  if (externalScriptCache.has(src)) return externalScriptCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
  externalScriptCache.set(src, promise);
  return promise;
}

export async function ensureXLSX() {
  if (window.XLSX) return window.XLSX;
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', () => !!window.XLSX);
  if (!window.XLSX) throw new Error('XLSX library not available.');
  return window.XLSX;
}

export async function ensureJsPdf() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', () => !!window.jspdf?.jsPDF);
  if (!window.jspdf?.jsPDF) throw new Error('jsPDF library not available.');
  return window.jspdf.jsPDF;
}

export async function ensureAutoTable() {
  const jsPDF = await ensureJsPdf();
  if (typeof jsPDF.API.autoTable === 'function') return jsPDF;
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', () => typeof window.jspdf?.jsPDF?.API?.autoTable === 'function');
  return window.jspdf.jsPDF;
}

export async function ensureQrCodeLib() {
  if (window.QRCode) return window.QRCode;
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => !!window.QRCode);
  if (!window.QRCode) throw new Error('QR code library not available.');
  return window.QRCode;
}

export async function exportSheetsXlsx(fileName, sheets) {
  const XLSX = await ensureXLSX();
  const wb = XLSX.utils.book_new();
  (sheets || []).forEach((sheet, index) => {
    const name = safeString(sheet?.name) || `Sheet${index + 1}`;
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'No data' }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, fileName || `sales-voucher-${todayBusinessDate()}.xlsx`);
}

export async function exportPdfReport({ fileName, title, subtitle = '', summaryRows = [], tables = [] }) {
  const jsPDF = await ensureAutoTable();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  let cursorY = 42;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title || 'Sales Voucher Report', marginX, cursorY);
  cursorY += 18;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(String(subtitle), marginX, cursorY);
    cursorY += 18;
  }
  if (summaryRows.length) {
    doc.autoTable({
      startY: cursorY,
      theme: 'grid',
      styles: { fontSize: 9 },
      head: [['Metric', 'Value']],
      body: summaryRows.map(r => [String(r[0] ?? ''), String(r[1] ?? '')]),
      margin: { left: marginX, right: marginX }
    });
    cursorY = doc.lastAutoTable.finalY + 18;
  }
  (tables || []).forEach((table, index) => {
    if (cursorY > 700) {
      doc.addPage();
      cursorY = 42;
    }
    if (table?.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(String(table.title), marginX, cursorY);
      cursorY += 10;
    }
    doc.autoTable({
      startY: cursorY + 6,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 4 },
      head: [Array.isArray(table?.head) ? table.head.map(v => String(v)) : []],
      body: Array.isArray(table?.body) ? table.body.map(row => row.map(v => String(v ?? ''))) : [['No data']],
      margin: { left: marginX, right: marginX }
    });
    cursorY = doc.lastAutoTable.finalY + 18;
  });
  doc.save(fileName || `sales-voucher-${todayBusinessDate()}.pdf`);
}
