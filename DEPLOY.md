# Storvix — Module 2: Cloud Functions
# Deploy Guide + Environment Setup

## ── STEP 1: Install Firebase CLI ──────────────────────────
npm install -g firebase-tools
firebase login
firebase use storvix-95bc8


## ── STEP 2: Set Secret Keys (run each line) ───────────────

firebase functions:secrets:set PAYSTACK_SECRET_KEY
# When prompted, paste: sk_test_b60f2f7256c7c6b865a41fc9948ad66d4df919d6
# (Use sk_live_... at launch)

firebase functions:secrets:set TERMII_API_KEY
# When prompted, paste: TLCBZsAnVUQIREWAlaMWoZKMIKNPfqxzAvBJJmYbkuSxaELmjWPsYuiNkVEnjO

firebase functions:secrets:set SHIPBUBBLE_API_KEY
# When prompted, paste: sb_sandbox_659338a12a240c26978de8662a49b9dcdd929e6e007f9f4400dafbbb6da247fa


## ── STEP 3: Install dependencies ─────────────────────────
cd storvix-functions
npm install


## ── STEP 4: Deploy functions ──────────────────────────────
firebase deploy --only functions

# Expected output — 10 functions deployed:
# ✓  paystackWebhook
# ✓  onOrderStatusChange
# ✓  getDeliveryRates
# ✓  createShipment
# ✓  verifyBankAccount
# ✓  processPayout
# ✓  sendNotification
# ✓  getWebhookUrl


## ── STEP 5: Register Paystack Webhook ─────────────────────
Your webhook URL will be:
https://europe-west1-storvix-95bc8.cloudfunctions.net/paystackWebhook

1. Go to paystack.com → Settings → API Keys & Webhooks
2. Paste the URL above in the "Webhook URL" field
3. Enable these events:
   - charge.success
   - transfer.success
   - transfer.failed
4. Save


## ── STEP 6: Register Termii Sender ID ────────────────────
1. Go to termii.com → Settings → Sender ID
2. Request "Storvix" as sender ID
3. Select WhatsApp channel
4. Approval takes 24-72 hours
5. While waiting, Termii will fall back to SMS


## ── STEP 7: Firestore Composite Index ────────────────────
The webhook uses a collectionGroup query on orders.
Firebase will prompt you to create the index the first time
an order is processed. Click the link in the Functions log.

Or create it manually:
Collection group: orders
Fields: paystackRef (Ascending), createdAt (Descending)


## ── STEP 8: Test the full flow ────────────────────────────
1. Open a seller's store: /store.html?s=your-slug
2. Add products to cart
3. Checkout → enter test details
4. Use Paystack test card:
   Card:   4084 0840 8408 4081
   Expiry: 12/99
   CVV:    408
   PIN:    0000
   OTP:    123456

5. After payment:
   → Order appears in seller dashboard
   → Seller wallet credited
   → WhatsApp sent to buyer number
   → WhatsApp sent to seller number
   → Stock decremented
   → Low stock alert if stock ≤ 3


## ── LOCAL TESTING (optional) ──────────────────────────────
Create functions/.env.local with:

PAYSTACK_SECRET_KEY=sk_test_b60f2f7256c7c6b865a41fc9948ad66d4df919d6
TERMII_API_KEY=TLCBZsAnVUQIREWAlaMWoZKMIKNPfqxzAvBJJmYbkuSxaELmjWPsYuiNkVEnjO
SHIPBUBBLE_API_KEY=sb_sandbox_659338a12a240c26978de8662a49b9dcdd929e6e007f9f4400dafbbb6da247fa

Then run: firebase emulators:start


## ── FUNCTIONS OVERVIEW ────────────────────────────────────

| Function             | Trigger           | What it does                            |
|----------------------|-------------------|-----------------------------------------|
| paystackWebhook      | HTTP POST         | Verifies payment, credits wallet, sends WhatsApp |
| onOrderStatusChange  | Firestore update  | Sends buyer WhatsApp on shipped/delivered/cancelled |
| getDeliveryRates     | Callable          | Fetches Shipbubble rates at checkout    |
| createShipment       | Callable          | Books courier pickup, gets tracking link |
| verifyBankAccount    | Callable          | Verifies bank account via Paystack      |
| processPayout        | Callable          | Initiates Paystack Transfer to seller   |
| sendNotification     | Callable          | Sends custom WhatsApp from dashboard    |
| getWebhookUrl        | Callable          | Returns the webhook URL to register     |


## ── WHAT TRIGGERS WHAT ────────────────────────────────────

Buyer pays
  → Paystack fires charge.success webhook
    → paystackWebhook runs
      → Order status = "confirmed"
      → Seller wallet += amount
      → WhatsApp → buyer: "Your order is confirmed"
      → WhatsApp → seller: "New order from [buyer]"
      → Stock decremented per item
      → Low stock check → WhatsApp alert if ≤ 3

Seller marks order as "shipped" in dashboard
  → onOrderStatusChange fires
    → WhatsApp → buyer: "Your order is on the way + tracking link"

Seller marks order as "delivered"
  → onOrderStatusChange fires
    → WhatsApp → buyer: "Order delivered!"

Seller requests withdrawal
  → Withdrawal doc created in Firestore
  → processPayout called (manual or scheduled)
    → Paystack Transfer initiated
      → transfer.success webhook fires
        → Wallet totalWithdrawn updated
        → WhatsApp → seller: "₦X paid to your bank"
