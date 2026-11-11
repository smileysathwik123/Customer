/**
 * Admin Dashboard — Frontend v2
 * Motion · Impeccable · Tasteskill
 */

const API = '/api';

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage   = 1;
const PAGE_LIMIT  = 20;
let currentSearch = '';
let currentFrom   = '';
let currentTo     = '';
let pendingDeleteId = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const tableBody    = document.getElementById('ordersTableBody');
const emptyState   = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const pagination   = document.getElementById('pagination');
const recordCount  = document.getElementById('recordCount');
const tableTitle   = document.getElementById('tableTitle');
const searchInput  = document.getElementById('searchInput');
const dateFrom     = document.getElementById('dateFrom');
const dateTo       = document.getElementById('dateTo');

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(isoStr));
  } catch { return isoStr; }
}

function formatDate_short(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(isoStr));
  } catch { return isoStr; }
}

function formatCurrency(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

// ── Animated counter ──────────────────────────────────────────────────────────
function animateCount(el, end, prefix = '', suffix = '', duration = 900) {
  if (!el) return;
  const start    = 0;
  const startTs  = performance.now();
  const isFloat  = !Number.isInteger(end);

  function step(now) {
    const p = Math.min((now - startTs) / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - p, 3);
    const val   = start + (end - start) * eased;
    el.textContent = prefix + (isFloat
      ? val.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      : Math.round(val).toLocaleString('en-IN')) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res  = await fetch(`${API}/stats`);
    const data = await res.json();
    if (!data.success) return;
    const s = data.stats;

    // Slight stagger so cards animate one after another
    setTimeout(() => animateCount(document.getElementById('stat-customers'), Number(s.total_customers || 0)), 0);
    setTimeout(() => animateCount(document.getElementById('stat-orders'),    Number(s.total_orders    || 0)), 100);
    setTimeout(() => animateCount(document.getElementById('stat-items'),     Number(s.total_items     || 0)), 200);
    setTimeout(() => animateCount(document.getElementById('stat-revenue'),   Number(s.total_revenue   || 0), '₹'), 300);
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ── Load orders ───────────────────────────────────────────────────────────────
async function loadOrders(page = 1) {
  currentPage = page;
  showLoading(true);

  const params = new URLSearchParams({
    page:  currentPage,
    limit: PAGE_LIMIT,
    ...(currentSearch && { search:   currentSearch }),
    ...(currentFrom   && { dateFrom: currentFrom   }),
    ...(currentTo     && { dateTo:   currentTo     }),
  });

  try {
    const res  = await fetch(`${API}/orders?${params}`);
    const data = await res.json();

    showLoading(false);
    if (!data.success) { showToast('Failed to load orders.', 'error'); return; }

    renderTable(data.orders);
    renderPagination(data.total, data.page, data.limit);
    recordCount.textContent = `${data.total} order${data.total !== 1 ? 's' : ''}`;
    tableTitle.textContent  = currentSearch || currentFrom || currentTo
      ? 'Search Results' : 'All Orders';
  } catch (err) {
    showLoading(false);
    showToast('Network error loading orders.', 'error');
  }
}

// ── Render table rows ─────────────────────────────────────────────────────────
function renderTable(orders) {
  if (!orders || orders.length === 0) {
    tableBody.innerHTML = '';
    emptyState.hidden   = false;
    return;
  }
  emptyState.hidden = true;

  tableBody.innerHTML = orders.map((o, i) => `
    <tr style="animation:fadeUp .3s cubic-bezier(.16,1,.3,1) ${i * 30}ms both">
      <td><span class="order-id-badge">${escHtml(o.order_id)}</span></td>
      <td title="${escHtml(o.customer_name)}" style="font-weight:600">${escHtml(o.customer_name)}</td>
      <td>${escHtml(o.phone_number)}</td>
      <td style="color:var(--ink-3)" title="${escHtml(o.email||'')}">
        ${o.email ? escHtml(o.email) : '<span style="color:var(--ink-4)">—</span>'}
      </td>
      <td class="col-num">${o.qty_frames}</td>
      <td class="col-num">${o.qty_bags}</td>
      <td class="col-num">${o.qty_candles}</td>
      <td class="col-num">${o.qty_keychains}</td>
      <td class="col-num">${o.qty_bookmarks}</td>
      <td class="col-num"><strong>${o.total_qty}</strong></td>
      <td class="col-num amount-cell">${formatCurrency(o.total_amount)}</td>
      <td style="font-size:.78rem;color:var(--ink-3);white-space:nowrap">${formatDate_short(o.submitted_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-action btn-view"   onclick="openViewModal('${escHtml(o.order_id)}')"   aria-label="View order ${escHtml(o.order_id)}">👁 View</button>
          <button class="btn-action btn-edit"   onclick="openEditModal('${escHtml(o.order_id)}')"   aria-label="Edit order ${escHtml(o.order_id)}">✏️ Edit</button>
          <button class="btn-action btn-delete" onclick="openDeleteModal('${escHtml(o.order_id)}','${escHtml(o.customer_name)}')" aria-label="Delete order ${escHtml(o.order_id)}">🗑 Del</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) { pagination.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="loadOrders(${page - 1})" aria-label="Previous page">‹</button>`;

  const start = Math.max(1, page - 2);
  const end   = Math.min(totalPages, page + 2);

  if (start > 1) {
    html += `<button class="page-btn" onclick="loadOrders(1)">1</button>`;
    if (start > 2) html += `<span style="padding:0 4px;color:var(--ink-4)">…</span>`;
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="loadOrders(${i})" aria-label="Page ${i}" ${i === page ? 'aria-current="page"' : ''}>${i}</button>`;
  }

  if (end < totalPages) {
    if (end < totalPages - 1) html += `<span style="padding:0 4px;color:var(--ink-4)">…</span>`;
    html += `<button class="page-btn" onclick="loadOrders(${totalPages})">${totalPages}</button>`;
  }

  html += `<button class="page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="loadOrders(${page + 1})" aria-label="Next page">›</button>`;
  pagination.innerHTML = html;
}

// ── Loading ───────────────────────────────────────────────────────────────────
function showLoading(show) {
  loadingState.hidden = !show;
  if (show) { tableBody.innerHTML = ''; emptyState.hidden = true; }
}

// ── Filter & Search ───────────────────────────────────────────────────────────
document.getElementById('filterBtn')?.addEventListener('click', () => {
  currentSearch = searchInput.value.trim();
  currentFrom   = dateFrom.value;
  currentTo     = dateTo.value;
  loadOrders(1);
});

document.getElementById('clearBtn')?.addEventListener('click', () => {
  searchInput.value = '';
  dateFrom.value    = '';
  dateTo.value      = '';
  currentSearch = currentFrom = currentTo = '';
  loadOrders(1);
});

searchInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('filterBtn')?.click();
});

// ── Export ────────────────────────────────────────────────────────────────────
document.getElementById('exportBtn')?.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = `${API}/export`;
  a.download = '';
  a.click();
  showToast('Export started — check your downloads.', 'info');
});

// ── View Modal ────────────────────────────────────────────────────────────────
const viewModal    = document.getElementById('viewModal');
const closeViewBtn = document.getElementById('closeViewModal');

async function openViewModal(orderId) {
  try {
    const res  = await fetch(`${API}/orders/${orderId}`);
    const data = await res.json();
    if (!data.success) { showToast('Could not load order.', 'error'); return; }

    const o = data.order;
    document.getElementById('viewModalContent').innerHTML = `
      <p class="view-section-title">Customer</p>
      <div class="view-grid">
        <div class="view-item">
          <span class="view-label">Order ID</span>
          <span class="view-value view-value--mono">${escHtml(o.order_id)}</span>
        </div>
        <div class="view-item">
          <span class="view-label">Date Placed</span>
          <span class="view-value">${formatDate(o.submitted_at)}</span>
        </div>
        <div class="view-item">
          <span class="view-label">Name</span>
          <span class="view-value" style="font-weight:600">${escHtml(o.customer_name)}</span>
        </div>
        <div class="view-item">
          <span class="view-label">Phone</span>
          <span class="view-value">${escHtml(o.phone_number)}</span>
        </div>
        <div class="view-item field-group--full">
          <span class="view-label">Email</span>
          <span class="view-value">${o.email ? escHtml(o.email) : '<span style="color:var(--ink-4)">—</span>'}</span>
        </div>
      </div>

      <p class="view-section-title">Products Ordered</p>
      <div class="view-products-grid">
        ${[
          { emoji:'🖼️', name:'Frames',     qty: o.qty_frames    },
          { emoji:'👜', name:'Bags',        qty: o.qty_bags      },
          { emoji:'🕯️',name:'Candles',     qty: o.qty_candles   },
          { emoji:'🔑', name:'Key Chains',  qty: o.qty_keychains },
          { emoji:'📖', name:'Bookmarks',   qty: o.qty_bookmarks },
        ].map(p => `
          <div class="view-product-item ${p.qty > 0 ? 'has-qty' : ''}">
            <span class="vp-emoji">${p.emoji}</span>
            <span class="vp-name">${p.name}</span>
            <span class="vp-qty">${p.qty}</span>
          </div>
        `).join('')}
      </div>

      <p class="view-section-title">Summary</p>
      <div class="view-grid">
        <div class="view-item">
          <span class="view-label">Total Items</span>
          <span class="view-value" style="font-size:1.2rem;font-weight:800">${o.total_qty}</span>
        </div>
        <div class="view-item">
          <span class="view-label">Total Amount</span>
          <span class="view-value view-value--big">${formatCurrency(o.total_amount)}</span>
        </div>
      </div>
      ${o.notes ? `
        <p class="view-section-title">Notes</p>
        <p style="font-size:.9rem;color:var(--ink-2);padding:.5rem 0;line-height:1.6">${escHtml(o.notes)}</p>
      ` : ''}
    `;
    viewModal.hidden = false;
    closeViewBtn?.focus();
  } catch {
    showToast('Network error.', 'error');
  }
}

closeViewBtn?.addEventListener('click', () => { viewModal.hidden = true; });
viewModal?.addEventListener('click', e => { if (e.target === viewModal) viewModal.hidden = true; });

// ── Edit Modal ────────────────────────────────────────────────────────────────
const editModal     = document.getElementById('editModal');
const editForm      = document.getElementById('editForm');
const closeEditBtn  = document.getElementById('closeEditModal');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const saveEditBtn   = document.getElementById('saveEditBtn');

async function openEditModal(orderId) {
  try {
    const res  = await fetch(`${API}/orders/${orderId}`);
    const data = await res.json();
    if (!data.success) { showToast('Could not load order.', 'error'); return; }
    const o = data.order;

    document.getElementById('edit-order-id').value  = o.order_id;
    document.getElementById('edit-name').value       = o.customer_name;
    document.getElementById('edit-phone').value      = o.phone_number;
    document.getElementById('edit-email').value      = o.email || '';
    document.getElementById('edit-frames').value     = o.qty_frames;
    document.getElementById('edit-bags').value       = o.qty_bags;
    document.getElementById('edit-candles').value    = o.qty_candles;
    document.getElementById('edit-keychains').value  = o.qty_keychains;
    document.getElementById('edit-bookmarks').value  = o.qty_bookmarks;
    document.getElementById('edit-notes').value      = o.notes || '';

    // Clear errors
    ['name','phone','email','global'].forEach(k => {
      const el = document.getElementById(`edit-err-${k}`);
      if (el) el.textContent = '';
    });
    document.querySelectorAll('#editForm input.error').forEach(el => el.classList.remove('error'));

    editModal.hidden = false;
    document.getElementById('edit-name')?.focus();
  } catch {
    showToast('Network error.', 'error');
  }
}

editForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const orderId = document.getElementById('edit-order-id').value;
  const name    = document.getElementById('edit-name').value.trim();
  const phone   = document.getElementById('edit-phone').value.trim();
  const email   = document.getElementById('edit-email').value.trim();

  // Client validation
  let valid = true;
  ['name','phone','email','global'].forEach(k => {
    const el = document.getElementById(`edit-err-${k}`);
    if (el) el.textContent = '';
  });
  document.querySelectorAll('#editForm input.error').forEach(el => el.classList.remove('error'));

  if (!name) {
    document.getElementById('edit-err-name').textContent = 'Name is required.';
    document.getElementById('edit-name').classList.add('error');
    valid = false;
  }
  if (!/^\d{10}$/.test(phone)) {
    document.getElementById('edit-err-phone').textContent = 'Must be exactly 10 digits.';
    document.getElementById('edit-phone').classList.add('error');
    valid = false;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById('edit-err-email').textContent = 'Invalid email address.';
    document.getElementById('edit-email').classList.add('error');
    valid = false;
  }
  if (!valid) return;

  const btnText    = saveEditBtn.querySelector('.btn-text');
  const btnSpinner = saveEditBtn.querySelector('.btn-spinner');
  saveEditBtn.disabled = true;
  if (btnText)    btnText.textContent = 'Saving…';
  if (btnSpinner) btnSpinner.hidden   = false;

  const payload = {
    customer_name: name, phone_number: phone, email,
    qty_frames:    parseInt(document.getElementById('edit-frames').value,    10) || 0,
    qty_bags:      parseInt(document.getElementById('edit-bags').value,      10) || 0,
    qty_candles:   parseInt(document.getElementById('edit-candles').value,   10) || 0,
    qty_keychains: parseInt(document.getElementById('edit-keychains').value, 10) || 0,
    qty_bookmarks: parseInt(document.getElementById('edit-bookmarks').value, 10) || 0,
    notes:         document.getElementById('edit-notes').value.trim(),
  };

  try {
    const res  = await fetch(`${API}/orders/${orderId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      editModal.hidden = true;
      showToast('Order updated successfully.', 'success');
      loadOrders(currentPage);
      loadStats();
    } else {
      if (data.errors?.length) {
        const map = { customer_name: 'name', phone_number: 'phone', email: 'email' };
        data.errors.forEach(err => {
          const key = map[err.path] || 'global';
          const el  = document.getElementById(`edit-err-${key}`);
          if (el) el.textContent = err.msg;
        });
      } else {
        document.getElementById('edit-err-global').textContent = data.message || 'Failed to update.';
      }
    }
  } catch {
    document.getElementById('edit-err-global').textContent = 'Network error.';
  } finally {
    saveEditBtn.disabled = false;
    if (btnText)    btnText.textContent = 'Save Changes';
    if (btnSpinner) btnSpinner.hidden   = true;
  }
});

closeEditBtn?.addEventListener('click',  () => { editModal.hidden = true; });
cancelEditBtn?.addEventListener('click', () => { editModal.hidden = true; });
editModal?.addEventListener('click', e => { if (e.target === editModal) editModal.hidden = true; });

// ── Delete Modal ──────────────────────────────────────────────────────────────
const deleteModal   = document.getElementById('deleteModal');
const deleteMsg     = document.getElementById('deleteModalMsg');
const confirmDelBtn = document.getElementById('confirmDeleteBtn');
const cancelDelBtn  = document.getElementById('cancelDeleteBtn');

function openDeleteModal(orderId, customerName) {
  pendingDeleteId = orderId;
  deleteMsg.textContent = `Delete order ${orderId} for "${customerName}"? This cannot be undone.`;
  deleteModal.hidden = false;
  cancelDelBtn?.focus();
}

confirmDelBtn?.addEventListener('click', async () => {
  if (!pendingDeleteId) return;

  const btnText    = confirmDelBtn.querySelector('.btn-text');
  const btnSpinner = confirmDelBtn.querySelector('.btn-spinner');
  confirmDelBtn.disabled = true;
  if (btnText)    btnText.textContent = 'Deleting…';
  if (btnSpinner) btnSpinner.hidden   = false;

  try {
    const res  = await fetch(`${API}/orders/${pendingDeleteId}`, { method: 'DELETE' });
    const data = await res.json();

    if (res.ok && data.success) {
      deleteModal.hidden = true;
      pendingDeleteId    = null;
      showToast('Order deleted.', 'success');
      loadOrders(currentPage);
      loadStats();
    } else {
      showToast(data.message || 'Failed to delete.', 'error');
    }
  } catch {
    showToast('Network error.', 'error');
  } finally {
    confirmDelBtn.disabled = false;
    if (btnText)    btnText.textContent = 'Delete';
    if (btnSpinner) btnSpinner.hidden   = true;
  }
});

cancelDelBtn?.addEventListener('click',  () => { deleteModal.hidden = true; });
deleteModal?.addEventListener('click', e => { if (e.target === deleteModal) deleteModal.hidden = true; });

// ── Escape closes any open modal ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!viewModal.hidden)   viewModal.hidden   = true;
  if (!editModal.hidden)   editModal.hidden   = true;
  if (!deleteModal.hidden) deleteModal.hidden = true;
});

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity .3s ease, transform .3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(16px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ── Global expose for inline onclick ─────────────────────────────────────────
window.openViewModal   = openViewModal;
window.openEditModal   = openEditModal;
window.openDeleteModal = openDeleteModal;
window.loadOrders      = loadOrders;

// ── Init ──────────────────────────────────────────────────────────────────────
loadStats();
loadOrders(1);
