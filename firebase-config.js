// ─────────────────────────────────────────
//  STORVIX — Firebase Config & Shared Utils
// ─────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
         signOut, sendPasswordResetEmail }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, addDoc,
         collection, query, where, orderBy, onSnapshot, getDocs,
         serverTimestamp, increment, runTransaction }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBFAI1Ga5SMJ9_fFPaWW-9HNFvwyhE8JSg",
  authDomain:        "storvix-95bc8.firebaseapp.com",
  projectId:         "storvix-95bc8",
  storageBucket:     "storvix-95bc8.firebasestorage.app",
  messagingSenderId: "217953091611",
  appId:             "1:217953091611:web:4fbc78c16227600e9bb8be"
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// ── Auth helpers ───────────────────────────────────────
async function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
async function googleSignIn() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}
async function logOut() {
  return signOut(auth);
}
async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// ── Firestore helpers ──────────────────────────────────
async function createSeller(uid, data) {
  await setDoc(doc(db, "sellers", uid), {
    ...data, createdAt: serverTimestamp(), status: "active",
    wallet: { balance: 0, totalEarned: 0, totalWithdrawn: 0 }
  });
}
async function getSeller(uid) {
  const snap = await getDoc(doc(db, "sellers", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
async function getSellerBySlug(slug) {
  const q = query(collection(db, "sellers"), where("slug", "==", slug));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function updateSeller(uid, data) {
  await updateDoc(doc(db, "sellers", uid), data);
}
async function checkSlugAvailable(slug) {
  const q = query(collection(db, "sellers"), where("slug", "==", slug));
  const snap = await getDocs(q);
  return snap.empty;
}

// Products
async function addProduct(sellerId, data) {
  return addDoc(collection(db, "sellers", sellerId, "products"), {
    ...data, createdAt: serverTimestamp(), active: true
  });
}
async function getProducts(sellerId) {
  const q = query(collection(db, "sellers", sellerId, "products"),
    where("active", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function updateProduct(sellerId, productId, data) {
  await updateDoc(doc(db, "sellers", sellerId, "products", productId), data);
}

// Orders
async function createOrder(sellerId, data) {
  const orderNum = await generateOrderNumber(sellerId);
  return addDoc(collection(db, "sellers", sellerId, "orders"), {
    ...data, orderNumber: orderNum,
    status: "confirmed", createdAt: serverTimestamp()
  });
}
async function generateOrderNumber(sellerId) {
  const short = sellerId.slice(0, 4).toUpperCase();
  const num = Math.floor(1000 + Math.random() * 9000);
  return `STX-${short}-${num}`;
}
function listenOrders(sellerId, callback) {
  const q = query(collection(db, "sellers", sellerId, "orders"),
    orderBy("createdAt", "desc"));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
async function updateOrderStatus(sellerId, orderId, status) {
  await updateDoc(doc(db, "sellers", sellerId, "orders", orderId), {
    status, updatedAt: serverTimestamp()
  });
}

// Wallet
async function creditWallet(sellerId, amount) {
  await updateDoc(doc(db, "sellers", sellerId), {
    "wallet.balance":      increment(amount),
    "wallet.totalEarned":  increment(amount)
  });
}
async function requestWithdrawal(sellerId, amount, bankDetails) {
  const seller = await getSeller(sellerId);
  if (seller.wallet.balance < amount) throw new Error("Insufficient balance");
  if (amount < 5000) throw new Error("Minimum withdrawal is ₦5,000");
  await runTransaction(db, async tx => {
    tx.update(doc(db, "sellers", sellerId), {
      "wallet.balance":        increment(-amount),
      "wallet.totalWithdrawn": increment(amount)
    });
    tx.set(doc(collection(db, "withdrawals")), {
      sellerId, amount, bankDetails,
      fee: 100, netAmount: amount - 100,
      status: "pending", requestedAt: serverTimestamp()
    });
  });
}

// Storage
async function uploadImage(sellerId, file, path) {
  const r = ref(storage, `sellers/${sellerId}/${path}/${Date.now()}_${file.name}`);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

// ── Utilities ──────────────────────────────────────────
function fmt(n) {
  return "₦" + Number(n || 0).toLocaleString("en-NG");
}
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
}
function storeUrl(slug) {
  const base = window.location.origin;
  return `${base}/store.html?s=${slug}`;
}
function requireAuth(redirectTo = "auth.html") {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      if (user) resolve(user);
      else { window.location.href = redirectTo; reject(); }
    });
  });
}
function toast(msg, type = "info") {
  let t = document.getElementById("_toast");
  if (!t) {
    t = document.createElement("div"); t.id = "_toast";
    t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);
      background:#0E0E0E;color:#fff;padding:12px 24px;border-radius:99px;font-size:14px;
      font-family:'DM Sans',sans-serif;font-weight:500;z-index:9999;
      transition:transform 0.3s;white-space:nowrap;box-shadow:0 8px 32px rgba(0,0,0,0.2)`;
    document.body.appendChild(t);
  }
  const colors = { error: "#dc2626", success: "#16a34a", info: "#0E0E0E" };
  t.style.background = colors[type] || colors.info;
  t.textContent = msg;
  t.style.transform = "translateX(-50%) translateY(0)";
  setTimeout(() => { t.style.transform = "translateX(-50%) translateY(100px)"; }, 3000);
}

export {
  auth, db, storage, onAuthStateChanged,
  signUp, signIn, googleSignIn, logOut, resetPassword,
  createSeller, getSeller, getSellerBySlug, updateSeller, checkSlugAvailable,
  addProduct, getProducts, updateProduct,
  createOrder, listenOrders, updateOrderStatus,
  creditWallet, requestWithdrawal,
  uploadImage,
  fmt, slugify, storeUrl, requireAuth, toast, serverTimestamp
};
