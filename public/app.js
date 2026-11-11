/**
 * Customer Order Form — Frontend v2
 * Motion · Impeccable · Tasteskill
 */

const API = '/api';

// ── Pricing ──────────────────────────────────────────────────────────────────
let PRICES = { frames: 150, bags: 200, candles: 120, keychains: 80, bookmarks: 50 };

const PRODUCTS = [
  { key: 'frames',    label: 'Frames'     },
  { key: 'bags',      label: 'Bags'       },
  { key: 'candles',   label: 'Candles'    },
  { key: 'keychains', label: 'Key Chains' },
  { key: 'bookmarks', label: 'Bookmarks'  },
];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const form         = document.getElementById('orderForm');
const submitBtn    = document.getElementById('submitBtn');
const totalQtyEl   = document.getElementById('display-total-qty');
const totalAmtEl   = document.getElementById('display-total-amount');
const successModal = document.getElementById('successModal');
const newOrderBtn  = document.getElementById('newOrderBtn');

// ── Fetch prices ──────────────────────────────────────────────────────────────
async function loadPrices() {
  try {
    const res  = await fetch(`${API}/prices`);
    const data = await res.json();
    if (data.success) { PRICES = data.prices; updatePriceLabels(); }
  } catch (_) { /* use defaults */ }
}

function updatePriceLabels() {
  PRODUCTS.forEach(({ key }) => {
    const el = document.getElementById(`price-${key}`);
    if (el) el.textContent = `₹${PRICES[key]} each`;
  });
}

// ── Quantity controls ─────────────────────────────────────────────────────────
document.querySelectorAll('.qty-btn').forEach(btn => {
  const target = btn.dataset.target;
  const input  = target ? document.getElementById(target) : btn.closest('.qty-control')?.querySelector('.qty-input');
  const card   = btn.closest('.product-card');
  if (!input) return;

  const isDec = btn.classList.contains('qty-dec');

  btn.addEventListener('click', () => {
    let v = parseInt(input.value, 10) || 0;
    if (isDec && v > 0)   v--;
    if (!isDec && v < 999) v++;
    input.value = v;

    // Spring-pop the emoji on change
    const emojiWrap = card?.querySelector('.product-emoji-wrap');
    if (emojiWrap) {
      emojiWrap.style.transition = 'transform 0ms';
      emojiWrap.style.transform = isDec ? 'scale(.85) rotate(4deg)' : 'scale(1.2) rotate(-6deg)';
      requestAnimationFrame(() => {
        emojiWrap.style.transition = 'transform 350ms cubic-bezier(.34,1.56,.64,1)';
        emojiWrap.style.transform = '';
      });
    }

    // Spring-pop the qty number
    input.style.transition = 'transform 0ms';
    input.style.transform = isDec ? 'scale(.8)' : 'scale(1.25)';
    requestAnimationFrame(() => {
      input.style.transition = 'transform 300ms cubic-bezier(.34,1.56,.64,1)';
      input.style.transform = '';
    });

    recalc();
    updateCardHighlight(card, input);
    clearItemError();
  });
});

// Allow direct keyboard editing
document.querySelectorAll('.qty-input').forEach(input => {
  const card = input.closest('.product-card');
  input.addEventListener('input', () => {
    let v = parseInt(input.value, 10);
    if (isNaN(v) || v < 0) v = 0;
    if (v > 999) v = 999;
    input.value = v;
    recalc();
    updateCardHighlight(card, input);
    clearItemError();
  });
});

function updateCardHighlight(card, input) {
  if (!card) return;
  const active = (parseInt(input.value, 10) || 0) > 0;
  card.classList.toggle('card--active', active);
}

// ── Recalculate totals ────────────────────────────────────────────────────────
let _lastAmt = 0;

function recalc() {
  let totalQty = 0, totalAmt = 0;
  PRODUCTS.forEach(({ key }) => {
    const el  = document.getElementById(`qty_${key}`);
    const qty = el ? (parseInt(el.value, 10) || 0) : 0;
    totalQty += qty;
    totalAmt += qty * (PRICES[key] || 0);
  });

  if (totalQtyEl) totalQtyEl.textContent = totalQty;

  if (totalAmtEl) {
    totalAmtEl.textContent = `₹${totalAmt.toLocaleString('en-IN')}`;
    // Bump animation when amount changes
    if (totalAmt !== _lastAmt) {
      totalAmtEl.classList.remove('bump');
      void totalAmtEl.offsetWidth; // reflow
      totalAmtEl.classList.add('bump');
      _lastAmt = totalAmt;
    }
  }

  return { totalQty, totalAmt };
}

function clearItemError() {
  const el = document.getElementById('err-items');
  if (el) el.textContent = '';
}

// ── Validation ────────────────────────────────────────────────────────────────
function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  document.querySelectorAll('input.error, textarea.error').forEach(el => {
    el.classList.remove('error');
    el.classList.remove('valid');
  });
}

function showError(fieldId, msg) {
  const errEl   = document.getElementById(`err-${fieldId}`);
  const inputEl = document.getElementById(fieldId);
  if (errEl)   errEl.textContent = msg;
  if (inputEl) { inputEl.classList.add('error'); inputEl.classList.remove('valid'); }
}

function markValid(fieldId) {
  const inputEl = document.getElementById(fieldId);
  if (inputEl) { inputEl.classList.remove('error'); inputEl.classList.add('valid'); }
}

