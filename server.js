require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || 'http://localhost:' + PORT).replace(/\/$/, '');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || (IS_PRODUCTION ? '' : 'default_super_admin_key_replace_in_env');

// Trust only the single Nginx proxy; keep port 3000 private to the instance.
app.set('trust proxy', 1);

if (IS_PRODUCTION && (
  !/^[a-f0-9]{64}$/i.test(ADMIN_SECRET_KEY) ||
  ADMIN_SECRET_KEY === 'default_super_admin_key_replace_in_env' ||
  ADMIN_SECRET_KEY === 'change_this_to_a_super_secret_key_12345'
)) {
  throw new Error('Production requires ADMIN_SECRET_KEY to be a 64-character hex secret generated with openssl rand -hex 32.');
}

if (IS_PRODUCTION) {
  let siteUrl;
  try {
    siteUrl = new URL(SITE_URL);
  } catch {
    throw new Error('Production requires a valid HTTPS SITE_URL.');
  }
  if (siteUrl.protocol !== 'https:') {
    throw new Error('Production requires a valid HTTPS SITE_URL.');
  }
}

/* ==========================================================
   1. CYBERSECURITY HARDENING & HEADERS (Helmet & CSP)
   ========================================================== */
app.disable('x-powered-by');

// Strict Content Security Policy (CSP) allowing Razorpay, GA4, Meta Pixel, and Google Fonts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://checkout.razorpay.com",
        "https://www.googletagmanager.com",
        "https://www.google-analytics.com",
        "https://connect.facebook.net"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://www.facebook.com",
        "https://www.google-analytics.com",
        "https://*.google-analytics.com",
        "https://*.googletagmanager.com",
        "https://checkout.razorpay.com"
      ],
      connectSrc: [
        "'self'",
        "https://api.razorpay.com",
        "https://lumberjack.razorpay.com",
        "https://www.google-analytics.com",
        "https://*.google-analytics.com",
        "https://*.analytics.google.com",
        "https://*.googletagmanager.com",
        "https://www.facebook.com"
      ],
      frameSrc: [
        "'self'",
        "https://api.razorpay.com",
        "https://checkout.razorpay.com"
      ],
      // EC2's HTTP IP entry cannot load assets if browsers upgrade them to HTTPS.
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS Configuration with strict domain validation (prevents prefix spoofing)
app.use(cors({
  origin: (origin, callback) => {
    // In development or when no origin (like mobile app, curl, or same-origin), allow
    if (!origin || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    try {
      const originUrl = new URL(origin);
      const siteUrlObj = new URL(SITE_URL);
      const rootHost = siteUrlObj.hostname.replace(/^www\./, '');
      const allowedHosts = [rootHost, `www.${rootHost}`];

      if (allowedHosts.includes(originUrl.hostname) && originUrl.protocol === siteUrlObj.protocol) {
        return callback(null, true);
      }
    } catch {
      // Invalid URL format
    }
    return callback(new Error('CORS block by security policy'));
  },
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '50kb' })); // Body limit to prevent memory exhaustion attacks
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

/* ==========================================================
   2. RATE LIMITING (Anti-DDoS, Brute Force & Anti-Scraping)
   ========================================================== */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' }
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 35, // max 35 order creation/verifications per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Order attempt limit reached. Please try again later.' }
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // max 20 download attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Download limit reached. Please try again later or contact support.'
});

app.use(generalLimiter);

// Serve static frontend files safely
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  dotfiles: 'deny' // Deny access to hidden files like .git or .env
}));

/* ==========================================================
   3. ATOMIC & SAFE DATABASE OPERATIONS
   ========================================================== */
const DB_FILE = path.join(__dirname, 'orders.json');
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf8');
}

function getOrders() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading orders DB safely:', err.message);
    return [];
  }
}

