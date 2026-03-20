// ═══════════════════════════════════════════════════════════════
//  STORVIX — Cloud Functions  (Node 20)
//  Deploy: firebase deploy --only functions
// ═══════════════════════════════════════════════════════════════

"use strict";

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin  = require("firebase-admin");
const crypto = require("crypto");
const axios  = require("axios");

admin.initializeApp();
const db = admin.firestore();

// Set region to closest to Nigeria
setGlobalOptions({ region: "europe-west1", memory: "256MiB" });

// ─────────────────────────────────────────────────────────────
//  SECRETS  (set with: firebase functions:secrets:set KEY_NAME)
//  Or use .env.local for emulator testing
// ─────────────────────────────────────────────────────────────
// PAYSTACK_SECRET_KEY
// TERMII_API_KEY
// SHIPBUBBLE_API_KEY

const PAYSTACK_SECRET   = process.env.PAYSTACK_SECRET_KEY   || "sk_test_b60f2f7256c7c6b865a41fc9948ad66d4df919d6";
const TERMII_KEY        = process.env.TERMII_API_KEY         || "TLCBZsAnVUQIREWAlaMWoZKMIKNPfqxzAvBJJmYbkuSxaELmjWPsYuiNkVEnjO";
const SHIPBUBBLE_KEY    = process.env.SHIPBUBBLE_API_KEY     || "sb_sandbox_659338a12a240c26978de8662a49b9dcdd929e6e007f9f4400dafbbb6da247fa";
const PLATFORM_NAME     = "Storvix";
const SUPPORT_WHATSAPP  = "+2347089510199";

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
function fmt(n) {
  return "₦" + Number(n || 0).toLocaleString("en-NG");
}

function verifyPaystackSignature(body, signature) {
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET)
    .update(body)
    .digest("hex");
  return hash === signature;
}

// ─────────────────────────────────────────────────────────────
//  1.  PAYSTACK WEBHOOK
//      URL to paste in Paystack dashboard:
//      https://REGION-storvix-95bc8.cloudfunctions.net/paystackWebhook
// ─────────────────────────────────────────────────────────────
exports.paystackWebhook = onRequest(
  { invoker: "public", timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }

    // Verify signature
    const signature = req.headers["x-paystack-signature"];
    const rawBody   = JSON.stringify(req.body);
    if (!verifyPaystackSignature(rawBody, signature)) {
      console.error("Invalid Paystack signature");
      res.status(400).send("Invalid signature");
      return;
    }

    const { event, data } = req.body;
    console.log("Paystack event:", event, data?.reference);

    try {
      if (event === "charge.success") {
        await handleChargeSuccess(data);
      } else if (event === "transfer.success") {
        await handleTransferSuccess(data);
      } else if (event === "transfer.failed") {
        await handleTransferFailed(data);
      }
      res.status(200).json({ received: true });
    } catch (err) {
      console.error("Webhook handler error:", err);
      res.status(500).send("Handler error");
    }
  }
);

