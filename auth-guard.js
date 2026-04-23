import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

function hasAccess(role, allowedRoles = []) {
  return allowedRoles.includes(role);
}

export function getHomeByRole(profile) {
  if (!profile || !profile.role) return "login.html";
  if (profile.role === "staff") return "redeem.html";
  return "dashboard.html";
}

async function logoutAndGoLogin(message = "") {
  if (message) alert(message);
  try { await signOut(auth); } catch {}
  window.location.href = "login.html";
}

export async function requireRole(allowedRoles = []) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "login.html";
        return;
      }
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          await logoutAndGoLogin("ไม่พบบัญชีพนักงานในระบบ");
          return;
        }

        const profile = userSnap.data();

        if (!profile.active) {
          await logoutAndGoLogin("บัญชีนี้ถูกปิดการใช้งาน");
          return;
        }

        if (!hasAccess(profile.role, allowedRoles)) {
          alert("คุณไม่มีสิทธิ์เข้าหน้านี้");
          window.location.href = getHomeByRole(profile);
          return;
        }

        resolve({ user, profile });
      } catch (err) {
        await logoutAndGoLogin("ตรวจสอบสิทธิ์ไม่สำเร็จ: " + err.message);
      }
    });
  });
}

export function renderNav(profile) {
  const nav = document.getElementById("navMenu");
  if (!nav) return;

  const shell = nav.closest(".app-shell");
  if (shell && shell.firstElementChild !== nav) {
    shell.prepend(nav);
  }

  const currentPage = (window.location.pathname.split("/").pop() || "").toLowerCase();
  const salesVoucherUrl = "https://laya-resort-hotel.github.io/Aroonsawas/";
  const makeLink = (href, label) => `<a href="${href}" class="${currentPage === href.toLowerCase() ? "active" : ""}">${label}</a>`;
  const makeExternalLink = (href, label, extraClass = "") => `<a href="${href}" target="_blank" rel="noopener noreferrer" class="${extraClass}" title="Open in a new tab">${label}</a>`;
  const profileName = profile?.name || profile?.employee_id || "User";
  const profileRole = (profile?.role || "staff").toUpperCase();

  if (profile.role === "staff") {
    nav.innerHTML = `
      <div class="nav-row nav-row-staff">
        <div class="nav-left">
          <span class="soft-badge nav-brand">Laya Voucher v5</span>
          <span class="role-badge">${profileRole}</span>
        </div>
        <div class="nav-right">
          ${makeExternalLink(salesVoucherUrl, "For Sales Voucher", "nav-sales-link")}
          <span class="ref">${profileName}</span>
          <button id="logoutBtn" class="nav-btn" type="button">Logout</button>
        </div>
      </div>
    `;
  } else {
    const links = [
      makeLink("dashboard.html", "Dashboard"),
      makeLink("issue.html", "Add Card"),
      makeLink("frontdesk.html", "Card Desk"),
      makeLink("search.html", "Search"),
      makeLink("redeem.html", "Redeem"),
      makeLink("voucher-detail.html", "Card Detail")
    ];

    links.push(makeExternalLink(salesVoucherUrl, "For Sales Voucher", "nav-sales-link"));
    if (profile.role === "admin") links.push(makeLink("admin-users.html", "Users"));

    nav.innerHTML = `
      <div class="nav-row nav-row-admin">
        <div class="nav-left">
          <span class="soft-badge nav-brand">Laya Voucher v5</span>
          <span class="role-badge">${profileRole}</span>
        </div>
        <div class="nav-links nav-links-inline">${links.join("")}</div>
        <div class="nav-right">
          <span class="ref">${profileName}</span>
          <button id="logoutBtn" class="nav-btn" type="button">Logout</button>
        </div>
      </div>
    `;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "login.html";
    });
  }
}