function saveOrder(order) {
  try {
    const orders = getOrders();
    const existingIndex = orders.findIndex(o => o.orderId === order.orderId);
    if (existingIndex >= 0) {
      orders[existingIndex] = { ...orders[existingIndex], ...order, updatedAt: new Date().toISOString() };
    } else {
      orders.push({ ...order, createdAt: new Date().toISOString() });
    }
    // Atomic file write using unique temporary file to prevent collision on high concurrency
    const tempFile = path.join(__dirname, `.orders_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.tmp`);
    fs.writeFileSync(tempFile, JSON.stringify(orders, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (err) {
    console.error('Error saving order safely:', err.message);
    return false;
  }
}

/* ==========================================================
   4. RAZORPAY INITIALIZATION
   ========================================================== */
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const hasRazorpayKey = Boolean(RAZORPAY_KEY_ID);
const hasRazorpaySecret = Boolean(RAZORPAY_KEY_SECRET);
const hasPlaceholderKey = /sampleKey|YourTestKeyId|xxxxxxxx/i.test(RAZORPAY_KEY_ID);
const hasPlaceholderSecret = /YourTestKeySecret|xxxxxxxx/i.test(RAZORPAY_KEY_SECRET);
const isDemoMode = (!hasRazorpayKey && !hasRazorpaySecret) ||
  (hasPlaceholderKey && hasPlaceholderSecret);

if (hasRazorpayKey !== hasRazorpaySecret || (hasPlaceholderKey !== hasPlaceholderSecret)) {
  throw new Error('Configure both valid Razorpay credentials, or remove both credentials to use non-production demo mode.');
}

if (IS_PRODUCTION && (isDemoMode || !RAZORPAY_KEY_ID.startsWith('rzp_live_'))) {
  throw new Error('Production requires valid Razorpay Live credentials (rzp_live_ key ID and secret). Demo and Test credentials are disabled.');
}

if (!isDemoMode && !RAZORPAY_KEY_ID.startsWith('rzp_test_') && !RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
  throw new Error('Razorpay key ID must use the rzp_test_ or rzp_live_ prefix.');
}

const MAIN_DOWNLOAD_FILE = path.join(__dirname, 'downloads', 'AI-Digital-Business-Guide.pdf');
const BONUS_DOWNLOAD_FILE = path.join(__dirname, 'downloads', 'full_kit.zip');
if (IS_PRODUCTION && (!fs.existsSync(MAIN_DOWNLOAD_FILE) || !fs.existsSync(BONUS_DOWNLOAD_FILE))) {
  throw new Error('Production download files are missing. Check the downloads directory before starting the store.');
}

let razorpay = null;
if (!isDemoMode) {
  razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
  });
  console.log('✅ Razorpay initialized successfully.');
} else {
  if (IS_PRODUCTION) {
    throw new Error('Demo payments are not allowed in production.');
  }
  console.log('ℹ️ Running in Sandbox / Demo Mode. Add your Razorpay Key ID and Secret in .env for live transactions.');
}

// Product configuration
const PRODUCT_CONFIG = {
  name: process.env.PRODUCT_NAME || 'Start Your First Digital Business with AI',
  price: Number(process.env.PRODUCT_PRICE || '199'),
  mrp: Number(process.env.PRODUCT_MRP || '999'),
  currency: process.env.PRODUCT_CURRENCY || 'INR',
  orderBump: {
    enabled: process.env.ORDER_BUMP_ENABLED === 'true',
    title: process.env.ORDER_BUMP_TITLE || '🔥 Exclusive AI Prompt Vault (500+ Master Prompts)',
    price: Number(process.env.ORDER_BUMP_PRICE || '99')
  },
  support: {
    email: process.env.SUPPORT_EMAIL || 'support@skilldhan.shop',
    storeName: process.env.STORE_NAME || 'Skilldhan'
  },
  tracking: {
    gaMeasurementId: (process.env.GA_MEASUREMENT_ID || '').trim(),
    metaPixelId: (process.env.META_PIXEL_ID || '').trim()
  }
};

if (
  !Number.isSafeInteger(PRODUCT_CONFIG.price) ||
  PRODUCT_CONFIG.price <= 0 ||
  !Number.isSafeInteger(PRODUCT_CONFIG.mrp) ||
  PRODUCT_CONFIG.mrp < PRODUCT_CONFIG.price ||
  !Number.isSafeInteger(PRODUCT_CONFIG.orderBump.price) ||
  PRODUCT_CONFIG.orderBump.price < 0 ||
  PRODUCT_CONFIG.currency !== 'INR'
) {
  throw new Error('Product prices must be valid whole INR amounts, and MRP must not be below the product price.');
}

/* ==========================================================
   5. SANITIZATION & VALIDATION HELPERS
   ========================================================== */
function sanitizeString(str, maxLen = 60) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>'"`;]/g, '').trim().slice(0, maxLen);
}

