// ═══════════════════════════════════════════════════════════════
//  STORVIX MODULE 3 — RESEND EMAIL FUNCTIONS
//  Add these to functions/index.js (append to the file)
//
//  Setup:
//  1. firebase functions:secrets:set RESEND_API_KEY
//     paste: re_hH21MD7D_AQxg6HjgT2mKxiMd5thZpwg2
//
//  2. Verify your domain on resend.com:
//     resend.com → Domains → Add Domain → storvix1.vercel.app
//     Add the DNS TXT records it gives you
//     Until verified, emails send from onboarding@resend.dev
// ═══════════════════════════════════════════════════════════════

const RESEND_KEY    = process.env.RESEND_API_KEY || "re_hH21MD7D_AQxg6HjgT2mKxiMd5thZpwg2";
const FROM_EMAIL    = "Storvix Orders <orders@storvix.com>";
const FROM_FALLBACK = "Storvix <onboarding@resend.dev>"; // works without domain verification

// ─────────────────────────────────────────────────────────────
//  EMAIL HELPER
// ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  try {
    const res = await axios.post(
      "https://api.resend.com/emails",
      { from: FROM_FALLBACK, to, subject, html },
      { headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" } }
    );
    console.log("✅ Email sent to", to, "— ID:", res.data?.id);
    return res.data;
  } catch (err) {
    console.error("⚠️ Email failed:", err.response?.data || err.message);
    return null; // Don't fail main flow for email errors
  }
}

