/**
 * Customer Order Management System — Express API Server
 * Runs on http://localhost:3000
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, param, query, validationResult } = require('express-validator');

const db = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Pricing (server-authoritative) ──────────────────────────────────────────
const PRICES = {
  frames:    150,
  bags:      200,
  candles:   120,
  keychains:  80,
  bookmarks:  50,
};

function calcTotals(body) {
  const frames    = Math.max(0, parseInt(body.qty_frames    ?? 0, 10) || 0);
  const bags      = Math.max(0, parseInt(body.qty_bags      ?? 0, 10) || 0);
  const candles   = Math.max(0, parseInt(body.qty_candles   ?? 0, 10) || 0);
  const keychains = Math.max(0, parseInt(body.qty_keychains ?? 0, 10) || 0);
  const bookmarks = Math.max(0, parseInt(body.qty_bookmarks ?? 0, 10) || 0);

  const total_qty = frames + bags + candles + keychains + bookmarks;
  const total_amount =
    frames    * PRICES.frames    +
    bags      * PRICES.bags      +
    candles   * PRICES.candles   +
    keychains * PRICES.keychains +
    bookmarks * PRICES.bookmarks;

  return { frames, bags, candles, keychains, bookmarks, total_qty, total_amount };
}

// ─── Validation helpers ───────────────────────────────────────────────────────
function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /api/prices — return current product prices */
app.get('/api/prices', (_req, res) => {
  res.json({ success: true, prices: PRICES });
});

/** GET /api/stats — dashboard counters */
app.get('/api/stats', async (_req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/orders — submit a new order */
app.post(
  '/api/orders',
  [
    body('customer_name')
      .trim().notEmpty().withMessage('Customer name is required')
      .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer'),
    body('phone_number')
      .trim().notEmpty().withMessage('Phone number is required')
      .matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits'),
    body('email')
      .optional({ checkFalsy: true })
      .isEmail().withMessage('Please enter a valid email address'),
    body('qty_frames').optional().isInt({ min: 0 }).withMessage('Frames quantity must be 0 or more'),
    body('qty_bags').optional().isInt({ min: 0 }).withMessage('Bags quantity must be 0 or more'),
    body('qty_candles').optional().isInt({ min: 0 }).withMessage('Candles quantity must be 0 or more'),
    body('qty_keychains').optional().isInt({ min: 0 }).withMessage('Key chains quantity must be 0 or more'),
    body('qty_bookmarks').optional().isInt({ min: 0 }).withMessage('Bookmarks quantity must be 0 or more'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;

    const { frames, bags, candles, keychains, bookmarks, total_qty, total_amount } = calcTotals(req.body);

    if (total_qty === 0) {
      return res.status(422).json({ success: false, errors: [{ msg: 'Please order at least one item.' }] });
    }

    const order = {
      order_id:      `ORD-${uuidv4().split('-')[0].toUpperCase()}`,
      customer_name: req.body.customer_name.trim(),
      phone_number:  req.body.phone_number.trim(),
      email:         req.body.email?.trim() || null,
      qty_frames:    frames,
      qty_bags:      bags,
      qty_candles:   candles,
      qty_keychains: keychains,
      qty_bookmarks: bookmarks,
      total_qty,
      total_amount,
      submitted_at:  new Date().toISOString(),
      notes:         req.body.notes?.trim() || null,
    };

    try {
      const saved = await db.insertOrder(order);
      res.status(201).json({ success: true, message: 'Order placed successfully!', order: saved });
    } catch (err) {
      if (err.message?.includes('UNIQUE')) {
        return res.status(409).json({ success: false, message: 'Duplicate order detected. Please try again.' });
      }
      res.status(500).json({ success: false, message: 'Failed to save order. Please try again.' });
    }
  }
);

/** GET /api/orders — list orders with optional search / date filter / pagination */
app.get(
  '/api/orders',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const result = await db.getAllOrders({
        search:   req.query.search   || '',
        dateFrom: req.query.dateFrom || '',
        dateTo:   req.query.dateTo   || '',
        page:     parseInt(req.query.page  || '1', 10),
        limit:    parseInt(req.query.limit || '50', 10),
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/** GET /api/orders/:orderId — single order */
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const order = await db.getOrderById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** PUT /api/orders/:orderId — update an order */
app.put(
  '/api/orders/:orderId',
  [
    body('customer_name').optional().trim().notEmpty().withMessage('Customer name cannot be empty'),
    body('phone_number').optional().trim().matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
    body('qty_frames').optional().isInt({ min: 0 }),
    body('qty_bags').optional().isInt({ min: 0 }),
    body('qty_candles').optional().isInt({ min: 0 }),
    body('qty_keychains').optional().isInt({ min: 0 }),
    body('qty_bookmarks').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const existing = await db.getOrderById(req.params.orderId);
      if (!existing) return res.status(404).json({ success: false, message: 'Order not found.' });

      // Merge quantities from existing + updated fields then recalculate
      const merged = {
        qty_frames:    req.body.qty_frames    ?? existing.qty_frames,
        qty_bags:      req.body.qty_bags      ?? existing.qty_bags,
        qty_candles:   req.body.qty_candles   ?? existing.qty_candles,
        qty_keychains: req.body.qty_keychains ?? existing.qty_keychains,
        qty_bookmarks: req.body.qty_bookmarks ?? existing.qty_bookmarks,
      };
      const { total_qty, total_amount } = calcTotals({
        qty_frames: merged.qty_frames, qty_bags: merged.qty_bags,
        qty_candles: merged.qty_candles, qty_keychains: merged.qty_keychains,
        qty_bookmarks: merged.qty_bookmarks,
      });

      const fields = {
        ...(req.body.customer_name !== undefined && { customer_name: req.body.customer_name.trim() }),
        ...(req.body.phone_number  !== undefined && { phone_number:  req.body.phone_number.trim()  }),
        ...(req.body.email         !== undefined && { email:         req.body.email?.trim() || '' }),
        ...(req.body.notes         !== undefined && { notes:         req.body.notes?.trim() || '' }),
        ...merged,
        total_qty,
        total_amount,
      };

      const updated = await db.updateOrder(req.params.orderId, fields);
      res.json({ success: true, message: 'Order updated successfully.', order: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/** DELETE /api/orders/:orderId — delete an order */
app.delete('/api/orders/:orderId', async (req, res) => {
  try {
    const existing = await db.getOrderById(req.params.orderId);
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found.' });
    await db.deleteOrder(req.params.orderId);
    res.json({ success: true, message: 'Order deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** GET /api/export — download all orders as CSV */
app.get('/api/export', async (_req, res) => {
  try {
    const orders = await db.exportAllOrders();

    const headers = [
      'Order ID','Customer Name','Phone Number','Email',
      'Frames','Bags','Candles','Key Chains','Bookmarks',
      'Total Qty','Total Amount (₹)','Submitted At','Notes'
    ];

    const escape = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = orders.map(o => [
      o.order_id, o.customer_name, o.phone_number, o.email ?? '',
      o.qty_frames, o.qty_bags, o.qty_candles, o.qty_keychains, o.qty_bookmarks,
      o.total_qty, o.total_amount, o.submitted_at, o.notes ?? ''
    ].map(escape).join(','));

    const csv = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${Date.now()}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8 compatibility
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SPA fallback — serve index.html for unknown routes ──────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Customer Order System running at http://localhost:${PORT}`);
  console.log(`   Order Form  → http://localhost:${PORT}/`);
  console.log(`   Admin Panel → http://localhost:${PORT}/admin.html\n`);
});
