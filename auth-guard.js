import { auth, db, appConfig, legacyCollections } from "./firebase-config.js";
import { getSettings } from "./app.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const PERMISSIONS = {
  staff: ["scan", "balance", "search", "detail"],
  fb_staff: ["scan", "balance", "search", "detail"],
  supervisor: ["home", "dashboard", "scan", "balance", "search", "detail", "transactions"],
  manager: ["home", "dashboard", "scan", "balance", "search", "detail", "transactions", "create", "sell", "settings", "print"],
  admin: ["home", "dashboard", "scan", "balance", "search", "detail", "transactions", "create", "sell", "settings", "users", "print"]
};

const PAGE_FEATURES = {
  'index.html': 'home',
  'dashboard.html': 'dashboard',
  'create-card.html': 'create',
  'sell-card.html': 'sell',
  'scan-deduct.html': 'scan',
  'check-balance.html': 'balance',
  'search-card.html': 'search',
  'card-detail.html': 'detail',
  'transactions.html': 'transactions',
  'settings.html': 'settings',
  'admin-users.html': 'users',
  'print-card-template.html': 'print'
};

export function roleCan(role, feature) {
  return (PERMISSIONS[role] || []).includes(feature);
}

export function getHomeByRole(profile) {
  const role = profile?.role;
  if (!role) return "login.html";
  if (roleCan(role, 'home')) return 'index.html';
  if (roleCan(role, 'scan')) return 'scan-deduct.html';
  if (roleCan(role, 'balance')) return 'check-balance.html';
  return 'login.html';
}

async function fetchProfile(user) {
  const snap = await getDoc(doc(db, legacyCollections.users, user.uid));
  if (!snap.exists()) throw new Error("ไม่พบบัญชีพนักงานในระบบ");
  const profile = snap.data();
  if (!profile.active) throw new Error("บัญชีนี้ถูกปิดการใช้งาน");
  return profile;
}

export async function getAuthContext() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) {
        resolve(null);
        return;
      }
      try {
        const profile = await fetchProfile(user);
        resolve({ user, profile });
      } catch (err) {
        reject(err);
      }
    }, reject);
  });
}

export async function requireRole(allowedRoles = []) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      location.href = "login.html";
      return null;
    }
    if (allowedRoles.length && !allowedRoles.includes(ctx.profile.role)) {
      alert("คุณไม่มีสิทธิ์เข้าหน้านี้");
      location.href = getHomeByRole(ctx.profile);
      return null;
    }
    return ctx;
  } catch (err) {
    alert(err.message || "ตรวจสอบสิทธิ์ไม่สำเร็จ");
    try { await signOut(auth); } catch {}
    location.href = "login.html";
    return null;
  }
}

export async function mountShell(activePage, pageTitle, pageDesc) {
  const ctx = await requireRole([]);
  if (!ctx) return null;
  const { profile } = ctx;
  const requiredFeature = PAGE_FEATURES[activePage];
  if (requiredFeature && !roleCan(profile.role, requiredFeature)) {
    alert('คุณไม่มีสิทธิ์เข้าหน้านี้');
    location.href = getHomeByRole(profile);
    return null;
  }
  const app = document.getElementById("app");
  if (!app) return ctx;

  const links = [
    ["index.html", "Home", "home"],
    ["dashboard.html", "Dashboard", "dashboard"],
    ["create-card.html", "Create Card", "create"],
    ["sell-card.html", "Sell Card", "sell"],
    ["scan-deduct.html", "Scan / Deduct", "scan"],
    ["check-balance.html", "Check Balance", "balance"],
    ["search-card.html", "Search Card", "search"],
    ["transactions.html", "Transactions", "transactions"],
    ["settings.html", "Settings", "settings"],
    ["admin-users.html", "Users", "users"]
  ].filter(([, , feature]) => roleCan(profile.role, feature));

  const profileName = profile?.name || profile?.employee_id || ctx.user?.email || "User";
  const profileRole = (profile?.role || "staff").toUpperCase();

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar compact-topbar">
        <div class="brand">
          <div class="brand-mark">SV</div>
          <div>
            <h1>${appConfig.appName}</h1>
            <small>${pageTitle || "Stored Value Card System"}</small>
          </div>
        </div>
        <div class="user-strip user-strip-compact">
          <span class="badge success">${profileRole}</span>
          <span class="badge">${profileName}</span>
          <button class="btn secondary" id="backToOldSystem" type="button">Free Voucher</button>
          <button class="btn secondary" id="logoutBtn" type="button">Logout</button>
        </div>
      </header>
      <nav class="navbar navbar-scroll">
        ${links.map(([href, label]) => `<a href="${href}" class="${activePage===href ? "active" : ""}">${label}</a>`).join("")}
      </nav>
      <main class="page">
        <section class="hero hero-compact">
          <div>
            <h2>${pageTitle}</h2>
            <p>${pageDesc || ""}</p>
          </div>
        </section>
        <div id="pageContent"></div>
      </main>
    </div>`;

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "login.html";
  });
  let freeVoucherUrl = appConfig.backToFreeVoucherUrl;
  try {
    const settings = await getSettings();
    if (settings?.freeVoucherUrl) freeVoucherUrl = settings.freeVoucherUrl;
  } catch {}
  document.getElementById("backToOldSystem")?.addEventListener("click", () => {
    window.open(freeVoucherUrl, "_blank", "noopener,noreferrer");
  });

  return ctx;
}
