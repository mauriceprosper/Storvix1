# Storvix MVP — Deployment Guide

## Files
```
storvix/
  firebase-config.js   → Shared Firebase init + all helpers
  auth.html            → Seller login + signup
  onboarding.html      → 5-step store setup wizard
  dashboard.html       → Seller dashboard (orders, products, wallet, settings)
  store.html           → Buyer-facing storefront (?s=slug)
  firestore.rules      → Paste into Firebase Console > Firestore > Rules
```

## Deploy to Vercel (5 minutes)

1. Push all files to a GitHub repo
2. Go to vercel.com → Import project → Select your repo
3. Set **Output Directory** to `.` (root)
4. Deploy

Your URLs will be:
- `storvix1.vercel.app/auth.html` — seller login
- `storvix1.vercel.app/onboarding.html` — seller setup
- `storvix1.vercel.app/dashboard.html` — seller dashboard
- `storvix1.vercel.app/store.html?s=amaka` — buyer storefront

## Firebase Setup Checklist

### 1. Firestore
- Console → Firestore Database → Create database (Production mode)
- Go to Rules tab → Paste contents of `firestore.rules` → Publish

### 2. Firebase Storage
- Console → Storage → Get started
- Set rules to allow seller uploads:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /sellers/{sellerId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == sellerId;
    }
  }
}
```

### 3. Authentication
- Console → Authentication → Get started
- Enable: Email/Password and Google

### 4. Firestore Indexes
When you first run order queries, Firebase may prompt you to create indexes.
Click the link in the browser console — it creates them automatically.

## Environment Variables (none needed)
All config is in firebase-config.js. API keys are already set.

## What works now
- ✅ Seller signup + Google sign-in
- ✅ 5-step onboarding wizard (writes to Firestore)
- ✅ Dynamic storefront per seller (reads from Firestore)
- ✅ Product management (add/edit/delete with images, variants)
- ✅ Order creation on Paystack payment success
- ✅ Order management with status updates
- ✅ Wallet balance tracking
- ✅ Withdrawal requests (manual processing)
- ✅ Store settings (colour, logo, name, tagline)
- ✅ Paystack test checkout (card + transfer)

## What needs Cloud Functions next
- Paystack webhook → verify payment server-side + credit wallet
- Termii WhatsApp notifications
- Shipbubble rate fetching at checkout
- Automated payouts via Paystack Transfer API
- Low stock email alerts via Resend

## Test the buyer flow
1. Seller signs up at /auth.html
2. Completes onboarding → gets store URL like /store.html?s=their-slug
3. Seller adds products in dashboard
4. Visit /store.html?s=their-slug as a buyer
5. Add to cart → checkout → use Paystack test card:
   - Card: 4084 0840 8408 4081
   - Expiry: any future date
   - CVV: 408
   - PIN: 0000
   - OTP: 123456
