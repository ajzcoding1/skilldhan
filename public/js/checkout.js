/**
 * Checkout Page Scripts
 * Razorpay Integration, Dynamic Price Calculation, Event Tracking & Input Validation
 */

let storeConfig = {
  keyId: '',
  isDemoMode: true,
  basePrice: 199,
  orderBump: { enabled: true, price: 99 }
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadStoreConfig();
  initCheckoutEvents();

  if (window.StoreTracking) {
    window.StoreTracking.trackInitiateCheckout(storeConfig.basePrice || 199);
  }
});

async function loadStoreConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    storeConfig = data;
    updatePriceDisplay();

    if (storeConfig.isDemoMode) {
      const modeIndicator = document.getElementById('mode-indicator');
      if (modeIndicator) modeIndicator.style.display = 'block';
    }
  } catch (err) {
    console.warn('Could not load /api/config, using defaults:', err);
  }
}

function updatePriceDisplay() {
  const bumpCheckbox = document.getElementById('bump-checkbox');
  const includeBump = bumpCheckbox && bumpCheckbox.checked;
  const basePrice = storeConfig.basePrice || 199;
  const bumpPrice = storeConfig.orderBump?.price || 99;
  const finalPrice = includeBump ? basePrice + bumpPrice : basePrice;

  const bumpRow = document.getElementById('summary-bump-row');
  if (bumpRow) bumpRow.style.display = includeBump ? 'table-row' : 'none';

  const totalEl = document.getElementById('summary-total-price');
  if (totalEl) totalEl.textContent = `₹${finalPrice}`;

  const payBtnText = document.getElementById('pay-btn-text');
  if (payBtnText) payBtnText.textContent = `Pay now - ₹${finalPrice} (secure checkout)`;
}

function initCheckoutEvents() {
  const bumpCheckbox = document.getElementById('bump-checkbox');
  if (bumpCheckbox) {
    bumpCheckbox.addEventListener('change', () => {
      updatePriceDisplay();
      if (window.StoreTracking) {
        window.StoreTracking.trackOrderBump(bumpCheckbox.checked, storeConfig.orderBump?.price || 99);
      }
    });
  }

  const form = document.getElementById('checkout-form');
  if (form) form.addEventListener('submit', handleCheckoutSubmit);
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('cust-name');
  const emailInput = document.getElementById('cust-email');
  const phoneInput = document.getElementById('cust-phone');
  const bumpCheckbox = document.getElementById('bump-checkbox');
  const payBtn = document.getElementById('pay-submit-btn');

  const name = nameInput.value.replace(/[<>'"`;]/g, '').trim();
  const email = emailInput.value.trim().toLowerCase();
  const phone = phoneInput.value.replace(/\D/g, '');
  const includeBump = bumpCheckbox ? bumpCheckbox.checked === true : false;

  if (!name || name.length < 2) {
    showError('Please enter your full name (at least 2 characters).');
    nameInput.focus();
    return;
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email)) {
    showError('Please enter a valid email address.');
    emailInput.focus();
    return;
  }

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    showError('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
    phoneInput.focus();
    return;
  }

  hideError();
  payBtn.disabled = true;
  payBtn.innerHTML = '🔄 Securely preparing your order...';

  try {
    const createRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, includeBump })
    });

    const orderData = await createRes.json();
    if (!createRes.ok || !orderData.success) {
      throw new Error(orderData.error || 'Could not create the order.');
    }

    if (!orderData.isDemoMode && window.Razorpay) {
      launchRazorpayCheckout(orderData, { name, email, phone, includeBump });
    } else {
      simulateDemoPayment(orderData, { name, email, phone, includeBump });
    }
  } catch (err) {
    console.error('Checkout failed:', err);
    showError(err.message || 'Could not start payment. Please try again.');
    payBtn.disabled = false;
    updatePriceDisplay();
  }
}

