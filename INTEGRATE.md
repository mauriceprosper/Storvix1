# Storvix Module 3 — Integration Guide

## Files in this package
- `admin.html`          → Full admin panel (drop into project root)
- `analytics-tab.html` → Analytics tab to add into dashboard.html
- `email-functions.js` → Resend email functions to add into functions/index.js

---

## 1. Admin Panel

Drop `admin.html` into your project root alongside the other HTML files.

Access it at: `storvix1.vercel.app/admin.html`

The admin panel is locked to your email address (Mauriceprosper1@gmail.com).
Anyone else who tries to open it sees "Admin access only".

**What it does:**
- Platform overview: total sellers, GMV, order count, pending payouts
- 30-day revenue bar chart across all sellers
- Full sellers table with search — view store, suspend/reactivate
- All orders across every seller with status filter
- Withdrawals queue with one-click "Process" button
- Webhook URL copy for Paystack setup

**Firestore rules update needed** — add this to firestore.rules so the admin
can read all sellers and orders (collectionGroup queries):

```
// Allow admin to read everything
// Add at the bottom of your firestore.rules file:
match /{document=**} {
  allow read: if request.auth != null
    && request.auth.token.email == "Mauriceprosper1@gmail.com";
}
```

---

## 2. Analytics Tab (add to dashboard.html)

### Step 1 — Add Chart.js to dashboard.html <head>:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

### Step 2 — Add nav item to sidebar (after Products):
```html
<button class="nav-item" onclick="showTab('analytics', this)">
  <span class="icon">📈</span> Analytics
</button>
```

### Step 3 — Add 'analytics' to showTab titles map:
```javascript
const titles = {
  overview:'Overview', orders:'Orders', products:'Products',
  wallet:'Wallet', settings:'Store Settings', analytics:'Analytics'  // ← add this
};
```

### Step 4 — Copy the CSS from analytics-tab.html
Copy everything between `<!-- ── ANALYTICS CSS -->` and the closing `</style>`
and paste it into the `<style>` block in dashboard.html.

### Step 5 — Copy the HTML from analytics-tab.html
Copy the `<div class="tab-content" id="tab-analytics">` block
and paste it alongside the other tab-content divs in dashboard.html.

### Step 6 — Copy the JS from analytics-tab.html
Copy everything inside the `<script type="text/analytics-module">` block
and paste it inside the existing `<script type="module">` in dashboard.html.

---

## 3. Resend Emails (add to functions/index.js)

### Step 1 — Set the Resend API key secret:
```bash
firebase functions:secrets:set RESEND_API_KEY
# paste: re_hH21MD7D_AQxg6HjgT2mKxiMd5thZpwg2
```

### Step 2 — Paste email-functions.js into functions/index.js
Append the entire contents of `email-functions.js` to the end of `functions/index.js`.

### Step 3 — Wire up the triggers in functions/index.js

In `handleChargeSuccess()`, after the WhatsApp sends, add:
```javascript
await sendOrderConfirmationEmail(order, seller, amount);
```

In `handleTransferSuccess()`, after the WhatsApp send, add:
```javascript
await sendPayoutEmail(seller, w.amount, w.netAmount, w.bankDetails);
```

### Step 4 — Redeploy functions:
```bash
firebase deploy --only functions
```

### Step 5 — Verify your domain on Resend (optional but recommended):
- Go to resend.com → Domains → Add Domain
- Enter: storvix1.vercel.app (or your custom domain when you have it)
- Add the DNS TXT records it gives you
- Until verified, emails send from onboarding@resend.dev — still works

---

## Deploy order
1. Update firestore.rules → publish in Firebase Console
2. Add admin.html to project → push to GitHub → Vercel redeploys
3. Append email-functions.js to functions/index.js
4. Set RESEND_API_KEY secret
5. Deploy functions: `firebase deploy --only functions`
6. Integrate analytics tab into dashboard.html → push to GitHub

---

## Test checklist
- [ ] admin.html loads and shows your sellers
- [ ] Platform GMV chart shows order data
- [ ] Withdrawal queue shows pending requests
- [ ] "Process" button marks withdrawal as processing
- [ ] Analytics tab shows in seller dashboard
- [ ] Revenue chart renders with real order data
- [ ] Order confirmation email arrives after test payment
- [ ] Payout email arrives after withdrawal is processed
