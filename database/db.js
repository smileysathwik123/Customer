/**
 * Database layer using sql.js (pure JavaScript SQLite)
 * Persists data to disk as a binary .sqlite file
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'orders.sqlite');

let _db = null;

/** Load or create the SQLite database, run migrations, return instance */
async function getDb() {
  if (_db) return _db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id      TEXT    NOT NULL UNIQUE,
      customer_name TEXT    NOT NULL,
      phone_number  TEXT    NOT NULL,
      email         TEXT,
      qty_frames    INTEGER NOT NULL DEFAULT 0,
      qty_bags      INTEGER NOT NULL DEFAULT 0,
      qty_candles   INTEGER NOT NULL DEFAULT 0,
      qty_keychains INTEGER NOT NULL DEFAULT 0,
      qty_bookmarks INTEGER NOT NULL DEFAULT 0,
      total_qty     INTEGER NOT NULL DEFAULT 0,
      total_amount  REAL    NOT NULL DEFAULT 0,
      submitted_at  TEXT    NOT NULL,
      notes         TEXT
    )
  `);

  persist(_db);
  return _db;
}

/** Write the in-memory database back to disk */
function persist(db) {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/** Convert sql.js result rows to plain objects */
function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );
}

// ─── CRUD helpers ────────────────────────────────────────────────────────────

async function insertOrder(order) {
  const db = await getDb();

  // Accept plain keys — prefix with @ for sql.js named params
  const bound = {};
  for (const [k, v] of Object.entries(order)) {
    bound[k.startsWith('@') ? k : `@${k}`] = v;
  }

  // Resolve the order_id regardless of whether it was passed with or without @
  const orderId = order.order_id ?? order['@order_id'];

  const stmt = db.prepare(`
    INSERT INTO orders
      (order_id, customer_name, phone_number, email,
       qty_frames, qty_bags, qty_candles, qty_keychains, qty_bookmarks,
       total_qty, total_amount, submitted_at, notes)
    VALUES
      (@order_id, @customer_name, @phone_number, @email,
       @qty_frames, @qty_bags, @qty_candles, @qty_keychains, @qty_bookmarks,
       @total_qty, @total_amount, @submitted_at, @notes)
  `);
  stmt.run(bound);
  stmt.free();
  persist(db);

  // Return the inserted row
  const rows = rowsToObjects(
    db.exec(`SELECT * FROM orders WHERE order_id = '${orderId.replace(/'/g, "''")}'`)
  );
  return rows[0];
}

async function getAllOrders({ search = '', dateFrom = '', dateTo = '', page = 1, limit = 50 } = {}) {
  const db = await getDb();

  let where = 'WHERE 1=1';
  if (search) {
    const s = search.replace(/'/g, "''");
    where += ` AND (customer_name LIKE '%${s}%' OR phone_number LIKE '%${s}%' OR order_id LIKE '%${s}%')`;
  }
  if (dateFrom) where += ` AND DATE(submitted_at) >= '${dateFrom}'`;
  if (dateTo)   where += ` AND DATE(submitted_at) <= '${dateTo}'`;

  const countResult = db.exec(`SELECT COUNT(*) as total FROM orders ${where}`);
  const total = countResult[0]?.values[0][0] ?? 0;

  const offset = (page - 1) * limit;
  const rows = rowsToObjects(
    db.exec(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`)
  );

  return { orders: rows, total, page, limit };
}

async function getOrderById(orderId) {
  const db = await getDb();
  const rows = rowsToObjects(
    db.exec(`SELECT * FROM orders WHERE order_id = '${orderId.replace(/'/g, "''")}'`)
  );
  return rows[0] || null;
}

async function updateOrder(orderId, fields) {
  const db = await getDb();
  const allowed = [
    'customer_name','phone_number','email',
    'qty_frames','qty_bags','qty_candles','qty_keychains','qty_bookmarks',
    'total_qty','total_amount','notes'
  ];
  const sets = Object.keys(fields)
    .filter(k => allowed.includes(k))
    .map(k => {
      const v = typeof fields[k] === 'string'
        ? `'${fields[k].replace(/'/g, "''")}'`
        : fields[k];
      return `${k} = ${v}`;
    })
    .join(', ');

  if (!sets) throw new Error('No valid fields to update');

  db.run(`UPDATE orders SET ${sets} WHERE order_id = '${orderId.replace(/'/g, "''")}'`);
  persist(db);
  return getOrderById(orderId);
}

async function deleteOrder(orderId) {
  const db = await getDb();
  db.run(`DELETE FROM orders WHERE order_id = '${orderId.replace(/'/g, "''")}'`);
  persist(db);
  return true;
}

async function getStats() {
  const db = await getDb();
  const rows = rowsToObjects(
    db.exec(`
      SELECT
        COUNT(*)           AS total_orders,
        COUNT(DISTINCT customer_name || phone_number) AS total_customers,
        COALESCE(SUM(total_amount), 0)  AS total_revenue,
        COALESCE(SUM(total_qty), 0)     AS total_items
      FROM orders
    `)
  );
  return rows[0];
}

async function exportAllOrders() {
  const db = await getDb();
  return rowsToObjects(db.exec('SELECT * FROM orders ORDER BY id DESC'));
}

module.exports = { insertOrder, getAllOrders, getOrderById, updateOrder, deleteOrder, getStats, exportAllOrders };
