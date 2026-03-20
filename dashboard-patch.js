<!-- DASHBOARD PATCH — Add to dashboard.html <script type="module"> -->

<!--
  1. Add this import at top of the module script in dashboard.html:
  
  import { getFunctions, httpsCallable }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

  const functions = getFunctions(app, 'europe-west1');
  const processPayoutFn  = httpsCallable(functions, 'processPayout');
  const sendNotifFn      = httpsCallable(functions, 'sendNotification');
  const getWebhookUrlFn  = httpsCallable(functions, 'getWebhookUrl');

  2. Replace handleWithdraw with:
-->

window.handleWithdraw = async function() {
  const amt = parseFloat(document.getElementById('withdrawAmt').value);
  if (!amt || amt < 5000) { toast('Minimum withdrawal is ₦5,000', 'error'); return; }
  if (!seller?.bank?.accountNumber) { toast('No verified bank account on file.', 'error'); return; }
  if (amt > (seller.wallet?.balance || 0)) { toast('Insufficient wallet balance', 'error'); return; }

  const btn = document.querySelector('.checkout-btn');
  btn.disabled = true; btn.textContent = 'Processing…';

  try {
    await requestWithdrawal(seller.id, amt, seller.bank);

    // Get the withdrawal doc ID and trigger the payout via Cloud Function
    // (In production, this is done automatically on a schedule or via webhook)
    toast('Withdrawal requested! You will be notified via WhatsApp when processed.', 'success');

    // Refresh seller wallet balance
    seller = await getSeller(seller.id);
    document.getElementById('walletBalance').textContent  = fmt(seller.wallet?.balance);
    document.getElementById('totalWithdrawn').textContent = fmt(seller.wallet?.totalWithdrawn);
    document.getElementById('statBalance').textContent    = fmt(seller.wallet?.balance);
    document.getElementById('withdrawAmt').value          = '';
  } catch(e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Request Withdrawal';
  }
};

// 3. Add "Copy Webhook URL" button to settings tab in dashboard:
window.showWebhookUrl = async function() {
  try {
    const result = await getWebhookUrlFn({});
    const url = result.data.webhookUrl;
    navigator.clipboard.writeText(url);
    toast('Webhook URL copied! Paste in Paystack dashboard → Settings → Webhooks', 'success');
    console.log('Webhook URL:', url);
    console.log('Instructions:', result.data.instructions);
  } catch(e) {
    toast('Could not get webhook URL', 'error');
  }
};

// 4. Send custom WhatsApp from dashboard (e.g. shipping update):
window.sendCustomWhatsApp = async function(buyerPhone, message) {
  try {
    await sendNotifFn({ phone: buyerPhone, message, sellerId: seller.id });
    toast('WhatsApp sent!', 'success');
  } catch(e) {
    toast('Could not send WhatsApp: ' + e.message, 'error');
  }
};
