import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";

// Auto-login from old repo mode:
// This new repo intentionally uses the SAME Firebase Auth project as the old voucher repo
// so staff who already signed in there can be recognized here automatically.
const firebaseConfig = {
  apiKey: "AIzaSyDNx5D-SB2VWa4LkksfJKKeF82h3ReMMUk",
  authDomain: "aroonsawat-ca537.firebaseapp.com",
  projectId: "aroonsawat-ca537",
  storageBucket: "aroonsawat-ca537.firebasestorage.app",
  messagingSenderId: "1057556602457",
  appId: "1:1057556602457:web:12de6d54262bad08219b48",
  measurementId: "G-HPY5CG3SBB"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Analytics not initialized in this environment.", e);
}

export const appConfig = {
  backToFreeVoucherUrl: "https://wuttichaikoji-oss.github.io/Laya-Voucher/",
  saleCardRepoUrl: "https://wuttichaikoji-oss.github.io/Laya-Sales-Voucher/",
  appName: "Laya Sales Voucher v6",
  companyName: "LAYA RESORT HOTEL"
};

export const saleCardCollections = {
  cards: "sale_cards",
  transactions: "sale_card_transactions",
  settings: "sale_settings"
};

export const legacyCollections = {
  users: "users",
  employeeLoginIndex: "employee_login_index"
};

export { db, auth, analytics };