// ─────────────────────────────────────────────────────────────
//  ORDER CONFIRMATION EMAIL TEMPLATE
// ─────────────────────────────────────────────────────────────
function orderConfirmationHtml(order, seller) {
  const itemsHtml = (order.items || []).map(item => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f0ede8;font-size:14px">${item.name}${item.size ? ` <span style="color:#6B6B6B">(${item.size})</span>` : ''}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0ede8;font-size:14px;text-align:center">×${item.qty}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0ede8;font-size:14px;text-align:right;font-weight:600">₦${Number(item.price * item.qty).toLocaleString('en-NG')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF9F7;font-family:'DM Sans',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="background:#0E0E0E;padding:24px 32px;border-radius:10px 10px 0 0">
          <table width="100%"><tr>
            <td style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px">⚡ Storvix</td>
            <td style="color:#C5DAFD;font-size:13px;text-align:right">Order Confirmed</td>
          </tr></table>
        </td></tr>

        <!-- Store name band -->
        <tr><td style="background:#1B6EF5;padding:12px 32px">
          <p style="margin:0;color:#fff;font-size:14px">
            Your order from <strong>${seller.storeName}</strong>
          </p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:32px;border-left:1px solid #E8E6E0;border-right:1px solid #E8E6E0">

          <h1 style="margin:0 0 6px;font-size:26px;color:#0E0E0E;font-weight:800">
            Order confirmed! 🎉
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#6B6B6B">
            Hi ${order.buyer?.name?.split(' ')[0] || 'there'}, your order has been placed successfully.
          </p>

          <!-- Order meta -->
          <table width="100%" style="background:#FAF9F7;border-radius:8px;margin-bottom:24px">
            <tr>
              <td style="padding:14px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6B6B6B;border-bottom:1px solid #E8E6E0" colspan="2">Order Details</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-size:14px;color:#6B6B6B">Order Number</td>
              <td style="padding:10px 16px;font-size:14px;font-weight:700;color:#0E0E0E;text-align:right">${order.orderNumber}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-size:14px;color:#6B6B6B;border-top:1px solid #f0ede8">Delivery to</td>
              <td style="padding:10px 16px;font-size:14px;color:#0E0E0E;text-align:right;border-top:1px solid #f0ede8">${order.buyer?.city || ''}, ${order.buyer?.state || ''}</td>
            </tr>
          </table>

          <!-- Items -->
          <table width="100%" style="border:1px solid #E8E6E0;border-radius:8px;overflow:hidden;margin-bottom:24px">
            <tr style="background:#F5F4F1">
              <td style="padding:10px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6B6B6B">Item</td>
              <td style="padding:10px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6B6B6B;text-align:center">Qty</td>
              <td style="padding:10px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6B6B6B;text-align:right">Amount</td>
            </tr>
            ${itemsHtml}
            <tr style="background:#F5F4F1">
              <td colspan="2" style="padding:12px 16px;font-size:14px;font-weight:700;color:#0E0E0E">Total</td>
              <td style="padding:12px 16px;font-size:16px;font-weight:800;color:#1B6EF5;text-align:right">₦${Number(order.total).toLocaleString('en-NG')}</td>
            </tr>
          </table>

          <!-- WhatsApp note -->
          <table width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:24px">
            <tr><td style="padding:14px 16px;font-size:14px;color:#15803d">
              💬 <strong>Track your order on WhatsApp</strong><br>
              <span style="color:#166534;font-size:13px">We'll send you a WhatsApp message when your order ships with a live tracking link.</span>
            </td></tr>
          </table>

          <p style="margin:0;font-size:14px;color:#6B6B6B;line-height:1.6">
            Questions? Reply to this email or WhatsApp the store directly at 
            <a href="https://wa.me/${(seller.phone||'').replace(/[^0-9]/g,'')}" style="color:#1B6EF5;text-decoration:none">${seller.phone || ''}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F5F4F1;padding:20px 32px;border-radius:0 0 10px 10px;border:1px solid #E8E6E0;border-top:none;text-align:center">
          <p style="margin:0;font-size:12px;color:#6B6B6B">
            Powered by <a href="https://storvix1.vercel.app" style="color:#1B6EF5;text-decoration:none">Storvix</a> · 
            Payments by Paystack · Delivery by Shipbubble
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
//  PAYOUT EMAIL TEMPLATE
// ─────────────────────────────────────────────────────────────
function payoutEmailHtml(seller, amount, netAmount, bank) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FAF9F7;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#0E0E0E;padding:24px 32px;border-radius:10px 10px 0 0">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:800">⚡ Storvix</p>
        </td></tr>
        <tr><td style="background:#fff;padding:32px;border:1px solid #E8E6E0;border-top:none">
          <h1 style="margin:0 0 8px;font-size:24px;color:#0E0E0E">Payout Processed 💸</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#6B6B6B">Hi ${seller.storeName}, your withdrawal has been processed.</p>

          <table width="100%" style="background:#FAF9F7;border-radius:8px;margin-bottom:24px">
            <tr><td style="padding:14px 16px;font-size:14px;color:#6B6B6B">Amount requested</td>
                <td style="padding:14px 16px;font-size:14px;font-weight:700;text-align:right">₦${Number(amount).toLocaleString('en-NG')}</td></tr>
            <tr><td style="padding:14px 16px;font-size:14px;color:#6B6B6B;border-top:1px solid #E8E6E0">Withdrawal fee</td>
                <td style="padding:14px 16px;font-size:14px;text-align:right;border-top:1px solid #E8E6E0;color:#dc2626">− ₦100</td></tr>
            <tr style="background:#f0fdf4"><td style="padding:14px 16px;font-size:15px;font-weight:800;color:#15803d">Amount sent to bank</td>
                <td style="padding:14px 16px;font-size:18px;font-weight:800;text-align:right;color:#15803d">₦${Number(netAmount).toLocaleString('en-NG')}</td></tr>
          </table>

          <p style="font-size:14px;color:#6B6B6B">
            Sent to: <strong>${bank?.accountName || ''}</strong> · ${bank?.accountNumber || ''}<br>
            Expected arrival: <strong>within a few minutes</strong>
          </p>
          <p style="font-size:13px;color:#6B6B6B;margin-top:12px">
            If you don't receive it within 24 hours, contact us on WhatsApp: +2347089510199
          </p>
        </td></tr>
        <tr><td style="background:#F5F4F1;padding:16px 32px;border-radius:0 0 10px 10px;border:1px solid #E8E6E0;border-top:none;text-align:center">
          <p style="margin:0;font-size:12px;color:#6B6B6B">Storvix · storvix1.vercel.app</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
//  TRIGGER: Send order confirmation email on charge.success
//  Add this call inside handleChargeSuccess() in index.js,
//  right after the WhatsApp sends:
//
//  await sendOrderConfirmationEmail(order, seller, amount);
// ─────────────────────────────────────────────────────────────
async function sendOrderConfirmationEmail(order, seller, amount) {
  if (!order.buyer?.email) return;
  await sendEmail({
    to:      order.buyer.email,
    subject: `Order confirmed — ${order.orderNumber} from ${seller.storeName}`,
    html:    orderConfirmationHtml({ ...order, total: amount }, seller)
  });
}

// ─────────────────────────────────────────────────────────────
//  TRIGGER: Send payout email on transfer.success
//  Add this call inside handleTransferSuccess() in index.js,
//  right after the WhatsApp send:
//
//  await sendPayoutEmail(seller, w.amount, w.netAmount, w.bankDetails);
// ─────────────────────────────────────────────────────────────
async function sendPayoutEmail(seller, amount, netAmount, bank) {
  if (!seller?.email) return;
  await sendEmail({
    to:      seller.email,
    subject: `₦${Number(netAmount).toLocaleString('en-NG')} sent to your bank — Storvix Payout`,
    html:    payoutEmailHtml(seller, amount, netAmount, bank)
  });
}

// ─────────────────────────────────────────────────────────────
//  CALLABLE: Resend order confirmation (from dashboard)
// ─────────────────────────────────────────────────────────────
exports.resendOrderEmail = onCall(
  { invoker: "public" },
  async (request) => {
    const { sellerId, orderId } = request.data;
    if (!request.auth || request.auth.uid !== sellerId) {
      throw new HttpsError("permission-denied", "Not authorized");
    }

    const orderDoc  = await db.doc(`sellers/${sellerId}/orders/${orderId}`).get();
    const sellerDoc = await db.doc(`sellers/${sellerId}`).get();
    if (!orderDoc.exists) throw new HttpsError("not-found", "Order not found");

    await sendOrderConfirmationEmail(orderDoc.data(), sellerDoc.data(), orderDoc.data().total);
    return { sent: true };
  }
);