async function handleChargeSuccess(data) {
  const ref = data.reference;
  // Find the order by Paystack reference across all sellers
  const ordersSnap = await db.collectionGroup("orders")
    .where("paystackRef", "==", ref)
    .limit(1)
    .get();

  if (ordersSnap.empty) {
    // Order may have been created client-side — try to find by reference in metadata
    console.log("Order not found for ref:", ref, "— may be client-created");
    return;
  }

  const orderDoc  = ordersSnap.docs[0];
  const order     = orderDoc.data();
  const sellerId  = orderDoc.ref.parent.parent.id;
  const amount    = data.amount / 100; // convert from kobo

  // Idempotency — don't double-credit
  if (order.webhookProcessed) {
    console.log("Already processed:", ref);
    return;
  }

  // Update order
  await orderDoc.ref.update({
    status:           "confirmed",
    webhookProcessed: true,
    paidAt:           admin.firestore.FieldValue.serverTimestamp(),
    paystackData: {
      channel:    data.channel,
      paidAmount: amount,
      currency:   data.currency
    }
  });

  // Credit seller wallet
  await db.doc(`sellers/${sellerId}`).update({
    "wallet.balance":     admin.firestore.FieldValue.increment(amount),
    "wallet.totalEarned": admin.firestore.FieldValue.increment(amount)
  });

  // Log transaction
  await db.collection(`sellers/${sellerId}/transactions`).add({
    type:      "credit",
    amount,
    source:    "order",
    orderId:   orderDoc.id,
    orderNum:  order.orderNumber,
    buyerName: order.buyer?.name,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Fetch seller for notifications
  const sellerDoc = await db.doc(`sellers/${sellerId}`).get();
  const seller    = sellerDoc.data();

  // Send WhatsApp to BUYER
  if (order.buyer?.phone) {
    await sendWhatsApp(
      order.buyer.phone,
      `Hi ${order.buyer.name?.split(" ")[0]}! 🎉\n\nYour order from *${seller.storeName}* has been confirmed.\n\n` +
      `📦 Order *${order.orderNumber}*\n` +
      `💰 Amount paid: *${fmt(amount)}*\n\n` +
      `You'll receive a tracking link once your order ships. Thank you! ❤️\n\n` +
      `Questions? WhatsApp the store: ${seller.phone || SUPPORT_WHATSAPP}`
    );
  }

  // Send WhatsApp to SELLER
  if (seller?.phone) {
    const itemsList = (order.items || [])
      .map(i => `• ${i.name} (${i.size || ""}) ×${i.qty}`)
      .join("\n");
    await sendWhatsApp(
      seller.phone,
      `🛍️ *New Order!*\n\n` +
      `*${order.buyer?.name}* just placed an order.\n\n` +
      `${itemsList}\n\n` +
      `💰 Total: *${fmt(amount)}*\n` +
      `📦 Order: *${order.orderNumber}*\n\n` +
      `Log in to your Storvix dashboard to manage this order.`
    );
  }

  // Check for low stock and alert
  await checkLowStock(sellerId, order.items || []);

  console.log(`✅ Processed order ${order.orderNumber} — seller ${sellerId} credited ${fmt(amount)}`);
}

async function handleTransferSuccess(data) {
  // Find withdrawal record by Paystack transfer code
  const snap = await db.collection("withdrawals")
    .where("transferCode", "==", data.transfer_code)
    .limit(1).get();
  if (snap.empty) return;

  const wDoc = snap.docs[0];
  const w    = wDoc.data();
  await wDoc.ref.update({ status: "paid", paidAt: admin.firestore.FieldValue.serverTimestamp() });

  // Notify seller
  const sellerDoc = await db.doc(`sellers/${w.sellerId}`).get();
  const seller    = sellerDoc.data();
  if (seller?.phone) {
    await sendWhatsApp(
      seller.phone,
      `💸 *Payout Processed!*\n\n` +
      `Your withdrawal of *${fmt(w.amount)}* has been sent to your bank.\n\n` +
      `🏦 Account: *${w.bankDetails?.accountNumber}*\n` +
      `Net amount: *${fmt(w.netAmount)}*\n\n` +
      `It should arrive within a few minutes. If not, contact us: ${SUPPORT_WHATSAPP}`
    );
  }

  // Log transaction
  await db.collection(`sellers/${w.sellerId}/transactions`).add({
    type:      "debit",
    amount:    w.amount,
    source:    "withdrawal",
    netAmount: w.netAmount,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function handleTransferFailed(data) {
  const snap = await db.collection("withdrawals")
    .where("transferCode", "==", data.transfer_code)
    .limit(1).get();
  if (snap.empty) return;

  const wDoc = snap.docs[0];
  const w    = wDoc.data();
  await wDoc.ref.update({ status: "failed" });

  // Reverse the wallet deduction
  await db.doc(`sellers/${w.sellerId}`).update({
    "wallet.balance":        admin.firestore.FieldValue.increment(w.amount),
    "wallet.totalWithdrawn": admin.firestore.FieldValue.increment(-w.amount)
  });

  const sellerDoc = await db.doc(`sellers/${w.sellerId}`).get();
  const seller    = sellerDoc.data();
  if (seller?.phone) {
    await sendWhatsApp(
      seller.phone,
      `⚠️ *Payout Failed*\n\n` +
      `Your withdrawal of *${fmt(w.amount)}* could not be processed.\n\n` +
      `Your wallet has been refunded. Please check your bank details and try again.\n` +
      `Support: ${SUPPORT_WHATSAPP}`
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  2.  ORDER STATUS CHANGE → NOTIFY BUYER
//      Triggered when seller updates order status in dashboard
// ─────────────────────────────────────────────────────────────
exports.onOrderStatusChange = onDocumentUpdated(
  "sellers/{sellerId}/orders/{orderId}",
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    const { sellerId } = event.params;

    if (before.status === after.status) return; // No change

    const sellerDoc = await db.doc(`sellers/${sellerId}`).get();
    const seller    = sellerDoc.data();
    const buyerPhone = after.buyer?.phone;
    const buyerName  = after.buyer?.name?.split(" ")[0] || "there";

    if (!buyerPhone) return;

    if (after.status === "shipped" && after.trackingLink) {
      await sendWhatsApp(
        buyerPhone,
        `📦 *Your order is on the way!*\n\n` +
        `Hi ${buyerName}! Your order from *${seller?.storeName}* has been shipped.\n\n` +
        `🔍 Track your order: ${after.trackingLink}\n` +
        `📦 Order: *${after.orderNumber}*\n\n` +
        `Questions? ${seller?.phone || SUPPORT_WHATSAPP}`
      );
    } else if (after.status === "shipped") {
      await sendWhatsApp(
        buyerPhone,
        `📦 *Your order has been shipped!*\n\n` +
        `Hi ${buyerName}! Your order *${after.orderNumber}* from *${seller?.storeName}* is on its way.\n\n` +
        `You'll receive a tracking link shortly. ❤️`
      );
    } else if (after.status === "delivered") {
      await sendWhatsApp(
        buyerPhone,
        `✅ *Order Delivered!*\n\n` +
        `Hi ${buyerName}! We hope you received your order from *${seller?.storeName}*.\n\n` +
        `📦 Order: *${after.orderNumber}*\n\n` +
        `Enjoy your purchase! 🎉`
      );
    } else if (after.status === "cancelled") {
      await sendWhatsApp(
        buyerPhone,
        `❌ *Order Cancelled*\n\n` +
        `Hi ${buyerName}, your order *${after.orderNumber}* from *${seller?.storeName}* has been cancelled.\n\n` +
        `For questions, contact: ${seller?.phone || SUPPORT_WHATSAPP}`
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  3.  LOW STOCK CHECKER
//      Called after order is processed
// ─────────────────────────────────────────────────────────────
async function checkLowStock(sellerId, items) {
  const sellerDoc = await db.doc(`sellers/${sellerId}`).get();
  const seller    = sellerDoc.data();
  if (!seller?.phone) return;

  const lowItems = [];

  for (const item of items) {
    if (!item.productId) continue;
    const prodDoc = await db.doc(`sellers/${sellerId}/products/${item.productId}`).get();
    if (!prodDoc.exists) continue;
    const prod = prodDoc.data();

    // Decrement stock
    const newStock = Math.max(0, (prod.stock || 0) - item.qty);
    await prodDoc.ref.update({ stock: newStock });

    // Check threshold (3 = configured)
    if (newStock <= 3 && newStock > 0) {
      lowItems.push(`• *${prod.name}* — only ${newStock} left`);
    } else if (newStock === 0) {
      lowItems.push(`• *${prod.name}* — OUT OF STOCK`);
    }
  }

  if (lowItems.length) {
    await sendWhatsApp(
      seller.phone,
      `⚠️ *Low Stock Alert*\n\n` +
      `The following products need restocking:\n\n` +
      lowItems.join("\n") + "\n\n" +
      `Log into your Storvix dashboard to update stock.`
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  4.  SHIPBUBBLE — FETCH DELIVERY RATES
//      Called from checkout when buyer enters address
// ─────────────────────────────────────────────────────────────
exports.getDeliveryRates = onCall(
  { invoker: "public" },
  async (request) => {
    const { senderAddress, receiverAddress, items } = request.data;

    if (!senderAddress || !receiverAddress) {
      throw new HttpsError("invalid-argument", "Sender and receiver address required");
    }

    try {
      const response = await axios.post(
        "https://api.shipbubble.com/v1/shipping/fetch_rates",
        {
          sender_address_code:   senderAddress.addressCode,
          reciever_address_code: receiverAddress.addressCode,
          package_items: items.map(i => ({
            name:     i.name,
            weight:   i.weight || 0.5,
            quantity: i.qty    || 1
          })),
          package_dimension: { length: 25, width: 20, height: 10 }
        },
        {
          headers: {
            "Authorization": `Bearer ${SHIPBUBBLE_KEY}`,
            "Content-Type":  "application/json"
          }
        }
      );

      const services = response.data?.data?.services || [];
      return {
        rates: services.map(s => ({
          courier:       s.courier_name,
          service:       s.service_type,
          price:         s.total_price,
          estimatedDays: s.estimated_delivery_time,
          serviceCode:   s.service_code
        }))
      };
    } catch (err) {
      console.error("Shipbubble error:", err.response?.data || err.message);
      // Return mock rates as fallback for sandbox
      return {
        rates: [
          { courier: "GIG Logistics",  service: "Next Day",  price: 1200, estimatedDays: "1-2 days",  serviceCode: "GIG_ND" },
          { courier: "Kwik Delivery",  service: "Same Day",  price: 1800, estimatedDays: "Same day",  serviceCode: "KWIK_SD" },
          { courier: "Sendbox",        service: "Standard",  price: 800,  estimatedDays: "2-3 days",  serviceCode: "SB_STD" },
        ]
      };
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  5.  SHIPBUBBLE — CREATE SHIPMENT (book courier pickup)
// ─────────────────────────────────────────────────────────────
exports.createShipment = onCall(
  { invoker: "public" },
  async (request) => {
    const { sellerId, orderId, serviceCode } = request.data;

    // Auth check
    if (!request.auth || request.auth.uid !== sellerId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    const orderDoc = await db.doc(`sellers/${sellerId}/orders/${orderId}`).get();
    if (!orderDoc.exists) throw new HttpsError("not-found", "Order not found");
    const order = orderDoc.data();

    const sellerDoc = await db.doc(`sellers/${sellerId}`).get();
    const seller = sellerDoc.data();

    try {
      const response = await axios.post(
        "https://api.shipbubble.com/v1/shipping/labels",
        {
          service_code:  serviceCode,
          sender: {
            name:    seller.storeName,
            email:   seller.email,
            phone:   seller.phone,
            address: `${seller.city}, ${seller.state}, Nigeria`
          },
          receiver: {
            name:    order.buyer.name,
            email:   order.buyer.email,
            phone:   order.buyer.phone,
            address: `${order.buyer.address}, ${order.buyer.city}, ${order.buyer.state}`
          },
          package_items: order.items.map(i => ({
            name:     i.name,
            weight:   0.5,
            quantity: i.qty
          })),
          request_token: order.orderNumber
        },
        {
          headers: {
            "Authorization": `Bearer ${SHIPBUBBLE_KEY}`,
            "Content-Type":  "application/json"
          }
        }
      );

      const shipData = response.data?.data;
      const trackingUrl = shipData?.tracking_url || "";

      // Update order with tracking info
      await orderDoc.ref.update({
        status:       "shipped",
        trackingLink: trackingUrl,
        shipmentId:   shipData?.shipment_id,
        courier:      shipData?.courier_name,
        shippedAt:    admin.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, trackingUrl, shipmentId: shipData?.shipment_id };
    } catch (err) {
      console.error("Shipbubble shipment error:", err.response?.data || err.message);
      throw new HttpsError("internal", "Failed to create shipment");
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  6.  PAYSTACK — VERIFY BANK ACCOUNT
//      Keeps secret key off the client
// ─────────────────────────────────────────────────────────────
exports.verifyBankAccount = onCall(
  { invoker: "public" },
  async (request) => {
    const { accountNumber, bankCode } = request.data;

    if (!accountNumber || !bankCode) {
      throw new HttpsError("invalid-argument", "Account number and bank code required");
    }
    if (accountNumber.length !== 10) {
      throw new HttpsError("invalid-argument", "Account number must be 10 digits");
    }

    try {
      const response = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
      );

      if (response.data?.status) {
        return {
          verified:    true,
          accountName: response.data.data.account_name,
          accountNumber: response.data.data.account_number
        };
      } else {
        throw new HttpsError("not-found", "Account not found");
      }
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const msg = err.response?.data?.message || "Verification failed";
      throw new HttpsError("internal", msg);
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  7.  PAYSTACK — PROCESS PAYOUT (Transfer API)
//      Manual trigger by admin — or automated on schedule
// ─────────────────────────────────────────────────────────────
exports.processPayout = onCall(
  { invoker: "private" }, // Callable only by authenticated sellers
  async (request) => {
    const sellerId = request.auth?.uid;
    if (!sellerId) throw new HttpsError("unauthenticated", "Login required");

    const { withdrawalId } = request.data;

    const wDoc = await db.doc(`withdrawals/${withdrawalId}`).get();
    if (!wDoc.exists) throw new HttpsError("not-found", "Withdrawal not found");
    const w = wDoc.data();

    if (w.sellerId !== sellerId) throw new HttpsError("permission-denied", "Not your withdrawal");
    if (w.status !== "pending") throw new HttpsError("failed-precondition", "Withdrawal already processed");

    try {
      // Step 1: Create transfer recipient
      const recipientRes = await axios.post(
        "https://api.paystack.co/transferrecipient",
        {
          type:           "nuban",
          name:           w.bankDetails.accountName,
          account_number: w.bankDetails.accountNumber,
          bank_code:      w.bankDetails.code,
          currency:       "NGN"
        },
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } }
      );

      const recipientCode = recipientRes.data?.data?.recipient_code;

      // Step 2: Initiate transfer
      const transferRes = await axios.post(
        "https://api.paystack.co/transfer",
        {
          source:        "balance",
          amount:        (w.netAmount) * 100, // kobo
          recipient:     recipientCode,
          reason:        `Storvix payout — ${w.sellerId}`
        },
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } }
      );

      const transferCode = transferRes.data?.data?.transfer_code;
      await wDoc.ref.update({
        status:        "processing",
        transferCode,
        recipientCode,
        initiatedAt:   admin.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, transferCode };
    } catch (err) {
      console.error("Payout error:", err.response?.data || err.message);
      throw new HttpsError("internal", err.response?.data?.message || "Transfer failed");
    }
  }
);

// ─────────────────────────────────────────────────────────────
//  8.  TERMII — SEND WHATSAPP  (internal helper)
// ─────────────────────────────────────────────────────────────
async function sendWhatsApp(phone, message) {
  // Normalise phone number to international format
  let number = phone.replace(/\s+/g, "").replace(/^0/, "234");
  if (!number.startsWith("+")) number = "+" + number;
  number = number.replace("+", "");

  try {
    const response = await axios.post(
      "https://api.ng.termii.com/api/sms/send",
      {
        to:          number,
        from:        "Storvix",
        sms:         message,
        type:        "plain",
        channel:     "whatsapp",
        api_key:     TERMII_KEY
      },
      { headers: { "Content-Type": "application/json" } }
    );
    console.log(`✅ WhatsApp sent to ${number}:`, response.data?.message_id);
    return response.data;
  } catch (err) {
    // Don't fail the main flow for notification errors
    console.error(`⚠️ WhatsApp send failed to ${number}:`, err.response?.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
//  9.  TERMII — CALLABLE (from dashboard for custom messages)
// ─────────────────────────────────────────────────────────────
exports.sendNotification = onCall(
  { invoker: "public" },
  async (request) => {
    const { phone, message, sellerId } = request.data;

    // Sellers can only send from their own dashboard
    if (!request.auth || request.auth.uid !== sellerId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    const result = await sendWhatsApp(phone, message);
    return { sent: !!result };
  }
);

// ─────────────────────────────────────────────────────────────
//  10. WEBHOOK URL GENERATOR
//      HTTP endpoint to get/register the webhook URL
// ─────────────────────────────────────────────────────────────
exports.getWebhookUrl = onCall(
  { invoker: "public" },
  async (request) => {
    const region  = "europe-west1";
    const project = "storvix-95bc8";
    return {
      webhookUrl: `https://${region}-${project}.cloudfunctions.net/paystackWebhook`,
      instructions: [
        "1. Go to paystack.com → Settings → API Keys & Webhooks",
        "2. Paste the webhook URL above",
        "3. Enable events: charge.success, transfer.success, transfer.failed",
        "4. Save changes"
      ]
    };
  }
);