function validateForm(data) {
  let valid = true;

  if (!data.customer_name?.trim()) {
    showError('customer_name', 'Please enter your full name.');
    valid = false;
  } else if (data.customer_name.trim().length > 100) {
    showError('customer_name', 'Name must be 100 characters or fewer.');
    valid = false;
  } else { markValid('customer_name'); }

  if (!data.phone_number?.trim()) {
    showError('phone_number', 'Phone number is required.');
    valid = false;
  } else if (!/^\d{10}$/.test(data.phone_number.trim())) {
    showError('phone_number', 'Must be exactly 10 digits — no spaces or dashes.');
    valid = false;
  } else { markValid('phone_number'); }

  if (data.email?.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      showError('email', 'Please enter a valid email address.');
      valid = false;
    } else { markValid('email'); }
  }

  const { totalQty } = recalc();
  if (totalQty === 0) {
    document.getElementById('err-items').textContent = 'Add at least one product to your order.';
    valid = false;
  }

  return valid;
}

// ── Live validation on blur ───────────────────────────────────────────────────
['customer_name', 'phone_number', 'email'].forEach(id => {
  document.getElementById(id)?.addEventListener('blur', (e) => {
    const v = e.target.value.trim();
    const errEl = document.getElementById(`err-${id}`);
    if (!v) return; // only validate on blur if something was typed

    if (id === 'customer_name' && v.length > 0 && v.length <= 100) {
      markValid('customer_name');
      if (errEl) errEl.textContent = '';
    }
    if (id === 'phone_number' && /^\d{10}$/.test(v)) {
      markValid('phone_number');
      if (errEl) errEl.textContent = '';
    }
    if (id === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      markValid('email');
      if (errEl) errEl.textContent = '';
    }
  });
});

// ── Form submission ───────────────────────────────────────────────────────────
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const fd   = new FormData(form);
  const data = Object.fromEntries(fd.entries());

  if (!validateForm(data)) {
    // Scroll to first error
    const first = form.querySelector('.error, [role="alert"]:not(:empty)');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Loading state
  const btnText    = submitBtn.querySelector('.btn-text');
  const btnIcon    = submitBtn.querySelector('.btn-icon');
  const btnSpinner = submitBtn.querySelector('.btn-spinner');
  submitBtn.disabled = true;
  if (btnText)    btnText.textContent = 'Placing order…';
  if (btnIcon)    btnIcon.hidden      = true;
  if (btnSpinner) btnSpinner.hidden   = false;

  try {
    const res    = await fetch(`${API}/orders`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    const result = await res.json();

    if (res.ok && result.success) {
      showSuccess(result.order);
    } else {
      if (result.errors?.length) {
        result.errors.forEach(err => {
          if (err.path) showError(err.path, err.msg);
        });
        const globalErr = result.errors.find(e => !e.path);
        if (globalErr) document.getElementById('err-items').textContent = globalErr.msg;
      } else {
        document.getElementById('err-items').textContent =
          result.message || 'Something went wrong. Please try again.';
      }
    }
  } catch (_) {
    document.getElementById('err-items').textContent =
      'Network error — please check your connection.';
  } finally {
    submitBtn.disabled = false;
    if (btnText)    btnText.textContent = 'Submit Order';
    if (btnIcon)    btnIcon.hidden      = false;
    if (btnSpinner) btnSpinner.hidden   = true;
  }
});

// ── Success Modal ─────────────────────────────────────────────────────────────
function showSuccess(order) {
  const details = document.getElementById('modalDetails');
  if (details) {
    details.innerHTML = `
      <div class="detail-row">
        <span>Order ID</span>
        <strong style="font-family:ui-monospace,monospace;font-size:.82rem">${escHtml(order.order_id)}</strong>
      </div>
      <div class="detail-row">
        <span>Name</span>
        <strong>${escHtml(order.customer_name)}</strong>
      </div>
      <div class="detail-row">
        <span>Total Items</span>
        <strong>${order.total_qty}</strong>
      </div>
      <div class="detail-row detail-row--total">
        <span>Total Amount</span>
        <strong>₹${Number(order.total_amount).toLocaleString('en-IN')}</strong>
      </div>
    `;
  }

  launchConfetti();
  successModal.hidden = false;
  newOrderBtn?.focus();
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function launchConfetti() {
  const wrap = document.getElementById('confettiWrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const colors = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899'];
  const count  = 18;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';

    const angle  = (i / count) * 360;
    const dist   = 20 + Math.random() * 30;
    const x = Math.cos((angle * Math.PI) / 180) * dist;
    const y = Math.sin((angle * Math.PI) / 180) * dist;
    const delay  = Math.random() * .3;
    const dur    = .5 + Math.random() * .4;

    piece.style.cssText = `
      left: calc(50% + ${x}px);
      top: calc(50% + ${y}px);
      background: ${colors[i % colors.length]};
      animation-delay: ${delay}s;
      animation-duration: ${dur}s;
      border-radius: ${Math.random() > .5 ? '50%' : '2px'};
      width: ${5 + Math.random() * 5}px;
      height: ${5 + Math.random() * 5}px;
    `;
    wrap.appendChild(piece);
  }
}

// ── Modal interactions ────────────────────────────────────────────────────────
newOrderBtn?.addEventListener('click', resetForm);

successModal?.addEventListener('click', e => {
  if (e.target === successModal) resetForm();
});

function resetForm() {
  successModal.hidden = true;
  form.reset();
  document.querySelectorAll('.qty-input').forEach(el => el.value = '0');
  document.querySelectorAll('.product-card').forEach(c => c.classList.remove('card--active'));
  document.querySelectorAll('input.valid, textarea.valid').forEach(el => el.classList.remove('valid'));
  _lastAmt = 0;
  recalc();
  clearErrors();
  document.getElementById('customer_name')?.focus();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadPrices();
recalc();
