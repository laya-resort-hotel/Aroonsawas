import { db, saleCardCollections, legacyCollections, appConfig } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  Timestamp,
  deleteField
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

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
  if (typeof input === "string") return new Date(input).toLocaleString();
  if (input?.toDate) return input.toDate().toLocaleString();
  return "-";
}

export function todayBusinessDate() {
  return new Date().toISOString().slice(0, 10);
}

function cardFromSnap(snap) {
  return { id: snap.id, ...snap.data() };
}
function txnFromSnap(snap) {
  return { id: snap.id, ...snap.data() };
}

export async function getSettings() {
  const ref = doc(db, saleCardCollections.settings, "app");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const defaults = {
      companyName: appConfig.companyName,
      currency: "THB",
      outlets: ["Aroonsawat", "Starbucks Counter", "Lobby Lounge"],
      defaultValidityDays: 180,
      freeVoucherUrl: appConfig.backToFreeVoucherUrl,
      saleCardRepoUrl: appConfig.saleCardRepoUrl,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    };
    await setDoc(ref, defaults, { merge: true });
    return { ...defaults, created_at: null, updated_at: null };
  }
  return snap.data();
}

export async function saveSettings(data) {
  const ref = doc(db, saleCardCollections.settings, "app");
  await setDoc(ref, {
    companyName: data.companyName,
    currency: data.currency || "THB",
    outlets: data.outlets || [],
    defaultValidityDays: Number(data.defaultValidityDays || 180),
    freeVoucherUrl: data.freeVoucherUrl || appConfig.backToFreeVoucherUrl,
    saleCardRepoUrl: data.saleCardRepoUrl || appConfig.saleCardRepoUrl,
    updated_at: serverTimestamp()
  }, { merge: true });
}

export async function listCards(filters = {}) {
  const snap = await getDocs(collection(db, saleCardCollections.cards));
  let rows = snap.docs.map(cardFromSnap).sort((a, b) => String(b.created_at?.seconds || b.created_at || "").localeCompare(String(a.created_at?.seconds || a.created_at || "")));
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    rows = rows.filter(c => [c.card_code, c.card_label, c.card_serial, c.notes].join(" ").toLowerCase().includes(needle));
  }
  if (filters.outlet) rows = rows.filter(c => c.outlet_scope === filters.outlet);
  return rows;
}

export async function getCardById(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, saleCardCollections.cards, id));
  return snap.exists() ? cardFromSnap(snap) : null;
}

export async function getCardByCode(code) {
  if (!code) return null;
  const trimmed = code.trim();
  const cardsRef = collection(db, saleCardCollections.cards);
  for (const field of ["card_code", "card_label", "card_serial"]) {
    const snap = await getDocs(query(cardsRef, where(field, "==", trimmed), limit(1)));
    if (!snap.empty) return cardFromSnap(snap.docs[0]);
  }
  return null;
}

export async function createCard(data, actor) {
  const existing = await getCardByCode(data.card_code);
  if (existing) throw new Error("Card code already exists.");
  const payload = {
    card_code: data.card_code.trim(),
    card_label: data.card_label.trim(),
    card_serial: data.card_serial?.trim() || "",
    face_value: Number(data.face_value),
    sold_price: Number(data.sold_price),
    remaining_balance: 0,
    currency: "THB",
    status: "draft",
    outlet_scope: data.outlet_scope || "Aroonsawat",
    valid_until: data.valid_until || "",
    notes: data.notes?.trim() || "",
    created_by_uid: actor.user.uid,
    created_by_name: actor.profile?.name || actor.profile?.employee_id || actor.user.email || "User",
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

export async function updateCardStatus(cardId, status, actor, note = "") {
  const ref = doc(db, saleCardCollections.cards, cardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Card not found.");
  const card = snap.data();
  const patch = { status, updated_at: serverTimestamp() };
  if (status === "active" && Number(card.remaining_balance || 0) <= 0) {
    throw new Error("Cannot enable a card with zero balance. Use adjustment first.");
  }
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
  let rows = snap.docs.map(txnFromSnap).sort((a, b) => String(b.created_at?.seconds || b.created_at || "").localeCompare(String(a.created_at?.seconds || a.created_at || "")));
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    rows = rows.filter(t => [t.card_code, t.staff_name, t.outlet, t.note].join(" ").toLowerCase().includes(needle));
  }
  if (filters.cardId) rows = rows.filter(t => t.card_id === filters.cardId);
  if (filters.outlet) rows = rows.filter(t => t.outlet === filters.outlet);
  return rows;
}

export async function getCardTransactions(cardId) {
  return listTransactions({ cardId });
}

export async function dashboardData() {
  const cards = await listCards({});
  const txns = await listTransactions({});
  const today = todayBusinessDate();

  const salesTodayRows = txns.filter(t => t.txn_type === "sale" && t.business_date === today);
  const debitTodayRows = txns.filter(t => t.txn_type === "debit" && t.business_date === today);

  const stats = {
    salesToday: salesTodayRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    cardsSoldToday: salesTodayRows.length,
    redeemedToday: debitTodayRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    outstanding: cards.filter(c => c.status === "active").reduce((sum, row) => sum + Number(row.remaining_balance || 0), 0),
    activeCards: cards.filter(c => c.status === "active").length,
    emptyCards: cards.filter(c => c.status === "empty").length,
    draftCards: cards.filter(c => c.status === "draft").length,
    disabledCards: cards.filter(c => c.status === "disabled").length
  };

  const byOutlet = Object.entries(debitTodayRows.reduce((acc, row) => {
    acc[row.outlet || "Unspecified"] = (acc[row.outlet || "Unspecified"] || 0) + Number(row.amount || 0);
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const byStaff = Object.entries(debitTodayRows.reduce((acc, row) => {
    acc[row.staff_name || "Unknown"] = (acc[row.staff_name || "Unknown"] || 0) + Number(row.amount || 0);
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const recentTransactions = txns.slice(0, 12);
  const lowBalanceCards = cards.filter(c => Number(c.remaining_balance || 0) > 0 && Number(c.remaining_balance || 0) <= 100).sort((a, b) => Number(a.remaining_balance || 0) - Number(b.remaining_balance || 0));
  const nearExpiryCards = cards.filter(c => c.valid_until).sort((a, b) => String(a.valid_until).localeCompare(String(b.valid_until))).slice(0, 10);
  const recentlyEmptied = cards.filter(c => c.status === "empty").sort((a, b) => String(b.last_used_at || "").localeCompare(String(a.last_used_at || ""))).slice(0, 10);

  const trendDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trendDays.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sales: txns.filter(t => t.txn_type === "sale" && t.business_date === key).reduce((sum, row) => sum + Number(row.amount || 0), 0),
      debit: txns.filter(t => t.txn_type === "debit" && t.business_date === key).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    });
  }

  return { cards, txns, stats, byOutlet, byStaff, recentTransactions, lowBalanceCards, nearExpiryCards, recentlyEmptied, trendDays };
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
