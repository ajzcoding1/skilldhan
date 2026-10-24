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
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'default_super_admin_key_replace_in_env';

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
      ]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    // In development or when no origin (like mobile/same origin), allow
    if (!origin || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // In production, match SITE_URL
    if (origin.startsWith(SITE_URL)) {
      return callback(null, true);
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
  message: { error: 'बहुत अधिक अनुरोध (Too many requests). कृपया 15 मिनट बाद पुनः प्रयास करें।' }
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 35, // max 35 order creation/verifications per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'सुरक्षा सीमा: बहुत अधिक ऑर्डर प्रयास। कृपया कुछ मिनट प्रतीक्षा करें।' }
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // max 20 download attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: 'डाउनलोड सीमा पार हो गई है। कृपया सहायता के लिए व्हाट्सएप सपोर्ट से संपर्क करें।'
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
    // Atomic file write using temporary file to prevent corruption on crash
    const tempFile = `${DB_FILE}.${Date.now()}.tmp`;
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

const isDemoMode = !RAZORPAY_KEY_ID || 
                   RAZORPAY_KEY_ID.includes('sampleKey') || 
                   RAZORPAY_KEY_ID.includes('YourTestKeyId');

let razorpay = null;
if (!isDemoMode) {
  try {
    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay initialized successfully with Key ID:', RAZORPAY_KEY_ID);
  } catch (err) {
    console.warn('⚠️ Razorpay initialization warning:', err.message);
  }
} else {
  console.log('ℹ️ Running in Sandbox / Demo Mode. Add your Razorpay Key ID and Secret in .env for live transactions.');
}

// Product configuration
const PRODUCT_CONFIG = {
  name: process.env.PRODUCT_NAME || 'AI की मदद से अपना पहला डिजिटल बिज़नेस',
  price: parseInt(process.env.PRODUCT_PRICE || '199', 10),
  mrp: parseInt(process.env.PRODUCT_MRP || '999', 10),
  currency: process.env.PRODUCT_CURRENCY || 'INR',
  orderBump: {
    enabled: process.env.ORDER_BUMP_ENABLED === 'true',
    title: process.env.ORDER_BUMP_TITLE || '🔥 Exclusive AI Prompt Vault (500+ Master Prompts)',
    price: parseInt(process.env.ORDER_BUMP_PRICE || '99', 10)
  },
  support: {
    email: process.env.SUPPORT_EMAIL || 'support@mydigitalstore.com',
    whatsapp: process.env.SUPPORT_WHATSAPP || '+919876543210',
    storeName: process.env.STORE_NAME || 'DigitalGuru AI'
  },
  tracking: {
    gaMeasurementId: (process.env.GA_MEASUREMENT_ID || '').trim(),
    metaPixelId: (process.env.META_PIXEL_ID || '').trim()
  }
};

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

// 2. Create Order with Strict Input Validation & Server-Side Pricing Enforced
app.post('/api/create-order', paymentLimiter, async (req, res) => {
  try {
    const rawName = req.body.name;
    const rawEmail = req.body.email;
    const rawPhone = req.body.phone;
    const includeBump = req.body.includeBump === true;

    // Strict Validations
    const cleanName = sanitizeString(rawName, 60);
    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'कृपया अपना सही नाम दर्ज करें (2 से 60 अक्षर)।' });
    }

    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ error: 'कृपया एक वैध ईमेल पता दर्ज करें (Valid email required).' });
    }
    const cleanEmail = rawEmail.trim().toLowerCase();

    if (!isValidIndianPhone(rawPhone)) {
      return res.status(400).json({ error: 'कृपया 10 अंकों का वैध व्हाट्सएप मोबाइल नंबर दर्ज करें (Starts with 6-9).' });
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
    saveOrder({
      orderId: orderData.orderId,
      receiptId,
      customer: { name: cleanName, email: cleanEmail, phone: cleanPhone },
      amount: finalAmount,
      currency: 'INR',
      includeBump: includeBump,
      status: 'pending',
      isDemoMode: isDemoMode
    });

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
      error: 'ऑर्डर बनाने में समस्या हुई। कृपया पुनः प्रयास करें।',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 3. Verify Payment with Constant-Time Timing-Attack-Safe Signature Comparison
app.post('/api/verify-payment', paymentLimiter, (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      customer,
      includeBump
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ error: 'भुगतान विवरण गायब है (Payment details missing).' });
    }

    // Basic format validation
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(razorpay_order_id) || !/^[a-zA-Z0-9_-]{8,80}$/.test(razorpay_payment_id)) {
      return res.status(400).json({ error: 'अमान्य ऑर्डर या पेमेंट आईडी फॉर्मेट।' });
    }

    let isValid = false;

    if (isDemoMode || razorpay_order_id.startsWith('order_demo_')) {
      isValid = true;
    } else {
      // Timing-safe HMAC SHA-256 verification
      if (!razorpay_signature || typeof razorpay_signature !== 'string') {
        return res.status(400).json({ success: false, error: 'सिग्नेचर अनुपलब्ध है।' });
      }

      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(razorpay_signature, 'utf8');

      if (expectedBuf.length === actualBuf.length) {
        isValid = crypto.timingSafeEqual(expectedBuf, actualBuf);
      } else {
        isValid = false;
      }
    }

    if (!isValid) {
      console.warn(`🚨 Security Alert: Failed signature verification attempt for Order: ${razorpay_order_id}`);
      return res.status(400).json({ 
        success: false, 
        error: 'भुगतान सत्यापन असफल रहा (Signature verification failed)' 
      });
    }

    // Generate a cryptographically secure token for download authorization
    const downloadToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + (72 * 60 * 60 * 1000); // Valid for 72 hours

    // Update order status in atomic database
    const orderRecord = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature || 'demo_signature',
      status: 'paid',
      downloadToken: downloadToken,
      tokenExpiry: tokenExpiry,
      downloadCount: 0,
      maxDownloads: 10,
      customer: {
        name: sanitizeString(customer?.name || ''),
        email: (customer?.email || '').trim().toLowerCase(),
        phone: (customer?.phone || '').replace(/\D/g, '')
      },
      includeBump: !!includeBump,
      paidAt: new Date().toISOString()
    };
    saveOrder(orderRecord);

    console.log(`🎉 Payment Verified: Order ${razorpay_order_id}, Payment ${razorpay_payment_id}`);

    res.json({
      success: true,
      message: 'भुगतान सफल रहा! आपकी ई-बुक तैयार है।',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      downloadUrl: `/api/download?orderId=${encodeURIComponent(razorpay_order_id)}&token=${downloadToken}`,
      bonusDownloadUrl: `/api/download-bonus?orderId=${encodeURIComponent(razorpay_order_id)}&token=${downloadToken}`
    });

  } catch (err) {
    console.error('Payment verification error:', err.message);
    res.status(500).json({
      error: 'भुगतान की पुष्टि करने में समस्या आई।',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 4. Secure eBook Download with Token & Expiry Verification
app.get('/api/download', downloadLimiter, (req, res) => {
  const orderId = req.query.orderId;
  const token = req.query.token;

  if (!orderId || !token) {
    return res.status(400).send('डाउनलोड टोकन या ऑर्डर आईडी गायब है।');
  }

  // Prevent directory traversal or regex injections
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(orderId) || !/^[a-zA-Z0-9]{32,80}$/.test(token)) {
    return res.status(400).send('अमान्य डाउनलोड लिंक।');
  }

  const orders = getOrders();
  const order = orders.find(o => o.orderId === orderId);

  // Validate paid status
  if (!order || order.status !== 'paid') {
    return res.status(403).send('डाउनलोड अनुमति नहीं है: वैध भुगतान नहीं मिला।');
  }

  // Verify secure token
  if (order.downloadToken !== token) {
    return res.status(403).send('अमान्य या समाप्त सुरक्षा टोकन। कृपया सपोर्ट से संपर्क करें।');
  }

  // Verify expiry time
  if (order.tokenExpiry && Date.now() > order.tokenExpiry) {
    return res.status(403).send('यह डाउनलोड लिंक 72 घंटे बाद समाप्त हो चुका है। नया लिंक प्राप्त करने के लिए सपोर्ट पर लिखें।');
  }

  // Increment download counter
  order.downloadCount = (order.downloadCount || 0) + 1;
  saveOrder(order);

  const filePath = path.join(__dirname, 'downloads', 'AI-Digital-Business-Guide.pdf');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="AI-Digital-Business-Guide.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } else {
    res.status(404).send('फाइल सर्वर पर नहीं मिली। कृपया एडमिन से संपर्क करें।');
  }
});

// 5. Secure Bonus Download with Token
app.get('/api/download-bonus', downloadLimiter, (req, res) => {
  const orderId = req.query.orderId;
  const token = req.query.token;

  if (!orderId || !token || !/^[a-zA-Z0-9_-]{8,80}$/.test(orderId) || !/^[a-zA-Z0-9]{32,80}$/.test(token)) {
    return res.status(400).send('अमान्य बोनस डाउनलोड अनुरोध।');
  }

  const orders = getOrders();
  const order = orders.find(o => o.orderId === orderId);

  if (!order || order.status !== 'paid' || order.downloadToken !== token) {
    return res.status(403).send('बोनस डाउनलोड अनुमति नहीं है।');
  }

  const filePath = path.join(__dirname, 'downloads', '100-AI-Prompts-Vault.pdf');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="100-AI-Prompts-Vault.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } else {
    res.status(404).send('फाइल सर्वर पर नहीं मिली।');
  }
});

// 6. PROTECTED Admin Orders Endpoint (Requires Secret Admin Key)
app.get('/api/orders', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const queryKey = req.query.key || '';

  const isBearerAuthorized = authHeader === `Bearer ${ADMIN_SECRET_KEY}`;
  const isQueryAuthorized = queryKey === ADMIN_SECRET_KEY;

  if (!isBearerAuthorized && !isQueryAuthorized) {
    // Return 403 Forbidden to protect customer PII data
    return res.status(403).json({
      error: 'सुरक्षा प्रतिबंध: अनधिकृत पहुंच (Unauthorized). व्यवस्थापक कुंजी आवश्यक है।'
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
Allow: /checkout
Disallow: /api/
Disallow: /downloads/
Sitemap: ${SITE_URL}/sitemap.xml
`);
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  const today = new Date().toISOString().split('T')[0];
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/checkout</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${SITE_URL}/terms</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${SITE_URL}/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
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