function launchRazorpayCheckout(orderData, customerInfo) {
  const options = {
    key: orderData.keyId,
    amount: orderData.amount,
    currency: orderData.currency,
    name: storeConfig.support?.storeName || 'Skilldhan',
    description: 'AI Digital Business eBook + Bonuses',
    image: '/assets/ebook-cover.jpg',
    order_id: orderData.orderId,
    prefill: {
      name: customerInfo.name,
      email: customerInfo.email,
      contact: customerInfo.phone
    },
    theme: { color: '#6366f1' },
    modal: {
      ondismiss: function() {
        const payBtn = document.getElementById('pay-submit-btn');
        if (payBtn) {
          payBtn.disabled = false;
          updatePriceDisplay();
        }
      }
    },
    handler: async function(response) {
      await verifyPaymentSuccess({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
        customer: customerInfo,
        includeBump: customerInfo.includeBump
      });
    }
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', function(response) {
    showError('Payment failed: ' + (response.error.description || 'Please try again.'));
    const payBtn = document.getElementById('pay-submit-btn');
    if (payBtn) {
      payBtn.disabled = false;
      updatePriceDisplay();
    }
  });
  rzp.open();
}

function simulateDemoPayment(orderData, customerInfo) {
  const modal = document.getElementById('demo-payment-modal');
  if (modal) {
    modal.style.display = 'flex';

    document.getElementById('demo-confirm-btn').onclick = async () => {
      modal.style.display = 'none';
      const fakePaymentId = 'pay_demo_' + Date.now();
      await verifyPaymentSuccess({
        razorpay_order_id: orderData.orderId,
        razorpay_payment_id: fakePaymentId,
        razorpay_signature: 'demo_signature',
        customer: customerInfo,
        includeBump: customerInfo.includeBump
      });
    };

    document.getElementById('demo-cancel-btn').onclick = () => {
      modal.style.display = 'none';
      const payBtn = document.getElementById('pay-submit-btn');
      if (payBtn) {
        payBtn.disabled = false;
        updatePriceDisplay();
      }
    };
  } else {
    setTimeout(async () => {
      await verifyPaymentSuccess({
        razorpay_order_id: orderData.orderId,
        razorpay_payment_id: 'pay_demo_' + Date.now(),
        razorpay_signature: 'demo_signature',
        customer: customerInfo,
        includeBump: customerInfo.includeBump
      });
    }, 1200);
  }
}

async function verifyPaymentSuccess(verifyPayload) {
  const payBtn = document.getElementById('pay-submit-btn');
  if (payBtn) payBtn.innerHTML = '🔒 Verifying payment...';

  try {
    const res = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verifyPayload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Payment verification failed.');
    }

    const totalPaid = verifyPayload.includeBump ? 298 : 199;
    sessionStorage.setItem('last_order', JSON.stringify({
      orderId: data.orderId,
      paymentId: data.paymentId,
      name: verifyPayload.customer?.name,
      email: verifyPayload.customer?.email,
      totalPaid: totalPaid,
      downloadUrl: data.downloadUrl,
      bonusDownloadUrl: data.bonusDownloadUrl
    }));

    window.location.href = `/success?order_id=${encodeURIComponent(data.orderId)}&payment_id=${encodeURIComponent(data.paymentId)}&download_url=${encodeURIComponent(data.downloadUrl)}&bonus_url=${encodeURIComponent(data.bonusDownloadUrl)}`;
  } catch (err) {
    console.error('Verification failed:', err);
    showError(err.message || 'There was an error verifying your payment.');
    if (payBtn) {
      payBtn.disabled = false;
      updatePriceDisplay();
    }
  }
}

function showError(msg) {
  const errorAlert = document.getElementById('checkout-error');
  if (errorAlert) {
    errorAlert.textContent = msg;
    errorAlert.style.display = 'block';
  } else {
    alert(msg);
  }
}

function hideError() {
  const errorAlert = document.getElementById('checkout-error');
  if (errorAlert) errorAlert.style.display = 'none';
}