function isValidEmail(email) {
  if (typeof email !== 'string' || email.length > 100) return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

function isValidIndianPhone(phone) {
  if (typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\D/g, '');
  // 10 digits starting with 6, 7, 8, or 9
  return /^[6-9]\d{9}$/.test(cleaned);
}

/* ==========================================================
   6. API ROUTES
   ========================================================== */

// 1. Get Public Store Config (Including Tracking IDs for GA4 & Meta Pixel)
app.get('/api/config', (req, res) => {
  res.json({
    keyId: isDemoMode ? 'rzp_demo_key_12345' : RAZORPAY_KEY_ID,
    isDemoMode: isDemoMode,
    product: PRODUCT_CONFIG.name,
    basePrice: PRODUCT_CONFIG.price,
    mrp: PRODUCT_CONFIG.mrp,
    currency: PRODUCT_CONFIG.currency,
    orderBump: PRODUCT_CONFIG.orderBump,
    support: PRODUCT_CONFIG.support,
    tracking: PRODUCT_CONFIG.tracking
  });
});

app.get('/api/recent-purchases', (req, res) => {
  res.set('Cache-Control', 'no-store');

  if (!IS_PRODUCTION) {
    return res.json({ purchases: [] });
  }

  const recentCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const purchases = getOrders()
    .filter(order =>
      order.status === 'paid' &&
      order.isDemoMode === false &&
      order.paymentEnvironment === 'live' &&
      typeof order.paidAt === 'string' &&
      Number.isFinite(Date.parse(order.paidAt)) &&
      Date.parse(order.paidAt) >= recentCutoff
    )
    .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt))
    .slice(0, 8)
    .map(order => ({ paidAt: order.paidAt }));

  res.json({ purchases });
});

