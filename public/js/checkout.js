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
  
  // Track InitiateCheckout on page entry
  if (window.StoreTracking) {
    window.StoreTracking.trackInitiateCheckout(storeConfig.basePrice || 199);
  }
});

// Fetch backend store configuration
async function loadStoreConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    storeConfig = data;
    updatePriceDisplay();

    // Show Demo mode badge if in sandbox/demo mode
    if (storeConfig.isDemoMode) {
      const modeIndicator = document.getElementById('mode-indicator');
      if (modeIndicator) {
        modeIndicator.style.display = 'block';
      }
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
  const finalPrice = includeBump ? (basePrice + bumpPrice) : basePrice;

  const bumpRow = document.getElementById('summary-bump-row');
  if (bumpRow) {
    bumpRow.style.display = includeBump ? 'table-row' : 'none';
  }

  const totalEl = document.getElementById('summary-total-price');
  if (totalEl) {
    totalEl.textContent = `₹${finalPrice}`;
  }

  const payBtnText = document.getElementById('pay-btn-text');
  if (payBtnText) {
    payBtnText.textContent = `अभी भुगतान करें - ₹${finalPrice} (100% सुरक्षित)`;
  }
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
  if (form) {
    form.addEventListener('submit', handleCheckoutSubmit);
  }
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('cust-name');
  const emailInput = document.getElementById('cust-email');
  const phoneInput = document.getElementById('cust-phone');
  const bumpCheckbox = document.getElementById('bump-checkbox');
  const payBtn = document.getElementById('pay-submit-btn');

  // Input Sanitization (Cybersecurity Hardening)
  const name = nameInput.value.replace(/[<>'"`;]/g, '').trim();
  const email = emailInput.value.trim().toLowerCase();
  const phone = phoneInput.value.replace(/\D/g, '');
  const includeBump = bumpCheckbox ? bumpCheckbox.checked === true : false;

  // Validation
  if (!name || name.length < 2) {
    showError('कृपया अपना पूरा नाम दर्ज करें (कम से कम 2 अक्षर)।');
    nameInput.focus();
    return;
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email)) {
    showError('कृपया एक वैध ईमेल पता दर्ज करें ताकि हम ई-बुक भेज सकें।');
    emailInput.focus();
    return;
  }

  // Strict Indian mobile validation (10 digits starting with 6, 7, 8, or 9)
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    showError('कृपया 10 अंकों का वैध भारतीय व्हाट्सएप/मोबाइल नंबर दर्ज करें (6, 7, 8 या 9 से शुरू)।');
    phoneInput.focus();
    return;
  }

  hideError();
  payBtn.disabled = true;
  payBtn.innerHTML = '🔄 ऑर्डर सुरक्षित रूप से तैयार हो रहा है...';

  try {
    // 1. Create order on backend (server calculates exact amount)
    const createRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, includeBump })
    });

    const orderData = await createRes.json();
    if (!createRes.ok || !orderData.success) {
      throw new Error(orderData.error || 'ऑर्डर नहीं बन सका।');
    }

    // 2. Check if we are in real Razorpay mode or Demo simulation
    if (!orderData.isDemoMode && window.Razorpay) {
      launchRazorpayCheckout(orderData, { name, email, phone, includeBump });
    } else {
      // Demo / Sandbox Simulation Modal
      simulateDemoPayment(orderData, { name, email, phone, includeBump });
    }

  } catch (err) {
    console.error('Checkout failed:', err);
    showError(err.message || 'भुगतान शुरू करने में समस्या हुई। कृपया पुनः प्रयास करें।');
    payBtn.disabled = false;
    updatePriceDisplay();
  }
}

// Real Razorpay Checkout Modal
function launchRazorpayCheckout(orderData, customerInfo) {
  const options = {
    key: orderData.keyId,
    amount: orderData.amount,
    currency: orderData.currency,
    name: "DigitalGuru AI",
    description: "AI Digital Business eBook + Bonuses",
    image: "/assets/ebook-cover.jpg",
    order_id: orderData.orderId,
    prefill: {
      name: customerInfo.name,
      email: customerInfo.email,
      contact: customerInfo.phone
    },
    theme: {
      color: "#6366f1"
    },
    modal: {
      ondismiss: function() {
        const payBtn = document.getElementById('pay-submit-btn');
        if (payBtn) {
          payBtn.disabled = false;
          updatePriceDisplay();
        }
      }
    },
    handler: async function (response) {
      // response: razorpay_payment_id, razorpay_order_id, razorpay_signature
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
  rzp.on('payment.failed', function (response) {
    showError('भुगतान असफल रहा: ' + (response.error.description || 'कृपया दोबारा प्रयास करें।'));
    const payBtn = document.getElementById('pay-submit-btn');
    if (payBtn) {
      payBtn.disabled = false;
      updatePriceDisplay();
    }
  });
  rzp.open();
}

// Sandbox / Demo Simulation for instant testing before live keys
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
    // Direct simulate
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

// Verify Payment and Redirect to Success
async function verifyPaymentSuccess(verifyPayload) {
  const payBtn = document.getElementById('pay-submit-btn');
  if (payBtn) payBtn.innerHTML = '🔒 भुगतान सत्यापित हो रहा है...';

  try {
    const res = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verifyPayload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'सत्यापन असफल रहा।');
    }

    // Store customer details in sessionStorage
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

    // Redirect to Success Page with secure download tokens
    window.location.href = `/success?order_id=${encodeURIComponent(data.orderId)}&payment_id=${encodeURIComponent(data.paymentId)}&download_url=${encodeURIComponent(data.downloadUrl)}&bonus_url=${encodeURIComponent(data.bonusDownloadUrl)}`;

  } catch (err) {
    console.error('Verification failed:', err);
    showError(err.message || 'भुगतान सत्यापन में त्रुटि।');
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
  if (errorAlert) {
    errorAlert.style.display = 'none';
  }
}
