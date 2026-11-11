/**
 * End-to-end API test — runs against the live server on :3000
 * Node 18+ built-in fetch is used (no extra deps)
 */

const BASE = 'http://localhost:3000/api';
let passed = 0, failed = 0;
let testOrderId = null;

function ok(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? ' → ' + detail : ''}`);
    failed++;
  }
}

async function req(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

// ─────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('  Customer Order System — API Test Suite  ');
console.log('══════════════════════════════════════════\n');

// 1. Prices
console.log('① GET /api/prices');
{
  const r = await req('GET', '/prices');
  ok('Status 200',                r.status === 200);
  ok('success: true',             r.success === true);
  ok('Has frames price',          typeof r.prices?.frames === 'number');
  ok('Has bookmarks price',       typeof r.prices?.bookmarks === 'number');
}

// 2. Stats (empty db)
console.log('\n② GET /api/stats (empty)');
{
  const r = await req('GET', '/stats');
  ok('Status 200',      r.status === 200);
  ok('success: true',   r.success === true);
  ok('Has total_orders',typeof r.stats?.total_orders !== 'undefined');
}

// 3. Validation — missing name
console.log('\n③ POST /api/orders — validation: missing name');
{
  const r = await req('POST', '/orders', {
    phone_number: '9876543210', qty_frames: 1
  });
  ok('Status 422',      r.status === 422);
  ok('success: false',  r.success === false);
  ok('Has errors array',Array.isArray(r.errors));
}

// 4. Validation — bad phone
console.log('\n④ POST /api/orders — validation: bad phone');
{
  const r = await req('POST', '/orders', {
    customer_name: 'Test User', phone_number: '123', qty_bags: 2
  });
  ok('Status 422',         r.status === 422);
  ok('Phone error present',r.errors?.some(e => e.path === 'phone_number'));
}

// 5. Validation — no items
console.log('\n⑤ POST /api/orders — validation: zero items');
{
  const r = await req('POST', '/orders', {
    customer_name: 'Test User', phone_number: '9876543210'
  });
  ok('Status 422',      r.status === 422);
  ok('success: false',  r.success === false);
}

// 6. Valid order submission
console.log('\n⑥ POST /api/orders — valid submission');
{
  const r = await req('POST', '/orders', {
    customer_name: 'Priya Sharma',
    phone_number:  '9876543210',
    email:         'priya@example.com',
    qty_frames:    2,
    qty_bags:      1,
    qty_candles:   3,
    qty_keychains: 0,
    qty_bookmarks: 5,
    notes:         'Please pack carefully.',
  });
  ok('Status 201',              r.status === 201);
  ok('success: true',           r.success === true);
  ok('Has order_id',            typeof r.order?.order_id === 'string');
  ok('order_id starts ORD-',    r.order?.order_id?.startsWith('ORD-'));
  ok('total_qty = 11',          r.order?.total_qty === 11);
  // 2×150 + 1×200 + 3×120 + 5×50 = 300+200+360+250 = 1110
  ok('total_amount = 1110',     r.order?.total_amount === 1110);
  ok('submitted_at set',        !!r.order?.submitted_at);
  testOrderId = r.order?.order_id;
  console.log(`     → Created order: ${testOrderId}`);
}

// 7. Second order
console.log('\n⑦ POST /api/orders — second customer');
{
  const r = await req('POST', '/orders', {
    customer_name: 'Rahul Verma',
    phone_number:  '8765432109',
    qty_bags:      4,
    qty_keychains: 2,
  });
  ok('Status 201',    r.status === 201);
  ok('total_qty = 6', r.order?.total_qty === 6);
  // 4×200 + 2×80 = 800+160 = 960
  ok('total_amount = 960', r.order?.total_amount === 960);
}

// 8. GET all orders
console.log('\n⑧ GET /api/orders');
{
  const r = await req('GET', '/orders');
  ok('Status 200',              r.status === 200);
  ok('success: true',           r.success === true);
  ok('total >= 2',              r.total >= 2);
  ok('orders is array',         Array.isArray(r.orders));
  ok('orders.length > 0',       r.orders.length > 0);
}

// 9. GET single order
console.log('\n⑨ GET /api/orders/:id');
{
  const r = await req('GET', `/orders/${testOrderId}`);
  ok('Status 200',                    r.status === 200);
  ok('success: true',                 r.success === true);
  ok('customer_name matches',         r.order?.customer_name === 'Priya Sharma');
  ok('phone_number matches',          r.order?.phone_number  === '9876543210');
  ok('notes saved',                   r.order?.notes?.includes('carefully'));
}

// 10. Search
console.log('\n⑩ GET /api/orders?search=Priya');
{
  const r = await req('GET', '/orders?search=Priya');
  ok('Status 200',              r.status === 200);
  ok('Finds Priya',             r.orders?.some(o => o.customer_name === 'Priya Sharma'));
}

// 11. Search by phone
console.log('\n⑪ GET /api/orders?search=8765432109');
{
  const r = await req('GET', '/orders?search=8765432109');
  ok('Status 200',  r.status === 200);
  ok('Finds Rahul', r.orders?.some(o => o.customer_name === 'Rahul Verma'));
}

// 12. 404 for unknown order
console.log('\n⑫ GET /api/orders/ORD-NOTEXIST');
{
  const r = await req('GET', '/orders/ORD-NOTEXIST');
  ok('Status 404',     r.status === 404);
  ok('success: false', r.success === false);
}

// 13. Update order
console.log('\n⑬ PUT /api/orders/:id — edit quantities');
{
  const r = await req('PUT', `/orders/${testOrderId}`, {
    qty_frames:    4,
    qty_bags:      2,
    qty_candles:   1,
    qty_keychains: 0,
    qty_bookmarks: 0,
  });
  ok('Status 200',      r.status === 200);
  ok('success: true',   r.success === true);
  ok('total_qty = 7',   r.order?.total_qty === 7);
  // 4×150 + 2×200 + 1×120 = 600+400+120 = 1120
  ok('total_amount recalculated = 1120', r.order?.total_amount === 1120);
  ok('name unchanged',  r.order?.customer_name === 'Priya Sharma');
}

// 14. Stats after inserts
console.log('\n⑭ GET /api/stats — after inserts');
{
  const r = await req('GET', '/stats');
  ok('Status 200',               r.status === 200);
  ok('total_orders >= 2',        r.stats?.total_orders >= 2);
  ok('total_revenue > 0',        r.stats?.total_revenue > 0);
}

// 15. Export endpoint
console.log('\n⑮ GET /api/export — CSV download');
{
  const res = await fetch(`${BASE}/export`);
  const csv = await res.text();
  ok('Status 200',               res.status === 200);
  ok('Content-Type is CSV',      res.headers.get('content-type')?.includes('text/csv'));
  ok('Has CSV header row',       csv.includes('Order ID'));
  ok('Has customer data',        csv.includes('Priya Sharma') || csv.includes('Rahul Verma'));
}

// 16. Delete order
console.log('\n⑯ DELETE /api/orders/:id');
{
  const r = await req('DELETE', `/orders/${testOrderId}`);
  ok('Status 200',     r.status === 200);
  ok('success: true',  r.success === true);

  // Confirm it's gone
  const r2 = await req('GET', `/orders/${testOrderId}`);
  ok('Order no longer exists (404)', r2.status === 404);
}

// 17. Delete non-existent
console.log('\n⑰ DELETE /api/orders/ORD-GHOST — 404');
{
  const r = await req('DELETE', '/orders/ORD-GHOST');
  ok('Status 404',     r.status === 404);
  ok('success: false', r.success === false);
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════\n');
if (failed > 0) process.exit(1);