// 2. Create Order with Strict Input Validation & Server-Side Pricing Enforced
app.post('/api/create-order', paymentLimiter, async (req, res) => {
  try {
    const rawName = req.body.name;
    const rawEmail = req.body.email;
    const rawPhone = req.body.phone;
    const includeBump = req.body.includeBump === true && PRODUCT_CONFIG.orderBump.enabled;

    // Strict Validations
    const cleanName = sanitizeString(rawName, 60);
    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'Please enter a valid name (2 to 60 characters).'});
    }

    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const cleanEmail = rawEmail.trim().toLowerCase();

    if (!isValidIndianPhone(rawPhone)) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.' });
    }
    const cleanPhone = rawPhone.replace(/\D/g, '');

    // Server-enforced pricing (client CANNOT tamper with price)
    let finalAmount = PRODUCT_CONFIG.price;
    if (includeBump && PRODUCT_CONFIG.orderBump.enabled) {
      finalAmount += PRODUCT_CONFIG.orderBump.price;
    }

    const amountInPaise = finalAmount * 100;
    const receiptId = `rcpt_${Date.now().toString().slice(-8)}_${crypto.randomBytes(3).toString('hex')}`;

    let orderData = {
      orderId: '',
      amount: amountInPaise,
      currency: 'INR',
      keyId: isDemoMode ? 'rzp_demo_key_12345' : RAZORPAY_KEY_ID,
      isDemoMode: isDemoMode
    };

    if (!isDemoMode && razorpay) {
      const options = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: receiptId,
        notes: {
          customer_name: cleanName,
          customer_email: cleanEmail,
          customer_phone: cleanPhone,
          include_bump: includeBump ? 'yes' : 'no'
        }
      };

      const razorpayOrder = await razorpay.orders.create(options);
      orderData.orderId = razorpayOrder.id;
    } else {
      orderData.orderId = `order_demo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    // Save pending order with clean customer details
    const saved = saveOrder({
      orderId: orderData.orderId,
      receiptId,
      customer: { name: cleanName, email: cleanEmail, phone: cleanPhone },
      amount: finalAmount,
      currency: 'INR',
      includeBump: includeBump,
      status: 'pending',
      isDemoMode: isDemoMode,
      paymentEnvironment: IS_PRODUCTION ? 'live' : 'non-production'
    });
    if (!saved) {
      return res.status(500).json({ error: 'Could not save your order. Please try again.' });
    }

    res.json({
      success: true,
      orderId: orderData.orderId,
      amount: orderData.amount,
      currency: orderData.currency,
      keyId: orderData.keyId,
      isDemoMode: orderData.isDemoMode,
      customer: { name: cleanName, email: cleanEmail, phone: cleanPhone }
    });

  } catch (err) {
    console.error('Order creation error:', err.message);
    res.status(500).json({
      error: 'Could not create the order. Please try again.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 3. Verify Payment with Constant-Time Timing-Attack-Safe Signature Comparison
app.post('/api/verify-payment', paymentLimiter, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ error: 'Payment details are missing.' });
    }

    // Basic format validation
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(razorpay_order_id) || !/^[a-zA-Z0-9_-]{8,80}$/.test(razorpay_payment_id)) {
      return res.status(400).json({ error: 'Invalid order or payment ID format.' });
    }

    const orders = getOrders();
    let pendingOrder = orders.find(order => order.orderId === razorpay_order_id);
    if (!pendingOrder) {
      return res.status(403).json({ success: false, error: 'Order not found. Please create a new order.' });
    }
    if (IS_PRODUCTION && pendingOrder.paymentEnvironment !== 'live') {
      return res.status(403).json({ success: false, error: 'This order was not created in live payment mode.' });
    }

    if (isDemoMode) {
      if (IS_PRODUCTION || !pendingOrder.isDemoMode || !razorpay_order_id.startsWith('order_demo_')) {
        return res.status(403).json({ success: false, error: 'Demo orders are not accepted.' });
      }
    } else if (pendingOrder.isDemoMode || razorpay_order_id.startsWith('order_demo_')) {
      console.warn(`🚨 Security Alert: Blocked simulated demo orderId outside demo mode. IP: ${req.ip}`);
      return res.status(403).json({ success: false, error: 'Demo orders are not accepted.' });
    }

    if (pendingOrder.status === 'paid') {
      if (pendingOrder.paymentId !== razorpay_payment_id || !pendingOrder.downloadToken) {
        return res.status(409).json({ success: false, error: 'This order has already been completed.' });
      }

      return res.json({
        success: true,
        message: 'Payment already verified. Your eBook is ready.',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: pendingOrder.amount,
        downloadUrl: `/api/download?orderId=${encodeURIComponent(razorpay_order_id)}&token=${pendingOrder.downloadToken}`,
        bonusDownloadUrl: pendingOrder.includeBump
          ? `/api/download-bonus?orderId=${encodeURIComponent(razorpay_order_id)}&token=${pendingOrder.downloadToken}`
          : null
      });
    }

    if (pendingOrder.status !== 'pending') {
      return res.status(403).json({ success: false, error: 'This order is not eligible for download.' });
    }

    if (!isDemoMode) {
      // Timing-safe HMAC SHA-256 verification
      if (!razorpay_signature || typeof razorpay_signature !== 'string') {
        return res.status(400).json({ success: false, error: 'Payment signature is missing.' });
      }

      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(razorpay_signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        console.warn(`🚨 Security Alert: Failed signature verification attempt for Order: ${razorpay_order_id}`);
        return res.status(400).json({ success: false, error: 'Payment verification failed.' });
      }

      const expectedAmount = pendingOrder.amount * 100;
      const [razorpayOrder, payment] = await Promise.all([
        razorpay.orders.fetch(razorpay_order_id),
        razorpay.payments.fetch(razorpay_payment_id)
      ]);

      if (
        razorpayOrder.id !== razorpay_order_id ||
        razorpayOrder.amount !== expectedAmount ||
        razorpayOrder.amount_paid !== expectedAmount ||
        razorpayOrder.currency !== 'INR' ||
        razorpayOrder.status !== 'paid' ||
        payment.order_id !== razorpay_order_id ||
        payment.amount !== expectedAmount ||
        payment.currency !== 'INR' ||
        payment.status !== 'captured' ||
        payment.captured !== true
      ) {
        console.warn(`🚨 Security Alert: Payment amount/status mismatch for Order: ${razorpay_order_id}`);
        return res.status(403).json({ success: false, error: 'Payment is not fully captured for this order.' });
      }
    }

    pendingOrder = getOrders().find(order => order.orderId === razorpay_order_id);
    if (!pendingOrder) {
      return res.status(403).json({ success: false, error: 'Order not found. Please contact support.' });
    }
    if (pendingOrder.status === 'paid') {
      if (pendingOrder.paymentId !== razorpay_payment_id || !pendingOrder.downloadToken) {
        return res.status(409).json({ success: false, error: 'This order has already been completed.' });
      }

      return res.json({
        success: true,
        message: 'Payment already verified. Your eBook is ready.',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: pendingOrder.amount,
        downloadUrl: `/api/download?orderId=${encodeURIComponent(razorpay_order_id)}&token=${pendingOrder.downloadToken}`,
        bonusDownloadUrl: pendingOrder.includeBump
          ? `/api/download-bonus?orderId=${encodeURIComponent(razorpay_order_id)}&token=${pendingOrder.downloadToken}`
          : null
      });
    }
    if (pendingOrder.status !== 'pending') {
      return res.status(403).json({ success: false, error: 'This order is not eligible for download.' });
    }

    // Generate a cryptographically secure token for download authorization
    const downloadToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + (72 * 60 * 60 * 1000); // Valid for 72 hours

    // Update order status in atomic database
    const orderRecord = {
      ...pendingOrder,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature || 'demo_signature',
      status: 'paid',
      downloadToken: downloadToken,
      tokenExpiry: tokenExpiry,
      downloadCount: 0,
      maxDownloads: 10,
      customer: pendingOrder.customer,
      includeBump: pendingOrder.includeBump,
      paidAt: new Date().toISOString()
    };
    if (!saveOrder(orderRecord)) {
      return res.status(500).json({ success: false, error: 'Payment was received, but the order could not be saved. Contact support before retrying payment.' });
    }

    console.log(`🎉 Payment Verified: Order ${razorpay_order_id}, Payment ${razorpay_payment_id}`);

    res.json({
      success: true,
      message: 'Payment successful. Your eBook is ready.',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amount: pendingOrder.amount,
      downloadUrl: `/api/download?orderId=${encodeURIComponent(razorpay_order_id)}&token=${downloadToken}`,
      bonusDownloadUrl: pendingOrder.includeBump
        ? `/api/download-bonus?orderId=${encodeURIComponent(razorpay_order_id)}&token=${downloadToken}`
        : null
    });

  } catch (err) {
    console.error('Payment verification error:', err.message);
    res.status(500).json({
      error: 'There was a problem confirming your payment.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 4. Secure eBook Download with Token & Expiry Verification
app.get('/api/download', downloadLimiter, (req, res) => {
  const orderId = req.query.orderId;
  const token = req.query.token;

  if (!orderId || !token) {
    return res.status(400).send('Download token or order ID is missing.');
  }

  // Prevent directory traversal or regex injections
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(orderId) || !/^[a-zA-Z0-9]{32,80}$/.test(token)) {
    return res.status(400).send('Invalid download link.');
  }

  const orders = getOrders();
  const order = orders.find(o => o.orderId === orderId);

  // Validate paid status
  if (!order || order.status !== 'paid') {
    return res.status(403).send('Download not authorized: no valid payment found.');
  }

  // Verify secure token
  if (!matchesDownloadToken(order.downloadToken, token)) {
    return res.status(403).send('Invalid or expired security token. Please contact support.');
  }

  // Verify expiry time (72 hours limit)
  if (!Number.isFinite(order.tokenExpiry) || Date.now() > order.tokenExpiry) {
    return res.status(403).send('This download link expired after 72 hours. Contact support for assistance.');
  }
  if (IS_PRODUCTION && order.paymentEnvironment !== 'live') {
    return res.status(403).send('This order was not created in live payment mode.');
  }

  // Enforce maximum download limit (Anti-piracy / anti-sharing)
  const maxAllowed = order.maxDownloads || 10;
  if ((order.downloadCount || 0) >= maxAllowed) {
    return res.status(403).send(`Maximum download limit (${maxAllowed}) reached. Contact support for assistance.`);
  }

  // Increment download counter
  order.downloadCount = (order.downloadCount || 0) + 1;
  if (!saveOrder(order)) {
    return res.status(500).send('Could not authorize the download. Please try again or contact support.');
  }

  sendPaidDownload(res, MAIN_DOWNLOAD_FILE, 'AI-Digital-Business-Guide.pdf');
});

// 5. Secure Bonus Download with Token
app.get('/api/download-bonus', downloadLimiter, (req, res) => {
  const orderId = req.query.orderId;
  const token = req.query.token;

  if (!orderId || !token || !/^[a-zA-Z0-9_-]{8,80}$/.test(orderId) || !/^[a-zA-Z0-9]{32,80}$/.test(token)) {
    return res.status(400).send('Invalid bonus download request.');
  }

  const orders = getOrders();
  const order = orders.find(o => o.orderId === orderId);

  if (!order || order.status !== 'paid' || !order.includeBump || !matchesDownloadToken(order.downloadToken, token)) {
    return res.status(403).send('Bonus download not authorized.');
  }

  // Verify expiry time (72 hours limit)
  if (!Number.isFinite(order.tokenExpiry) || Date.now() > order.tokenExpiry) {
    return res.status(403).send('This bonus download link expired after 72 hours.');
  }
  if (IS_PRODUCTION && order.paymentEnvironment !== 'live') {
    return res.status(403).send('This order was not created in live payment mode.');
  }

  // Enforce maximum download limit on bonus
  const maxAllowed = order.maxDownloads || 10;
  if ((order.bonusDownloadCount || 0) >= maxAllowed) {
    return res.status(403).send(`Maximum bonus download limit (${maxAllowed}) reached.`);
  }

  order.bonusDownloadCount = (order.bonusDownloadCount || 0) + 1;
  if (!saveOrder(order)) {
    return res.status(500).send('Could not authorize the bonus download. Please try again or contact support.');
  }

  sendPaidDownload(res, BONUS_DOWNLOAD_FILE, 'Exclusive-AI-Prompt-Vault.zip');
});

function sendPaidDownload(res, filePath, filename) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Download file is unavailable. Please contact support.');
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(filePath, filename, err => {
    if (!err) return;
    console.error('Download stream error:', err.message);
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    res.status(500).send('Could not complete the download. Please try again or contact support.');
  });
}

function matchesDownloadToken(storedToken, providedToken) {
  if (typeof storedToken !== 'string' || typeof providedToken !== 'string') return false;
  const stored = Buffer.from(storedToken, 'utf8');
  const provided = Buffer.from(providedToken, 'utf8');
  return stored.length === 64 && stored.length === provided.length && crypto.timingSafeEqual(stored, provided);
}

// Timing-safe comparison to prevent side-channel timing attacks
function safeCompareAdminKey(providedKey, expectedKey) {
  if (typeof providedKey !== 'string' || typeof expectedKey !== 'string') return false;
  const p = providedKey.trim();
  const e = expectedKey.trim();
  if (!p || !e) return false;
  const provBuf = Buffer.from(p, 'utf8');
  const expBuf = Buffer.from(e, 'utf8');
  if (provBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(provBuf, expBuf);
}

// 6. PROTECTED Admin Orders Endpoint (Requires Secret Admin Key)
app.get('/api/orders', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const queryKey = req.query.key || '';

  let clientKey = '';
  if (authHeader.startsWith('Bearer ')) {
    clientKey = authHeader.slice(7);
  } else if (!IS_PRODUCTION && typeof queryKey === 'string') {
    clientKey = queryKey;
  }

  const isAuthorized = safeCompareAdminKey(clientKey, ADMIN_SECRET_KEY);

  if (!isAuthorized) {
    // Return 403 Forbidden to protect customer PII data
    return res.status(403).json({
      error: 'Access denied. The administrator key is invalid.'
    });
  }

  const orders = getOrders();
  res.json({
    totalOrders: orders.length,
    orders: orders.slice(-50).reverse()
  });
});

/* ==========================================================
   7. SEO FILES (robots.txt & sitemap.xml)
   ========================================================== */
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /downloads/
Sitemap: ${SITE_URL}/sitemap.xml
`);
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
  </url>
  <url>
    <loc>${SITE_URL}/terms</loc>
  </url>
  <url>
    <loc>${SITE_URL}/privacy</loc>
  </url>
</urlset>`);
});

// Page Routes (HTML Fallbacks)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// Global Error Handler: Prevents leaking stack traces or internal implementation details
app.use((err, req, res, next) => {
  if (err.message === 'CORS block by security policy') {
    return res.status(403).json({ error: 'Request blocked by the cross-origin security policy.' });
  }
  console.error('Unhandled Server Error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🛡️ Digital Store Server Running with Enhanced Cybersecurity`);
  console.log(`🚀 Port: ${PORT} | Site URL: ${SITE_URL}`);
  console.log(`💳 Razorpay Mode: ${isDemoMode ? 'DEMO / SANDBOX (Simulated)' : 'LIVE'}`);
  console.log(`📊 Google Analytics: ${PRODUCT_CONFIG.tracking.gaMeasurementId || 'Off'}`);
  console.log(`📱 Meta Pixel: ${PRODUCT_CONFIG.tracking.metaPixelId || 'Off'}`);
  console.log(`🔒 Helmet, CSP, Rate Limits & Tokenized Downloads Active`);
  console.log(`=======================================================`);
});
