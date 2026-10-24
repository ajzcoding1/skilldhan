const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = Buffer.alloc(0);
      res.on('data', chunk => { body = Buffer.concat([body, chunk]); });
      res.on('end', () => {
        const raw = body.toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(raw), raw });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

let PASS = 0, FAIL = 0;
function assert(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✅ PASS: ${label}`);
    PASS++;
  } else {
    console.log(`  ❌ FAIL: ${label} ${detail}`);
    FAIL++;
  }
}

async function runTests() {
  console.log('\n══════════════════════════════════════════');
  console.log(' SECURITY & INTEGRATION TEST SUITE');
  console.log('══════════════════════════════════════════\n');

  // ── 1. Config Endpoint ──────────────────────────
  console.log('① /api/config');
  const cfg = await request({ host: 'localhost', port: 3000, path: '/api/config', method: 'GET' });
  assert('Returns 200', cfg.status === 200);
  assert('Has keyId', !!cfg.data.keyId);
  assert('isDemoMode flag present', 'isDemoMode' in cfg.data);
  assert('Tracking object present', !!cfg.data.tracking);

  // ── 2. Create Order - Valid Input ───────────────
  console.log('\n② /api/create-order  [valid input]');
  const orderRes = await request(
    { host: 'localhost', port: 3000, path: '/api/create-order', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210', includeBump: true }
  );
  assert('Returns 200', orderRes.status === 200);
  assert('Has orderId', !!orderRes.data.orderId);
  assert('Amount = 29800 paise (₹298 with bump)', orderRes.data.amount === 29800, `got ${orderRes.data.amount}`);
  const orderId = orderRes.data.orderId;

  // ── 3. XSS / Injection Attack on name field ─────
  console.log('\n③ /api/create-order  [XSS injection attempt on name]');
  const xssRes = await request(
    { host: 'localhost', port: 3000, path: '/api/create-order', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { name: '<script>alert(1)</script>', email: 'test@test.com', phone: '9876543210' }
  );
  assert('Rejects or sanitizes XSS name', xssRes.status === 400 || (xssRes.data?.success && !xssRes.data?.customer?.name?.includes('<script>')), `status=${xssRes.status}`);

  // ── 4. Invalid Phone Validation ─────────────────
  console.log('\n④ /api/create-order  [invalid phone — 5 digits]');
  const badPhone = await request(
    { host: 'localhost', port: 3000, path: '/api/create-order', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { name: 'Test User', email: 'test@example.com', phone: '12345' }
  );
  assert('Rejects invalid Indian phone', badPhone.status === 400, `got ${badPhone.status}`);

  // ── 5. Verify Payment ───────────────────────────
  console.log('\n⑤ /api/verify-payment  [valid demo]');
  const verifyRes = await request(
    { host: 'localhost', port: 3000, path: '/api/verify-payment', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { razorpay_order_id: orderId, razorpay_payment_id: 'pay_test_ABCDE12345', razorpay_signature: 'demo_sig', customer: { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210' }, includeBump: true }
  );
  assert('Returns 200', verifyRes.status === 200);
  assert('success: true', verifyRes.data?.success === true);
  assert('Has secure downloadUrl with token', verifyRes.data?.downloadUrl?.includes('token='));
  const downloadUrl = verifyRes.data.downloadUrl;
  const bonusUrl    = verifyRes.data.bonusDownloadUrl;

  // ── 6. Download with valid token ────────────────
  console.log('\n⑥ /api/download  [valid token]');
  const dlRes = await request({ host: 'localhost', port: 3000, path: downloadUrl, method: 'GET' });
  assert('Returns 200', dlRes.status === 200);
  assert('Content-Type is PDF', dlRes.headers['content-type']?.includes('pdf'), `got ${dlRes.headers['content-type']}`);
  assert('X-Content-Type-Options set', dlRes.headers['x-content-type-options'] === 'nosniff');

  // ── 7. Download with WRONG token (security check) ───
  console.log('\n⑦ /api/download  [wrong/fake token — must block]');
  const fakeUrl = `/api/download?orderId=${encodeURIComponent(orderId)}&token=fakebadtoken0000000000000000000000`;
  const fakeRes = await request({ host: 'localhost', port: 3000, path: fakeUrl, method: 'GET' });
  assert('Blocks fake token with 403', fakeRes.status === 403, `got ${fakeRes.status}`);

  // ── 8. Download WITHOUT token ───────────────────
  console.log('\n⑧ /api/download  [no token — must block]');
  const noTokenRes = await request({ host: 'localhost', port: 3000, path: `/api/download?orderId=${encodeURIComponent(orderId)}`, method: 'GET' });
  assert('Blocks missing token with 400/403', [400, 403].includes(noTokenRes.status), `got ${noTokenRes.status}`);

  // ── 9. Admin Orders - Unauthorized Access ───────
  console.log('\n⑨ /api/orders  [no admin key — must block]');
  const adminNoKey = await request({ host: 'localhost', port: 3000, path: '/api/orders', method: 'GET' });
  assert('Blocks unauthenticated access with 403', adminNoKey.status === 403, `got ${adminNoKey.status}`);

  // ── 10. Admin Orders - Authorized Access ────────
  console.log('\n⑩ /api/orders  [with admin key — must allow]');
  const adminAuth = await request({ host: 'localhost', port: 3000, path: '/api/orders?key=admin_sec_secure_key_998877', method: 'GET' });
  assert('Allows admin access with correct key', adminAuth.status === 200, `got ${adminAuth.status}`);
  assert('Has totalOrders field', typeof adminAuth.data?.totalOrders === 'number');

  // ── 11. Verify Payment with tampered orderId format ─
  console.log('\n⑪ /api/verify-payment  [path traversal / injection orderId]');
  const tamperRes = await request(
    { host: 'localhost', port: 3000, path: '/api/verify-payment', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { razorpay_order_id: '../../../etc/passwd', razorpay_payment_id: 'pay_hack', razorpay_signature: 'sig' }
  );
  assert('Blocks malformed orderId (400)', tamperRes.status === 400, `got ${tamperRes.status}`);

  // ── 12. Robots.txt & Sitemap ─────────────────────
  console.log('\n⑫ SEO: robots.txt & sitemap.xml');
  const robots = await request({ host: 'localhost', port: 3000, path: '/robots.txt', method: 'GET' });
  assert('robots.txt returns 200', robots.status === 200);
  assert('Disallows /api/', robots.raw?.includes('Disallow: /api/'));
  const sitemap = await request({ host: 'localhost', port: 3000, path: '/sitemap.xml', method: 'GET' });
  assert('sitemap.xml returns 200', sitemap.status === 200);
  assert('sitemap.xml contains <urlset>', sitemap.raw?.includes('<urlset'));

  // ── 13. Static Pages Serve ────────────────────────
  console.log('\n⑬ Static HTML Pages');
  const home = await request({ host: 'localhost', port: 3000, path: '/', method: 'GET' });
  assert('Home / serves 200', home.status === 200);
  assert('Home has SEO meta description', home.raw?.includes('og:description'));
  assert('Home has JSON-LD schema', home.raw?.includes('application/ld+json'));
  const checkout = await request({ host: 'localhost', port: 3000, path: '/checkout', method: 'GET' });
  assert('Checkout /checkout serves 200', checkout.status === 200);
  assert('Checkout has noindex', checkout.raw?.includes('noindex'));
  const success = await request({ host: 'localhost', port: 3000, path: '/success', method: 'GET' });
  assert('Success /success serves 200', success.status === 200);

  // ── Summary ───────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log(` RESULTS: ${PASS} Passed   ${FAIL} Failed`);
  console.log('══════════════════════════════════════════\n');
  if (FAIL === 0) console.log('🎉 ALL SECURITY & SEO TESTS PASSED!');
  else console.log(`⚠️  ${FAIL} test(s) need attention.`);
}

runTests().catch(console.error);
