import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escapeAttr, escapeHtml, peso, uniqueByVoucherKey, voucherKey } from './util.js';

let autoGroupInFlight = false;

const IS_LOCAL_DEV_HOST = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
const IS_MOCK = IS_LOCAL_DEV_HOST && new URLSearchParams(window.location.search).has('mock');
const BOARD_COLLECTION = IS_LOCAL_DEV_HOST ? 'devBookerBoards' : 'bookerBoards';
const INVITE_COLLECTION = IS_LOCAL_DEV_HOST ? 'devBookerInvites' : 'bookerInvites';
const SESSION_COLLECTION = IS_LOCAL_DEV_HOST ? 'devBookerSessions' : 'bookerSessions';
const BOOKER_SESSION_KEY = IS_LOCAL_DEV_HOST ? 'shein_pos_booker_session_dev' : 'shein_pos_booker_session';
const BOOKER_BUSY_CARD_STATUSES = ['claimed', 'fulfilling', 'ready_to_surrender', 'surrendered'];
const VOUCHERS = ['83%', '81%', '79%', '75%', '70%', '60%', '59%', '57%', '50%'];
const SEARCH_PARAMS = new URLSearchParams(window.location.search);
const IS_BOOKER_PORTAL = window.location.pathname.toLowerCase().endsWith('/booker.html')
  || SEARCH_PARAMS.has('booker');

const ICON_PATHS = {
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>',
  'arrow-left': '<path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path>',
  'arrow-right': '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>',
  'bar-chart': '<path d="M3 3v18h18"></path><path d="M8 17V9"></path><path d="M13 17V5"></path><path d="M18 17v-6"></path>',
  'chevron-down': '<path d="m6 9 6 6 6-6"></path>',
  'chevron-right': '<path d="m9 18 6-6-6-6"></path>',
  check: '<path d="M20 6 9 17l-5-5"></path>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"></rect><rect x="2" y="2" width="13" height="13" rx="2"></rect>',
  external: '<path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>',
  list: '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
  plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2"></path><path d="M3 12a9 9 0 0 1 15.5-6.2"></path><path d="M18 3v6h-6"></path><path d="M6 21v-6h6"></path>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path>',
  trash: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="m19 6-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path>',
  x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
};

if (IS_BOOKER_PORTAL) {
  initBookerApp();
} else {
  initOwnerFulfillment();
}

function getDb() {
  return window.POSFirebase?.db || window.POSAdmin?.db || null;
}

function getAuthUser() {
  return window.POSFirebase?.auth?.currentUser || window.POSAdmin?.user || null;
}

function boardRef(boardId) {
  return doc(getDb(), BOARD_COLLECTION, boardId);
}

function inviteRef(inviteHash) {
  return doc(getDb(), INVITE_COLLECTION, inviteHash);
}

function invitesRef() {
  return collection(getDb(), INVITE_COLLECTION);
}

function sessionRef(uid) {
  return doc(getDb(), SESSION_COLLECTION, uid);
}

function cardsRef(boardId) {
  return collection(getDb(), BOARD_COLLECTION, boardId, 'cards');
}

function cardRef(boardId, cardId) {
  return doc(getDb(), BOARD_COLLECTION, boardId, 'cards', cardId);
}

function checkoutsRef(boardId, cardId) {
  return collection(getDb(), BOARD_COLLECTION, boardId, 'cards', cardId, 'checkouts');
}

function checkoutRef(boardId, cardId, checkoutId) {
  return doc(getDb(), BOARD_COLLECTION, boardId, 'cards', cardId, 'checkouts', checkoutId);
}

function pendingCheckoutsRef(boardId) {
  return collection(getDb(), BOARD_COLLECTION, boardId, 'pendingCheckouts');
}

function pendingCheckoutRef(boardId, pendingId) {
  return doc(getDb(), BOARD_COLLECTION, boardId, 'pendingCheckouts', pendingId);
}

function bookerLockRef(boardId, bookerName) {
  return doc(getDb(), BOARD_COLLECTION, boardId, 'bookerLocks', bookerLockKey(bookerName));
}

function icon(name) {
  return `
    <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      ${ICON_PATHS[name] || ICON_PATHS.check}
    </svg>
  `;
}

function iconButton(label, iconName, attrs = '', variant = 'secondary', size = '') {
  const classes = `icon-btn icon-btn-${variant}${size ? ` icon-btn-${size}` : ''}`;
  return `
    <button ${attrs} class="${classes}" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">
      ${icon(iconName)}
      <span class="sr-only">${escapeHtml(label)}</span>
    </button>
  `;
}

function iconLink(label, iconName, href, attrs = '', variant = 'secondary', size = '') {
  const classes = `icon-btn icon-btn-${variant}${size ? ` icon-btn-${size}` : ''}`;
  return `
    <a class="${classes}" href="${escapeAttr(href)}" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}" ${attrs}>
      ${icon(iconName)}
      <span class="sr-only">${escapeHtml(label)}</span>
    </a>
  `;
}

function initOwnerFulfillment() {
  const root = document.getElementById('fulfillment-root');
  const refreshBtn = document.getElementById('fulfillment-refresh');
  if (!root) return;
  if (refreshBtn) {
    refreshBtn.className = 'btn btn-secondary btn-sm';
    refreshBtn.setAttribute('aria-label', 'Refresh fulfillment');
    refreshBtn.setAttribute('title', 'Refresh fulfillment');
    refreshBtn.innerHTML = `${icon('refresh')}<span>Refresh</span>`;
  }

  const owner = {
    root,
    board: null,
    invites: [],
    revealedInviteCodes: new Map(),
    cards: [],
    checkoutsByCard: new Map(),
    pendingCheckouts: [],
    pendingUnsub: null,
    createModalOpen: false,
    ownerCardModalId: '',
    cardFilter: '',
    loading: false
  };

  refreshBtn?.addEventListener('click', () => { if (!IS_MOCK) loadOwnerBoard(owner, { force: true }); });
  window.addEventListener('pos:viewchange', (event) => {
    if (IS_MOCK) return;
    if (event.detail?.viewId === 'fulfillment-view') loadOwnerBoard(owner);
  });
  window.addEventListener('pos:authchange', () => {
    if (IS_MOCK) return;
    if (isOwnerViewActive()) loadOwnerBoard(owner, { force: true });
  });
  window.addEventListener('pos:request-co', () => {
    owner.createModalOpen = true;
    renderOwner(owner);
  });
  root.addEventListener('click', event => handleOwnerClick(event, owner));
  root.addEventListener('submit', event => handleOwnerSubmit(event, owner));
  root.addEventListener('focusout', event => handleValidationBlur(event));
  root.addEventListener('input', event => {
    handleOwnerCustomerAutofill(event, owner);
    handleValidationInput(event);
  });
  root.addEventListener('change', event => {
    handleOwnerCustomerAutofill(event, owner);
    handleValidationBlur(event);
  });

  if (IS_LOCAL_DEV_HOST && SEARCH_PARAMS.has('mock')) {
    applyMockOwnerState(owner);
    document.getElementById('auth-overlay')?.setAttribute('hidden', '');
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'fulfillment-view'));
    renderOwner(owner);
    return;
  }

  renderOwner(owner);
}

function isOwnerViewActive() {
  return document.getElementById('fulfillment-view')?.classList.contains('active');
}

async function loadOwnerBoard(owner, options = {}) {
  if (owner.loading && !options.force) return;
  const db = getDb();
  const user = getAuthUser();
  if (!db || !user) {
    if (owner.pendingUnsub) { owner.pendingUnsub(); owner.pendingUnsub = null; }
    owner.board = null;
    owner.cards = [];
    owner.checkoutsByCard = new Map();
    owner.pendingCheckouts = [];
    owner.ownerCardModalId = '';
    renderOwner(owner);
    return;
  }

  owner.loading = true;
  renderOwner(owner);
  try {
    const boardQuery = query(
      collection(db, BOARD_COLLECTION),
      where('ownerUid', '==', user.uid),
      where('active', '==', true),
      limit(1)
    );
    const snap = await getDocs(boardQuery);
    const first = snap.docs[0];
    owner.board = first ? normalizeBoard(first.id, first.data()) : null;
    if (owner.board) {
      await Promise.all([loadOwnerCards(owner), loadOwnerInvites(owner)]);
      subscribePendingCheckouts(owner);
    } else {
      if (owner.pendingUnsub) { owner.pendingUnsub(); owner.pendingUnsub = null; }
      owner.invites = [];
      owner.cards = [];
      owner.checkoutsByCard = new Map();
      owner.pendingCheckouts = [];
      owner.ownerCardModalId = '';
    }
  } catch (err) {
    console.warn('fulfillment load failed:', err);
    showToast('Fulfillment board failed to load', 'error');
  } finally {
    owner.loading = false;
    renderOwner(owner);
  }
}

async function loadOwnerCards(owner) {
  const cardSnap = await getDocs(cardsRef(owner.board.id));
  owner.cards = cardSnap.docs
    .map(docSnap => normalizeCard(docSnap.id, docSnap.data()))
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  const checkoutPairs = await Promise.all(owner.cards.map(async card => {
    const checkoutSnap = await getDocs(checkoutsRef(owner.board.id, card.id));
    const checkouts = checkoutSnap.docs
      .map(docSnap => normalizeCheckout(docSnap.id, docSnap.data()))
      .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
    return [card.id, checkouts];
  }));
  owner.checkoutsByCard = new Map(checkoutPairs);
  if (owner.ownerCardModalId && !owner.cards.some(card => card.id === owner.ownerCardModalId)) {
    owner.ownerCardModalId = '';
  }
}

async function loadOwnerInvites(owner) {
  const user = getAuthUser();
  if (!user || !owner.board) {
    owner.invites = [];
    return;
  }
  const inviteQuery = query(invitesRef(), where('ownerUid', '==', user.uid));
  const snap = await getDocs(inviteQuery);
  owner.invites = snap.docs
    .map(docSnap => normalizeInvite(docSnap.id, docSnap.data()))
    .filter(invite => invite.boardId === owner.board.id)
    .sort((a, b) => Number(b.active) - Number(a.active) || toMs(b.updatedAt || b.createdAt) - toMs(a.updatedAt || a.createdAt));
}

function renderOwner(owner) {
  const user = getAuthUser();
  if (!IS_MOCK && !user) {
    owner.root.innerHTML = '<div class="recent-card"><p class="empty-note">Sign in to manage booker fulfillment cards.</p></div>';
    return;
  }
  if (owner.loading) {
    owner.root.innerHTML = '<div class="recent-card"><p class="empty-note">Loading fulfillment board...</p></div>';
    return;
  }
  owner.root.innerHTML = `
    ${renderOwnerBoardPanel(owner)}
    ${owner.board ? renderOwnerPendingQueue(owner) : ''}
    ${owner.board ? renderOwnerCards(owner) : ''}
    ${owner.board && owner.createModalOpen ? renderOwnerCreatePanel(owner) : ''}
    ${owner.board && owner.ownerCardModalId ? renderOwnerCardModal(owner) : ''}
  `;
  initializeStepForms(owner.root);
}

function renderOwnerBoardPanel(owner) {
  if (!owner.board) {
    return `
      <section class="ful-board">
        <div class="ful-board-head">
          <div class="ful-board-title">
            <span class="field-label">Booker Portal</span>
            <h3>Fulfillment Board</h3>
          </div>
        </div>
        <div class="ful-board-empty">
          <p class="fulfillment-muted">Create the internal board before adding account cards and inviting bookers.</p>
          <button type="button" class="btn btn-primary" data-create-board>Create Booker Portal</button>
        </div>
      </section>
    `;
  }
  const link = getBookerPortalLink();
  const active = owner.cards.filter(card => !['surrendered', 'approved'].includes(card.status)).length;
  const review = owner.cards.filter(card => card.status === 'surrendered').length;
  const approved = owner.cards.filter(card => card.status === 'approved').length;
  const activeInvites = owner.invites.filter(invite => invite.active).length;
  return `
    <section class="ful-board">
      <div class="ful-board-head">
        <div class="ful-board-title">
          <span class="field-label">Booker Portal</span>
          <h3>Fulfillment Board</h3>
        </div>
        <span class="badge available">Active</span>
      </div>
      <div class="ful-stat-strip">
        <div class="ful-stat-item">
          <span class="ful-stat-value">${active}</span>
          <span class="ful-stat-label">Active</span>
        </div>
        <div class="ful-stat-item${review > 0 ? ' ful-stat-item--review' : ''}">
          <span class="ful-stat-value">${review}</span>
          <span class="ful-stat-label">Review</span>
        </div>
        <div class="ful-stat-item">
          <span class="ful-stat-value">${approved}</span>
          <span class="ful-stat-label">Approved</span>
        </div>
        <div class="ful-stat-item">
          <span class="ful-stat-value">${activeInvites}</span>
          <span class="ful-stat-label">Bookers</span>
        </div>
      </div>
      <details class="ful-manage" ${owner.board.gmailBase ? '' : 'open'}>
        <summary class="ful-manage-summary">
          <span>${activeInvites} active invite${activeInvites === 1 ? '' : 's'} · ${owner.board.gmailBase ? 'Gmail base set' : 'Gmail base missing'} · ${owner.board.targetVouchers?.length ? `Combo: ${owner.board.targetVouchers.join(', ')}` : 'No combo set'}</span>
          <span class="fulfillment-details-toggle" aria-hidden="true">${icon('chevron-right')}</span>
        </summary>
        <div class="ful-manage-body">
          <form id="fulfillment-board-settings" class="fulfillment-board-settings" novalidate>
            <div class="form-group">
              <label class="form-label">Gmail Base For Surrender Emails</label>
              <input class="form-input" name="gmailBase" type="email" inputmode="email" autocomplete="email" placeholder="main@gmail.com" value="${escapeAttr(owner.board.gmailBase || '')}" />
            </div>
            <div class="form-group" style="grid-column: 1 / -1">
              <label class="form-label">Target Voucher Combo</label>
              <div class="ful-voucher-combo-grid">
                ${VOUCHERS.map(v => `
                  <label class="ful-combo-check">
                    <input type="checkbox" name="targetVouchers" value="${escapeAttr(v)}"
                      ${(owner.board.targetVouchers || []).some(tv => voucherKey(tv) === voucherKey(v)) ? 'checked' : ''} />
                    <span>${escapeHtml(v)}</span>
                  </label>
                `).join('')}
              </div>
              <p class="form-hint">Auto-post fires when the pending queue has at least one request per checked voucher.</p>
            </div>
            <button type="submit" class="btn btn-secondary btn-sm" style="align-self: end">${icon('save')}<span>Save settings</span></button>
          </form>
          <div class="fulfillment-share-row">
            <input class="form-input mono" value="${escapeAttr(link)}" readonly />
            ${iconButton('Copy portal link', 'copy', `type="button" data-copy-text="${escapeAttr(link)}"`)}
          </div>
          ${renderOwnerInvitePanel(owner)}
        </div>
      </details>
    </section>
  `;
}

function renderOwnerInvitePanel(owner) {
  return `
    <div class="fulfillment-invite-box">
      <form id="booker-invite-form" class="fulfillment-invite-form" novalidate>
        <div class="form-group">
          <label class="form-label">Booker Name *</label>
          <input class="form-input" name="bookerName" autocomplete="name" placeholder="Booker name" required />
        </div>
        <button type="submit" class="btn btn-primary">Create Invite Code</button>
      </form>
      <div class="fulfillment-invite-list">
        ${owner.invites.length ? owner.invites.map(invite => renderOwnerInvite(owner, invite)).join('') : '<p class="fulfillment-muted">No booker invites yet.</p>'}
      </div>
    </div>
  `;
}

function renderOwnerInvite(owner, invite) {
  const revealedCode = owner.revealedInviteCodes.get(invite.id) || '';
  return `
    <article class="fulfillment-invite-row">
      <div>
        <strong>${escapeHtml(invite.bookerName || 'Booker')}</strong>
        <span>${invite.active ? 'Active invite' : 'Revoked invite'}</span>
        ${revealedCode ? `<code class="invite-code">${escapeHtml(revealedCode)}</code>` : '<small>Code hidden. Regenerate to copy a new code.</small>'}
      </div>
      <div class="toolbar">
        ${revealedCode ? `<button type="button" class="btn btn-secondary btn-sm" data-copy-text="${escapeAttr(revealedCode)}">${icon('copy')}<span>Copy code</span></button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-regenerate-invite="${escapeAttr(invite.id)}">${icon('rotate')}<span>Regenerate</span></button>
        <button type="button" class="btn btn-danger btn-sm" data-revoke-invite="${escapeAttr(invite.id)}" ${invite.active ? '' : 'disabled'}>${icon('trash')}<span>Revoke</span></button>
      </div>
    </article>
  `;
}

function renderOwnerCreatePanel(owner) {
  const customerOptions = getKnownOwnerCustomers(owner)
    .map(customer => `<option value="${escapeAttr(customer.name)}"></option>`)
    .join('');
  const voucherOptions = VOUCHERS.map(v => `<option>${escapeHtml(v)}</option>`).join('');
  return `
    <div class="fulfillment-create-modal" role="dialog" aria-modal="true" aria-labelledby="fulfillment-create-title">
      <button type="button" class="fulfillment-create-backdrop" data-close-owner-create aria-label="Close create account form"></button>
      <section class="fulfillment-create-sheet">
        <div class="ful-sheet-handle" aria-hidden="true"></div>
        <button type="button" class="fulfillment-create-close" data-close-owner-create aria-label="Close" title="Close">${icon('x')}</button>
        <div class="ful-create-header">
          <span class="field-label">Pending Queue</span>
          <h3 id="fulfillment-create-title">New Checkout Request</h3>
        </div>
        <form id="fulfillment-card-form" class="fulfillment-step-form fulfillment-modal-step-form" data-step-form data-step-index="0" novalidate>
          <datalist id="fulfillment-customer-options">${customerOptions}</datalist>
          <div class="ful-create-stepper" data-stepper data-total="3">
            <div class="ful-create-steps-row">
              <div class="ful-create-step-item">
                <span class="ful-create-step-dot is-active" data-step-dot="0">1</span>
                <span class="ful-create-step-lbl">Customer</span>
              </div>
              <div class="ful-create-step-item">
                <span class="ful-create-step-dot" data-step-dot="1">2</span>
                <span class="ful-create-step-lbl">Checkout</span>
              </div>
              <div class="ful-create-step-item">
                <span class="ful-create-step-dot" data-step-dot="2">3</span>
                <span class="ful-create-step-lbl">Items</span>
              </div>
            </div>
            <div class="ful-create-track"><span data-step-fill style="width:33.33%"></span></div>
          </div>
          <section class="fulfillment-step-panel is-active" data-step="0">
            <div class="ful-create-panel-head">
              <span class="ful-create-panel-kicker">Step 1 of 3</span>
              <h4 class="ful-create-panel-title">Customer Details</h4>
            </div>
            <div class="form-row cols-1 fulfillment-checkout-entry">
              <div class="form-group">
                <label class="form-label">CU Name *</label>
                <input class="form-input" name="customerName" autocomplete="name" list="fulfillment-customer-options" placeholder="Customer name" required />
              </div>
              <div class="form-group">
                <label class="form-label">Contact *</label>
                <input class="form-input" name="customerContact" type="tel" inputmode="tel" autocomplete="tel" placeholder="Phone / profile" required />
              </div>
              <div class="form-group">
                <label class="form-label">Address *</label>
                <input class="form-input" name="customerAddress" autocomplete="street-address" placeholder="Delivery address" required />
              </div>
            </div>
          </section>
          <section class="fulfillment-step-panel" data-step="1">
            <div class="ful-create-panel-head">
              <span class="ful-create-panel-kicker">Step 2 of 3</span>
              <h4 class="ful-create-panel-title">Checkout Details</h4>
            </div>
            <div class="form-row cols-1 fulfillment-checkout-entry">
              <div class="form-group">
                <label class="form-label">Voucher *</label>
                <select class="form-select" name="voucher" required>${voucherOptions}</select>
              </div>
              <div class="form-group">
                <label class="form-label">Expected Total *</label>
                <input class="form-input" name="expectedTotal" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" required />
              </div>
              <div class="form-group">
                <label class="form-label">Cart Link *</label>
                <input class="form-input" name="cartUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://..." required />
              </div>
            </div>
          </section>
          <section class="fulfillment-step-panel" data-step="2">
            <div class="ful-create-panel-head">
              <span class="ful-create-panel-kicker">Step 3 of 3</span>
              <h4 class="ful-create-panel-title">Items & Notes</h4>
            </div>
            <div class="form-row cols-1 fulfillment-checkout-entry">
              <div class="form-group">
                <label class="form-label">Item Lines *</label>
                <textarea class="form-input fulfillment-textarea" name="itemLines" placeholder="One item per line" required></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Checkout Notes</label>
                <textarea class="form-input fulfillment-textarea" name="checkoutNotes" placeholder="Instructions for this checkout"></textarea>
              </div>
            </div>
          </section>
          <div class="modal-footer fulfillment-footer fulfillment-step-footer ful-create-footer">
            <div class="ful-create-back">
              ${iconButton('Back', 'arrow-left', 'type="button" data-step-prev', 'ghost')}
            </div>
            <span class="fulfillment-step-count" data-step-count>Step 1 of 3</span>
            <div class="ful-create-fwd">
              ${iconButton('Next', 'arrow-right', 'type="button" data-step-next')}
              <button type="submit" class="btn btn-primary">${icon('send')} Submit Request</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderOwnerPendingQueue(owner) {
  const queueItems = owner.pendingCheckouts;
  const pending = queueItems.filter(pc => pc.status === 'pending');
  const target = owner.board?.targetVouchers || [];
  const targetKeys = target.map(voucherKey);
  const coveredKeys = new Set(pending.map(pc => voucherKey(pc.voucher)));
  const coveredCount = targetKeys.filter(k => coveredKeys.has(k)).length;
  const comboReady = target.length > 0 && coveredCount === targetKeys.length;

  const progressLabel = target.length
    ? `${coveredCount} / ${target.length} voucher${target.length === 1 ? '' : 's'} covered`
    : 'No target combo set — configure in board settings';

  return `
    <section class="ful-pending-section">
      <div class="ful-pending-head">
        <div>
          <span class="field-label">Pending Queue</span>
          <h3>Checkout Requests</h3>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost btn-sm" data-post-now ${pending.length ? '' : 'disabled'}>Post Now</button>
        </div>
      </div>
      <div class="ful-pending-progress ${comboReady ? 'is-ready' : ''}">
        <span class="ful-pending-progress-label">${escapeHtml(progressLabel)}</span>
        ${target.length ? `
          <div class="ful-pending-combo-row">
            ${target.map(v => {
              const covered = coveredKeys.has(voucherKey(v));
              return `<span class="ful-combo-pip ${covered ? 'is-covered' : ''}">${escapeHtml(v)}</span>`;
            }).join('')}
            ${comboReady ? '<span class="badge available">Ready to auto-post</span>' : ''}
          </div>
        ` : ''}
      </div>
      <div class="ful-pending-list">
        ${queueItems.length
          ? queueItems.map(pc => renderPendingCheckoutRow(pc)).join('')
          : '<p class="empty-note">No pending requests. Add a checkout request to get started.</p>'
        }
      </div>
    </section>
  `;
}

function renderPendingCheckoutRow(pc) {
  const isFailed = pc.status === 'failed';
  return `
    <article class="ful-pending-row${isFailed ? ' ful-pending-row--failed' : ''}">
      <details class="ful-pending-edit">
        <summary class="ful-pending-row-top">
          <div class="ful-pending-row-info">
            <span class="ful-voucher-pill">${escapeHtml(pc.voucher)}</span>
            <strong>${escapeHtml(pc.customerName)}</strong>
            <span class="ful-pending-meta">${peso(pc.expectedTotal)} · ${pc.items.length} item${pc.items.length === 1 ? '' : 's'}</span>
          </div>
          <span class="ful-pending-row-end">
            <span class="badge ${isFailed ? 'is-cannot_fulfill' : 'is-open'}">${isFailed ? 'Failed — edit needed' : 'Pending'}</span>
            <span class="ful-pending-chevron" aria-hidden="true">${icon('chevron-right')}</span>
          </span>
        </summary>
        <form data-owner-edit-pending="${escapeAttr(pc.id)}" novalidate>
          ${isFailed ? '<p class="ful-pending-edit-hint">This checkout couldn’t be fulfilled. Edit and save to return it to the auto-publish pool.</p>' : ''}
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">CU Name *</label>
              <input class="form-input" name="customerName" autocomplete="name" value="${escapeAttr(pc.customerName)}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Contact *</label>
              <input class="form-input" name="customerContact" type="tel" inputmode="tel" autocomplete="tel" value="${escapeAttr(pc.customerContact)}" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Address *</label>
            <input class="form-input" name="customerAddress" autocomplete="street-address" value="${escapeAttr(pc.customerAddress)}" required />
          </div>
          <div class="form-row ful-2col">
            <div class="form-group">
              <label class="form-label">Voucher *</label>
              <select class="form-select" name="voucher" required>${VOUCHERS.map(v => `<option ${voucherKey(v) === voucherKey(pc.voucher) ? 'selected' : ''}>${v}</option>`).join('')}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Expected Total *</label>
              <input class="form-input" name="expectedTotal" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeAttr(pc.expectedTotal)}" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Cart Link *</label>
            <input class="form-input" name="cartUrl" type="url" inputmode="url" autocomplete="url" value="${escapeAttr(pc.cartUrl)}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Item Lines *</label>
            <textarea class="form-input fulfillment-textarea" name="itemLines" required>${escapeHtml(pc.items.map(item => item.label).join('\n'))}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Checkout Notes</label>
            <textarea class="form-input fulfillment-textarea" name="checkoutNotes">${escapeHtml(pc.notes || '')}</textarea>
          </div>
          <div class="ful-pending-edit-actions">
            <button type="submit" class="btn btn-secondary btn-sm">${icon('save')}<span>Save request</span></button>
            <button type="button" class="btn btn-ghost btn-sm ful-danger" data-remove-pending="${escapeAttr(pc.id)}">${icon('trash')}<span>Remove</span></button>
          </div>
        </form>
      </details>
    </article>
  `;
}

function renderOwnerCards(owner) {
  if (!owner.cards.length) {
    return `
      <section class="ful-cards-section">
        <div class="ful-cards-head">
          <div>
            <span class="field-label">Account Cards</span>
            <h3>No cards yet</h3>
          </div>
        </div>
        <p class="empty-note" style="text-align:left;padding:16px 0 4px;">Cards will appear here once a pending request batch is auto-posted or manually posted.</p>
      </section>
    `;
  }
  const groups = getOwnerCardGroups(owner.cards);
  const selected = owner.cardFilter && groups[owner.cardFilter] ? owner.cardFilter : defaultOwnerCardFilter(groups);
  const visibleCards = groups[selected]?.cards || groups.active.cards;
  return `
    <section class="ful-cards-section">
      <div class="ful-cards-head">
        <div>
          <span class="field-label">Account Cards</span>
          <h3>${escapeHtml(groups[selected]?.label || 'Active')}</h3>
        </div>
      </div>
      <div class="fulfillment-filter-row" role="tablist" aria-label="Fulfillment card filters">
        ${renderOwnerCardFilterButton('active', 'Active', groups.active.cards.length, selected)}
        ${renderOwnerCardFilterButton('review', 'Review', groups.review.cards.length, selected)}
        ${renderOwnerCardFilterButton('approved', 'Approved', groups.approved.cards.length, selected)}
        ${renderOwnerCardFilterButton('all', 'All', groups.all.cards.length, selected)}
      </div>
      <div class="fulfillment-card-list">
        ${visibleCards.length ? visibleCards.map(card => renderOwnerCard(owner, card)).join('') : '<p class="empty-note">No cards in this view.</p>'}
      </div>
    </section>
  `;
}

function renderOwnerCardFilterButton(filter, label, count, selected) {
  return `
    <button type="button" class="chip ${selected === filter ? 'active' : ''}" data-owner-card-filter="${filter}">
      ${escapeHtml(label)} <span>${count}</span>
    </button>
  `;
}

function getOwnerCardGroups(cards) {
  return {
    active: {
      label: 'Active Cards',
      cards: cards.filter(card => !['surrendered', 'approved'].includes(card.status))
    },
    review: {
      label: 'Ready For Review',
      cards: cards.filter(card => card.status === 'surrendered')
    },
    approved: {
      label: 'Approved Cards',
      cards: cards.filter(card => card.status === 'approved')
    },
    all: {
      label: 'All Cards',
      cards
    }
  };
}

function defaultOwnerCardFilter(groups) {
  if (groups.review.cards.length) return 'review';
  if (groups.active.cards.length) return 'active';
  if (groups.approved.cards.length) return 'approved';
  return 'all';
}

function firstName(full) {
  return String(full || '').trim().split(/\s+/)[0] || 'Customer';
}

function renderOwnerCard(owner, card) {
  const checkouts = owner.checkoutsByCard.get(card.id) || [];
  const fulfilled = checkouts.filter(checkout => checkout.status === 'fulfilled').length;
  const failed = checkouts.filter(checkout => checkout.status === 'cannot_fulfill').length;
  const open = checkouts.filter(checkout => !['fulfilled', 'cannot_fulfill', 'approved'].includes(checkout.status)).length;
  const totalItems = checkouts.reduce((sum, checkout) => sum + checkout.items.length, 0);
  const expectedTotal = checkouts.reduce((sum, checkout) => sum + Number(checkout.expectedTotal || 0), 0);
  const needsReview = card.status === 'surrendered';
  const total = checkouts.length;
  const customerCounts = [];
  const seenCustomers = new Map();
  for (const co of checkouts) {
    const name = (co.customerName || 'Customer').trim();
    if (!seenCustomers.has(name)) { seenCustomers.set(name, customerCounts.length); customerCounts.push({ name, count: 0 }); }
    customerCounts[seenCustomers.get(name)].count++;
  }
  return `
    <article class="ful-card${needsReview ? ' ful-card--review' : ''}">
      <button type="button" class="ful-card-btn" data-toggle-owner-card="${escapeAttr(card.id)}" aria-haspopup="dialog">
        <div class="ful-card-top">
          <span class="badge ${statusClass(card.status)}">${labelStatus(card.status)}</span>
          <span class="ful-card-email">${escapeHtml(card.generatedEmail || card.surrenderedEmail || '')}</span>
        </div>
        <div class="ful-card-mid">
          <span class="ful-card-name">${escapeHtml(card.bookerName || 'Unclaimed account')}</span>
          ${icon('chevron-right')}
        </div>
        <div class="ful-card-bottom">
          <div class="ful-card-totals">
            <span>${total} checkout${total === 1 ? '' : 's'}</span>
            <span class="ful-sep" aria-hidden="true">·</span>
            <span>${totalItems} item${totalItems === 1 ? '' : 's'}</span>
            <span class="ful-sep" aria-hidden="true">·</span>
            <span>${peso(expectedTotal)} expected</span>
          </div>
          ${total ? `
          <div class="ful-card-progress">
            ${fulfilled ? `<span class="ful-progress-done">${fulfilled} done</span>` : ''}
            ${failed ? `<span class="ful-progress-fail">${failed} failed</span>` : ''}
            ${open ? `<span class="ful-progress-open">${open} open</span>` : ''}
          </div>` : ''}
          ${customerCounts.length ? `
          <div class="ful-card-customers">
            ${customerCounts.map(c => `<span class="ful-card-customer-pill">${escapeHtml(firstName(c.name))}${c.count > 1 ? ` <span class="ful-card-customer-count">×${c.count}</span>` : ''}</span>`).join('')}
          </div>` : ''}
        </div>
      </button>
      ${total ? `
      <div class="ful-card-bar" role="progressbar" aria-label="Checkout fulfillment">
        ${fulfilled > 0 ? `<span class="ful-bar-done" style="flex:${fulfilled}"></span>` : ''}
        ${failed > 0 ? `<span class="ful-bar-fail" style="flex:${failed}"></span>` : ''}
        ${open > 0 ? `<span class="ful-bar-open" style="flex:${open}"></span>` : ''}
      </div>` : ''}
    </article>
  `;
}

function renderOwnerCardModal(owner) {
  const card = owner.cards.find(item => item.id === owner.ownerCardModalId);
  if (!card) return '';
  const checkouts = owner.checkoutsByCard.get(card.id) || [];
  const fulfilled = checkouts.filter(checkout => checkout.status === 'fulfilled').length;
  const failed = checkouts.filter(checkout => checkout.status === 'cannot_fulfill').length;
  const totalItems = checkouts.reduce((sum, checkout) => sum + checkout.items.length, 0);
  const expectedTotal = checkouts.reduce((sum, checkout) => sum + Number(checkout.expectedTotal || 0), 0);
  return `
    <div class="fulfillment-create-modal fulfillment-card-modal" role="dialog" aria-modal="true" aria-labelledby="fulfillment-card-modal-title">
      <button type="button" class="fulfillment-create-backdrop" data-close-owner-card aria-label="Close account card details"></button>
      <section class="fulfillment-create-sheet fulfillment-card-sheet">
        <div class="ful-sheet-head">
          <div class="ful-sheet-head-row">
            <div class="ful-modal-title-text">
              <span class="field-label">${escapeHtml(card.generatedEmail || card.surrenderedEmail || 'No surrender email yet')}</span>
              <h3 id="fulfillment-card-modal-title">${escapeHtml(card.bookerName || 'Unclaimed account')}</h3>
            </div>
            <div class="ful-sheet-head-meta">
              <span class="badge ${statusClass(card.status)}">${labelStatus(card.status)}</span>
              <button type="button" class="ful-sheet-close" data-close-owner-card aria-label="Close account card details" title="Close account card details">${icon('x')}</button>
            </div>
          </div>
          <div class="ful-modal-stats">
            <span><strong>${checkouts.length}</strong> checkout${checkouts.length === 1 ? '' : 's'}</span>
            <span class="ful-sep">·</span>
            <span><strong>${totalItems}</strong> item${totalItems === 1 ? '' : 's'}</span>
            <span class="ful-sep">·</span>
            <span><strong>${peso(expectedTotal)}</strong> expected</span>
            ${fulfilled ? `<span class="ful-sep">·</span><span class="ful-progress-done">${fulfilled} fulfilled</span>` : ''}
            ${failed ? `<span class="ful-sep">·</span><span class="ful-progress-fail">${failed} failed</span>` : ''}
          </div>
        </div>
        <div class="ful-card-info">
          <div class="ful-info-field">
            <span class="ful-info-label">Booker Account</span>
            <span class="ful-info-value">${escapeHtml(card.accountEmail || 'Hidden until surrender')}</span>
          </div>
          <div class="ful-info-field">
            <span class="ful-info-label">Surrendered Email</span>
            <span class="ful-info-value">${escapeHtml(card.surrenderedEmail || 'Not yet')}</span>
          </div>
          <div class="ful-info-field">
            <span class="ful-info-label">Expiry</span>
            <span class="ful-info-value">${card.expiresAt ? escapeHtml(formatDateTimeValue(card.expiresAt)) : 'Not yet'}</span>
          </div>
          <div class="ful-info-field">
            <span class="ful-info-label">Unused Vouchers</span>
            <span class="ful-info-value">${escapeHtml((card.vouchers || []).join(', ') || 'None saved')}</span>
          </div>
        </div>
        ${card.status === 'surrendered' && fulfilled ? renderCardApprovalSettings(card) : ''}
        ${checkouts.length ? `<div class="ful-section-divider"><span>${checkouts.length} checkout${checkouts.length === 1 ? '' : 's'}</span></div>` : ''}
        <div class="list-stack fulfillment-owner-checkouts">
          ${checkouts.map(checkout => renderOwnerCheckout(owner, card, checkout)).join('')}
        </div>
        <div class="modal-footer fulfillment-footer fulfillment-card-modal-footer">
          <button type="button" class="btn btn-primary" data-approve-card="${escapeAttr(card.id)}" ${card.status !== 'surrendered' ? 'disabled' : ''}>Approve Fulfilled Checkouts</button>
        </div>
      </section>
    </div>
  `;
}

function renderOwnerCheckout(owner, card, checkout) {
  const fulfilled = checkout.status === 'fulfilled';
  const failed = checkout.status === 'cannot_fulfill';
  const approved = checkout.status === 'approved';
  const isReviewCard = card.status === 'surrendered';
  const isActiveCard = !['surrendered', 'approved'].includes(card.status);

  const summary = `
    <div class="ful-pending-row-info">
      <span class="ful-voucher-pill">${escapeHtml(checkout.voucher || 'Voucher')}</span>
      <strong>${escapeHtml(checkout.customerName || 'Customer')}</strong>
      <span class="ful-pending-meta">${peso(checkout.expectedTotal)} · ${checkout.items.length} item${checkout.items.length === 1 ? '' : 's'}</span>
    </div>`;
  const statusBadge = `<span class="badge ${statusClass(checkout.status)}">${labelStatus(checkout.status)}</span>`;

  if (approved) {
    return `
      <article class="ful-pending-row ful-checkout-row">
        <div class="ful-pending-row-top ful-pending-row-top--static">
          ${summary}
          <span class="ful-pending-row-end">${statusBadge}</span>
        </div>
      </article>
    `;
  }

  const contextBlock = `
    ${checkout.customerAddress ? `<p class="ful-checkout-address">${escapeHtml(checkout.customerAddress)}</p>` : ''}
    ${checkout.notes ? `<p class="ful-checkout-note">${escapeHtml(checkout.notes)}</p>` : ''}
    ${failed ? `<p class="ful-checkout-fail-reason">Cannot fulfill: ${escapeHtml(checkout.cannotFulfillReason || 'No reason saved')}</p>` : ''}`;
  const actionsRow = (checkout.cartUrl || failed || fulfilled) ? `
    <div class="ful-checkout-actions">
      ${checkout.cartUrl ? `<a href="${escapeAttr(checkout.cartUrl)}" class="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">${icon('external')}<span>Open cart</span></a>` : ''}
      ${failed || fulfilled ? `<button type="button" class="btn btn-ghost btn-sm" data-reopen-checkout="${escapeAttr(checkout.id)}" data-card-id="${escapeAttr(card.id)}">${icon('rotate')}<span>Reopen</span></button>` : ''}
    </div>` : '';

  let editor = '';
  let defaultOpen = false;
  if (isReviewCard) {
    if (fulfilled) {
      editor = renderReviewInputs(checkout);
      defaultOpen = true;
    } else if (failed) {
      editor = '<p class="ful-pending-edit-hint">Replace is available on active cards only.</p>';
    }
  } else if (isActiveCard) {
    if (failed) {
      const matches = owner.pendingCheckouts.filter(pc => pc.status === 'pending' && voucherKey(pc.voucher) === voucherKey(checkout.voucher));
      editor = `
        <div class="ful-replace-box">
          <button type="button" class="btn btn-primary btn-sm" data-replace-checkout="${escapeAttr(checkout.id)}" data-card-id="${escapeAttr(card.id)}" ${matches.length ? '' : 'disabled'}>${icon('refresh')}<span>Replace with pending request</span></button>
          <p class="ful-pending-edit-hint">${matches.length
            ? `${matches.length} pending ${escapeHtml(checkout.voucher)} request${matches.length === 1 ? '' : 's'} available to swap in.`
            : `No pending ${escapeHtml(checkout.voucher)} request available to replace this.`}</p>
        </div>`;
    } else {
      editor = renderOwnerCheckoutEdit(card, checkout);
    }
  }

  return `
    <article class="ful-pending-row ful-checkout-row">
      <details class="ful-pending-edit"${defaultOpen ? ' open' : ''}>
        <summary class="ful-pending-row-top">
          ${summary}
          <span class="ful-pending-row-end">
            ${statusBadge}
            <span class="ful-pending-chevron" aria-hidden="true">${icon('chevron-right')}</span>
          </span>
        </summary>
        <div class="ful-checkout-expand">
          ${contextBlock}
          ${actionsRow}
          ${editor}
        </div>
      </details>
    </article>
  `;
}

function renderCardApprovalSettings(card) {
  return `
    <div class="fulfillment-review-grid fulfillment-card-review" data-card-review="${escapeAttr(card.id)}">
      <div class="form-group">
        <label class="form-label">Account Cost *</label>
        <input class="form-input" data-review-account-cost type="number" inputmode="decimal" min="0" step="0.01" value="${escapeAttr(card.accountCost ?? 190)}" required />
      </div>
    </div>
  `;
}

function renderReviewInputs(checkout) {
  return `
    <div class="fulfillment-review-grid" data-review-row="${escapeAttr(checkout.id)}">
      <div class="form-group">
        <label class="form-label">Customer Payment *</label>
        <input class="form-input" data-review-total type="number" inputmode="decimal" min="0" step="0.01" required />
      </div>
      <div class="form-group">
        <label class="form-label">Checkout Cost *</label>
        <input class="form-input" data-review-discounted type="number" inputmode="decimal" min="0" step="0.01" value="${escapeAttr(checkout.expectedTotal || '')}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Refund</label>
        <input class="form-input" data-review-refund type="number" inputmode="decimal" min="0" step="0.01" value="0" />
      </div>
      <div class="form-group">
        <label class="form-label">Tracking</label>
        <input class="form-input" data-review-tracking autocomplete="off" />
      </div>
    </div>
  `;
}

function renderOwnerCheckoutEdit(card, checkout) {
  return `
      <form class="ful-checkout-edit-form" data-owner-edit-checkout="${escapeAttr(checkout.id)}" data-card-id="${escapeAttr(card.id)}" novalidate>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">CU Name *</label>
              <input class="form-input" name="customerName" autocomplete="name" value="${escapeAttr(checkout.customerName)}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Contact *</label>
              <input class="form-input" name="customerContact" type="tel" inputmode="tel" autocomplete="tel" value="${escapeAttr(checkout.customerContact)}" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Address *</label>
            <input class="form-input" name="customerAddress" autocomplete="street-address" value="${escapeAttr(checkout.customerAddress)}" required />
          </div>
          <div class="form-row ful-2col">
            <div class="form-group">
              <label class="form-label">Voucher *</label>
              <select class="form-select" name="voucher" required>${VOUCHERS.map(v => `<option ${voucherKey(v) === voucherKey(checkout.voucher) ? 'selected' : ''}>${v}</option>`).join('')}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Expected Total *</label>
              <input class="form-input" name="expectedTotal" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeAttr(checkout.expectedTotal)}" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Cart Link *</label>
            <input class="form-input" name="cartUrl" type="url" inputmode="url" autocomplete="url" value="${escapeAttr(checkout.cartUrl)}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Item Lines *</label>
            <textarea class="form-input fulfillment-textarea" name="itemLines" required>${escapeHtml(checkout.items.map(item => item.label).join('\n'))}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Checkout Notes</label>
            <textarea class="form-input fulfillment-textarea" name="checkoutNotes">${escapeHtml(checkout.notes || '')}</textarea>
          </div>
        <button type="submit" class="btn btn-secondary btn-sm">${icon('save')}<span>Save checkout</span></button>
      </form>
  `;
}

async function handleOwnerClick(event, owner) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (handleStepClick(event, target)) return;
  if (target.closest('[data-open-owner-create]')) {
    owner.createModalOpen = true;
    renderOwner(owner);
    return;
  }
  if (target.closest('[data-close-owner-create]')) {
    owner.createModalOpen = false;
    renderOwner(owner);
    return;
  }
  if (target.closest('[data-close-owner-card]')) {
    owner.ownerCardModalId = '';
    renderOwner(owner);
    return;
  }
  const toggleOwnerCardId = target.closest('[data-toggle-owner-card]')?.getAttribute('data-toggle-owner-card');
  if (toggleOwnerCardId) {
    owner.ownerCardModalId = toggleOwnerCardId;
    renderOwner(owner);
    return;
  }
  const ownerCardFilter = target.closest('[data-owner-card-filter]')?.getAttribute('data-owner-card-filter');
  if (ownerCardFilter) {
    owner.cardFilter = ownerCardFilter;
    owner.ownerCardModalId = '';
    renderOwner(owner);
    return;
  }
  if (target.closest('[data-create-board]')) {
    await createOwnerBoard(owner);
    return;
  }
  const copyText = target.closest('[data-copy-text]')?.getAttribute('data-copy-text');
  if (copyText) {
    await navigator.clipboard.writeText(copyText);
    showToast('Copied', 'success');
    return;
  }
  const regenerateInviteId = target.closest('[data-regenerate-invite]')?.getAttribute('data-regenerate-invite');
  if (regenerateInviteId) {
    await regenerateBookerInvite(owner, regenerateInviteId);
    return;
  }
  const revokeInviteId = target.closest('[data-revoke-invite]')?.getAttribute('data-revoke-invite');
  if (revokeInviteId) {
    await revokeBookerInvite(owner, revokeInviteId);
    return;
  }
  if (target.closest('[data-post-now]')) {
    await postNowFromPending(owner);
    return;
  }
  const removePendingId = target.closest('[data-remove-pending]')?.getAttribute('data-remove-pending');
  if (removePendingId) {
    await removePendingCheckout(owner, removePendingId);
    return;
  }
  const reopenBtn = target.closest('[data-reopen-checkout]');
  if (reopenBtn) {
    await reopenCheckout(owner, reopenBtn.getAttribute('data-card-id'), reopenBtn.getAttribute('data-reopen-checkout'));
    return;
  }
  const replaceBtn = target.closest('[data-replace-checkout]');
  if (replaceBtn) {
    await replaceFailedCheckout(owner, replaceBtn.getAttribute('data-card-id'), replaceBtn.getAttribute('data-replace-checkout'));
    return;
  }
  const approveId = target.closest('[data-approve-card]')?.getAttribute('data-approve-card');
  if (approveId) await approveOwnerCard(owner, approveId);
}

async function handleOwnerSubmit(event, owner) {
  if (event.target.id === 'fulfillment-board-settings') {
    event.preventDefault();
    if (!validateFormFields(event.target, { show: true })) return;
    await saveBoardSettings(owner, event.target);
    return;
  }
  if (event.target.id === 'booker-invite-form') {
    event.preventDefault();
    if (!validateFormFields(event.target, { show: true })) return;
    await createBookerInvite(owner, event.target);
    return;
  }
  if (event.target.id === 'fulfillment-card-form') {
    event.preventDefault();
    if (!validateFormFields(event.target, { show: true })) return;
    await submitPendingCheckout(owner, event.target);
    return;
  }
  const pendingEditId = event.target.getAttribute('data-owner-edit-pending');
  if (pendingEditId) {
    event.preventDefault();
    if (!validateFormFields(event.target, { show: true })) return;
    await savePendingCheckout(owner, pendingEditId, event.target);
    return;
  }
  const checkoutId = event.target.getAttribute('data-owner-edit-checkout');
  if (checkoutId) {
    event.preventDefault();
    if (!validateFormFields(event.target, { show: true })) return;
    await saveOwnerCheckout(owner, event.target.getAttribute('data-card-id'), checkoutId, event.target);
  }
}

async function createOwnerBoard(owner) {
  const user = getAuthUser();
  if (!user) return;
  const id = randomToken();
  await setDoc(boardRef(id), {
    ownerUid: user.uid,
    shopName: window.POS?.getState?.().shopName || '',
    active: true,
    gmailBase: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  showToast('Booker board created', 'success');
  await loadOwnerBoard(owner, { force: true });
}

async function saveBoardSettings(owner, form) {
  const data = new FormData(form);
  const gmailBase = String(data.get('gmailBase') || '').trim().toLowerCase();
  const targetVouchers = data.getAll('targetVouchers').map(v => String(v).trim()).filter(Boolean);
  await updateDoc(boardRef(owner.board.id), {
    gmailBase,
    targetVouchers,
    updatedAt: serverTimestamp()
  });
  showToast('Board settings saved', 'success');
  await loadOwnerBoard(owner, { force: true });
}

async function createBookerInvite(owner, form) {
  if (!owner.board) return;
  try {
    const user = getAuthUser();
    const bookerName = String(new FormData(form).get('bookerName') || '').trim().replace(/\s+/g, ' ');
    if (!user || !bookerName) return;
    const code = generateInviteCode();
    const inviteHash = await hashInviteCode(code);
    await setDoc(inviteRef(inviteHash), {
      ownerUid: user.uid,
      boardId: owner.board.id,
      bookerName,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    owner.revealedInviteCodes.set(inviteHash, code);
    form.reset();
    showToast('Invite code created', 'success');
    await loadOwnerBoard(owner, { force: true });
  } catch (err) {
    console.warn('invite create failed:', err);
    showToast(inviteErrorMessage(err), 'error');
  }
}

async function regenerateBookerInvite(owner, inviteHash) {
  const invite = owner.invites.find(item => item.id === inviteHash);
  if (!owner.board || !invite) return;
  try {
    const user = getAuthUser();
    const code = generateInviteCode();
    const nextHash = await hashInviteCode(code);
    const batch = writeBatch(getDb());
    batch.set(inviteRef(nextHash), {
      ownerUid: user.uid,
      boardId: owner.board.id,
      bookerName: invite.bookerName,
      active: true,
      regeneratedFrom: invite.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.update(inviteRef(invite.id), {
      active: false,
      regeneratedTo: nextHash,
      revokedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await batch.commit();
    owner.revealedInviteCodes.delete(invite.id);
    owner.revealedInviteCodes.set(nextHash, code);
    showToast('Invite code regenerated', 'success');
    await loadOwnerBoard(owner, { force: true });
  } catch (err) {
    console.warn('invite regenerate failed:', err);
    showToast(inviteErrorMessage(err), 'error');
  }
}

async function revokeBookerInvite(owner, inviteHash) {
  const invite = owner.invites.find(item => item.id === inviteHash);
  if (!invite || !invite.active) return;
  if (!(await showConfirm(`Revoke ${invite.bookerName}'s invite code?`, {
    confirmLabel: 'Revoke',
    danger: true
  }))) return;
  try {
    await updateDoc(inviteRef(invite.id), {
      active: false,
      revokedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    owner.revealedInviteCodes.delete(invite.id);
    showToast('Invite code revoked', 'success');
    await loadOwnerBoard(owner, { force: true });
  } catch (err) {
    console.warn('invite revoke failed:', err);
    showToast(inviteErrorMessage(err), 'error');
  }
}

async function submitPendingCheckout(owner, form) {
  if (!owner.board) return;
  const checkout = readCheckoutEntry(form);
  if (!checkout) return;
  const user = getAuthUser();
  try {
    const ref = doc(pendingCheckoutsRef(owner.board.id));
    await setDoc(ref, {
      ownerUid: user.uid,
      status: 'pending',
      assignedCardId: '',
      customerName: checkout.customerName,
      customerContact: checkout.customerContact,
      customerAddress: checkout.customerAddress,
      voucher: checkout.voucher,
      expectedTotal: checkout.expectedTotal,
      cartUrl: checkout.cartUrl,
      items: checkout.items,
      notes: checkout.notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    owner.createModalOpen = false;
    form.reset();
    showToast('Checkout request added to queue', 'success');
  } catch (err) {
    console.warn('pending checkout submit failed:', err);
    showToast('Failed to submit request. Try again.', 'error');
  }
}

async function savePendingCheckout(owner, pendingId, form) {
  if (!owner.board) return;
  const checkout = readCheckoutEntry(form);
  if (!checkout) return;
  try {
    await updateDoc(pendingCheckoutRef(owner.board.id, pendingId), {
      ...checkout,
      status: 'pending',
      updatedAt: serverTimestamp()
    });
    showToast('Checkout request updated', 'success');
  } catch (err) {
    console.warn('pending checkout update failed:', err);
    showToast('Failed to update request. Try again.', 'error');
  }
}

async function removePendingCheckout(owner, pendingId) {
  if (!owner.board) return;
  const pc = owner.pendingCheckouts.find(p => p.id === pendingId);
  if (!pc) return;
  if (!(await showConfirm(`Remove ${firstName(pc.customerName)}’s ${pc.voucher} request from the queue?`, {
    confirmLabel: 'Remove',
    danger: true
  }))) return;
  try {
    await deleteDoc(pendingCheckoutRef(owner.board.id, pendingId));
    showToast('Request removed from queue', 'success');
  } catch (err) {
    console.warn('pending checkout delete failed:', err);
    showToast('Failed to remove request. Try again.', 'error');
  }
}

function subscribePendingCheckouts(owner) {
  if (owner.pendingUnsub) { owner.pendingUnsub(); owner.pendingUnsub = null; }
  if (!owner.board) return;
  const q = query(
    pendingCheckoutsRef(owner.board.id),
    where('status', 'in', ['pending', 'failed']),
    orderBy('createdAt', 'asc')
  );
  owner.pendingUnsub = onSnapshot(q, async snap => {
    owner.pendingCheckouts = snap.docs.map(d => normalizePendingCheckout(d.id, d.data()));
    renderOwner(owner);
    await checkAndAutoGroup(owner);
  }, err => {
    console.warn('pending checkout snapshot error:', err);
    showToast('Pending queue sync stopped — refresh to reconnect.', 'error');
  });
}

function selectPendingBatch(pendingCheckouts, targetVouchers) {
  const usedIds = new Set();
  const selected = [];
  for (const target of targetVouchers) {
    const match = pendingCheckouts.find(pc => !usedIds.has(pc.id) && voucherKey(pc.voucher) === voucherKey(target));
    if (!match) return null;
    usedIds.add(match.id);
    selected.push(match);
  }
  return selected;
}

async function checkAndAutoGroup(owner) {
  if (autoGroupInFlight) return;
  if (!owner.board?.targetVouchers?.length) return;
  const pending = owner.pendingCheckouts.filter(pc => pc.status === 'pending');
  if (!pending.length) return;
  const batch = selectPendingBatch(pending, owner.board.targetVouchers);
  if (!batch) return;
  autoGroupInFlight = true;
  try {
    await createCardFromPending(owner, batch);
  } finally {
    autoGroupInFlight = false;
  }
}

async function createCardFromPending(owner, pendingBatch) {
  const user = getAuthUser();
  const db = getDb();
  const nextCardRef = doc(cardsRef(owner.board.id));
  try {
    await runTransaction(db, async transaction => {
      const pendingRefs = pendingBatch.map(pc => pendingCheckoutRef(owner.board.id, pc.id));
      const pendingSnaps = await Promise.all(pendingRefs.map(r => transaction.get(r)));
      for (const snap of pendingSnaps) {
        if (!snap.exists()) throw new Error('A pending checkout was deleted before it could be assigned.');
        if (snap.data().status !== 'pending') throw new Error('already assigned');
      }
      const timestamp = serverTimestamp();
      transaction.set(nextCardRef, {
        ownerUid: user.uid,
        status: 'open',
        bookerName: '',
        accountCost: 190,
        notes: '',
        createdAt: timestamp,
        updatedAt: timestamp
      });
      for (let i = 0; i < pendingSnaps.length; i++) {
        const pc = pendingSnaps[i].data();
        const coRef = doc(checkoutsRef(owner.board.id, nextCardRef.id));
        transaction.set(coRef, {
          ownerUid: user.uid,
          status: 'open',
          customerName: pc.customerName,
          customerContact: pc.customerContact,
          customerAddress: pc.customerAddress,
          voucher: pc.voucher,
          expectedTotal: pc.expectedTotal,
          cartUrl: pc.cartUrl,
          items: pc.items,
          notes: pc.notes,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        transaction.update(pendingRefs[i], {
          status: 'assigned',
          assignedCardId: nextCardRef.id,
          updatedAt: timestamp
        });
      }
      transaction.update(boardRef(owner.board.id), { updatedAt: timestamp });
    });
    showToast('Account card created from pending queue', 'success');
    await loadOwnerCards(owner);
    renderOwner(owner);
  } catch (err) {
    if (String(err.message).includes('already assigned')) {
      console.warn('Auto-group skipped: pending checkout already assigned');
    } else {
      console.warn('createCardFromPending failed:', err);
      showToast(err.message || 'Auto-create failed. Will retry on next queue update.', 'error');
    }
  }
}

async function postNowFromPending(owner) {
  const pending = owner.pendingCheckouts.filter(pc => pc.status === 'pending');
  if (!pending.length) {
    showToast('No pending requests to post.', 'error');
    return;
  }
  const confirmed = await showConfirm(
    `Post ${pending.length} pending request${pending.length === 1 ? '' : 's'} as a card now?`,
    { confirmLabel: 'Post Now' }
  );
  if (!confirmed) return;
  await createCardFromPending(owner, pending);
}

function readCheckoutEntry(form, options = {}) {
  const data = new FormData(form);
  const items = parseItemLines(data.get('itemLines'));
  const checkout = {
    customerName: String(data.get('customerName') || '').trim(),
    customerContact: String(data.get('customerContact') || '').trim(),
    customerAddress: String(data.get('customerAddress') || '').trim(),
    voucher: String(data.get('voucher') || '').trim(),
    expectedTotal: numberValue(data.get('expectedTotal'), -1),
    cartUrl: String(data.get('cartUrl') || '').trim(),
    items,
    notes: String(data.get('checkoutNotes') || '').trim()
  };
  if (!checkout.customerName || !checkout.voucher || checkout.expectedTotal < 0 || !checkout.cartUrl || !checkout.items.length) {
    if (!options.silent) showToast('CU name, voucher, expected total, cart link, and item lines are required.', 'error');
    return null;
  }
  return checkout;
}

function clearCheckoutEntry(form) {
  ['customerName', 'customerContact', 'customerAddress', 'expectedTotal', 'cartUrl', 'itemLines', 'checkoutNotes'].forEach(name => {
    const field = form.elements[name];
    if (field) field.value = '';
  });
  form.querySelectorAll('.is-invalid').forEach(field => field.classList.remove('is-invalid'));
  form.querySelectorAll('.form-error').forEach(error => error.remove());
  setStepFormIndex(form, 0);
}

function renderStepProgress(total) {
  return `
    <div class="fulfillment-stepper" data-stepper data-total="${total}">
      <div class="fulfillment-stepper-row">
        ${Array.from({ length: total }, (_, index) => `<span class="fulfillment-step-dot${index === 0 ? ' is-active' : ''}" data-step-dot="${index}"></span>`).join('')}
      </div>
      <div class="fulfillment-step-track"><span data-step-fill style="width:${100 / total}%"></span></div>
    </div>
  `;
}

function initializeStepForms(root = document) {
  root.querySelectorAll('[data-step-form]').forEach(form => {
    setStepFormIndex(form, numberValue(form.dataset.stepIndex, 0), { validate: false });
  });
}

function handleStepClick(event, target) {
  const jump = target.closest('[data-step-jump]');
  const next = target.closest('[data-step-next]');
  const prev = target.closest('[data-step-prev]');
  if (!jump && !next && !prev) return false;
  event.preventDefault();
  const form = target.closest('[data-step-form]');
  if (!form) return true;
  const current = getStepIndex(form);
  if (jump) {
    setStepFormIndex(form, numberValue(jump.getAttribute('data-step-jump'), current), { validate: false });
  } else if (next) {
    const panel = getStepPanel(form, current);
    if (panel && !validateStep(panel, { show: true })) return true;
    setStepFormIndex(form, current + 1);
  } else {
    setStepFormIndex(form, current - 1, { validate: false });
  }
  return true;
}

function handleValidationBlur(event) {
  const field = getValidatableField(event.target);
  if (!field) return;
  validateField(field, { show: true });
  if (field.matches('[data-step-autoadvance]')) maybeAutoAdvance(field);
}

function handleValidationInput(event) {
  const field = getValidatableField(event.target);
  if (field?.classList.contains('is-invalid')) validateField(field, { show: true });
}

function handleOwnerCustomerAutofill(event, owner) {
  const field = event.target;
  if (!(field instanceof HTMLInputElement) || field.name !== 'customerName') return;
  const form = field.closest('form');
  if (!form) return;
  const customer = findKnownOwnerCustomer(owner, field.value);
  if (!customer) return;
  const contact = form.elements.customerContact;
  const address = form.elements.customerAddress;
  if (contact instanceof HTMLInputElement && (!contact.value.trim() || event.type === 'change')) {
    contact.value = customer.contact || contact.value;
    validateField(contact, { show: false });
  }
  if (address instanceof HTMLInputElement && (!address.value.trim() || event.type === 'change')) {
    address.value = customer.address || address.value;
    validateField(address, { show: false });
  }
}

function getKnownOwnerCustomers(owner) {
  const customers = new Map();
  const addCustomer = (customer = {}) => {
    const name = String(customer.customerName || customer.name || '').trim().replace(/\s+/g, ' ');
    if (!name) return;
    const key = normalizeBookerName(name);
    const existing = customers.get(key) || { name, contact: '', address: '' };
    customers.set(key, {
      name: existing.name || name,
      contact: String(customer.customerContact || customer.contact || customer.customerTag || existing.contact || '').trim(),
      address: String(customer.customerAddress || customer.address || existing.address || '').trim()
    });
  };
  window.POS?.getState?.().orders?.forEach(addCustomer);
  owner.checkoutsByCard.forEach(checkouts => checkouts.forEach(addCustomer));
  owner.pendingCheckouts.forEach(addCustomer);
  return [...customers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function findKnownOwnerCustomer(owner, name) {
  const key = normalizeBookerName(name);
  if (!key) return null;
  return getKnownOwnerCustomers(owner).find(customer => normalizeBookerName(customer.name) === key) || null;
}

function maybeAutoAdvance(field) {
  const form = field.closest('[data-step-form]');
  if (!form) return;
  const current = getStepIndex(form);
  const panel = getStepPanel(form, current);
  const total = getStepTotal(form);
  if (current >= total - 1 || !panel) return;
  if (validateStep(panel, { show: false })) setStepFormIndex(form, current + 1);
}

function setStepFormIndex(form, requestedIndex, options = {}) {
  const total = getStepTotal(form);
  const index = Math.min(Math.max(Number(requestedIndex) || 0, 0), total - 1);
  form.dataset.stepIndex = String(index);
  form.querySelectorAll('[data-step]').forEach(panel => {
    const active = Number(panel.dataset.step) === index;
    panel.classList.toggle('is-active', active);
    panel.querySelector('[data-step-jump]')?.setAttribute('aria-expanded', active ? 'true' : 'false');
  });
  form.querySelectorAll('[data-step-dot]').forEach(dot => {
    const dotIndex = Number(dot.dataset.stepDot);
    dot.classList.toggle('is-active', dotIndex === index);
    dot.classList.toggle('is-complete', dotIndex < index);
  });
  const fill = form.querySelector('[data-step-fill]');
  if (fill) fill.style.width = `${((index + 1) / total) * 100}%`;
  const count = form.querySelector('[data-step-count]');
  if (count) count.textContent = `Step ${index + 1} of ${total}`;
  const prev = form.querySelector('[data-step-prev]');
  const next = form.querySelector('[data-step-next]');
  const submit = form.querySelector('button[type="submit"]');
  if (prev) prev.hidden = index === 0;
  if (next) next.hidden = index === total - 1;
  if (count) count.hidden = false;
  if (submit) submit.hidden = index !== total - 1;
  if (options.validate !== false) validateStep(getStepPanel(form, index), { show: false });
}

function getStepIndex(form) {
  return Number(form?.dataset.stepIndex || 0) || 0;
}

function getStepTotal(form) {
  return Math.max(1, form?.querySelectorAll('[data-step]').length || 1);
}

function getStepPanel(form, index) {
  return form?.querySelector(`[data-step="${index}"]`) || null;
}

function validateFormFields(form, options = {}) {
  if (!form) return true;
  const fields = [...form.querySelectorAll('input, select, textarea')].map(getValidatableField).filter(Boolean);
  const ok = fields.every(field => validateField(field, options));
  if (!ok) focusFirstInvalid(form);
  return ok;
}

function validateStep(panel, options = {}) {
  if (!panel) return true;
  const fields = [...panel.querySelectorAll('input, select, textarea')].map(getValidatableField).filter(Boolean);
  const ok = fields.every(field => validateField(field, options));
  if (!ok && options.show) focusFirstInvalid(panel);
  return ok;
}

function getValidatableField(target) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return null;
  if (target.type === 'hidden' || target.disabled || target.readOnly) return null;
  return target;
}

function validateField(field, options = {}) {
  const message = getFieldError(field);
  const shouldShow = options.show !== false;
  field.classList.toggle('is-invalid', Boolean(message) && shouldShow);
  let error = field.parentElement?.querySelector('.form-error');
  if (!message || !shouldShow) {
    error?.remove();
    return !message;
  }
  if (!error) {
    error = document.createElement('span');
    error.className = 'form-error';
    field.parentElement?.appendChild(error);
  }
  error.textContent = message;
  return false;
}

function getFieldError(field) {
  const value = String(field.value || '').trim();
  if (field.required && !value) return 'Required field.';
  if (!value) return '';
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email.';
  if (field.type === 'url' && !/^https?:\/\/\S+\.\S+/.test(value)) return 'Enter a valid cart link.';
  if (field.type === 'number') {
    const num = Number(value);
    const min = field.min === '' ? null : Number(field.min);
    if (!Number.isFinite(num)) return 'Enter a valid number.';
    if (min !== null && num < min) return `Must be ${min} or higher.`;
  }
  return '';
}

function focusFirstInvalid(root) {
  const invalid = root.querySelector('.is-invalid');
  if (!(invalid instanceof HTMLElement)) return;
  const panel = invalid.closest('[data-step]');
  const form = invalid.closest('[data-step-form]');
  if (panel && form) setStepFormIndex(form, Number(panel.dataset.step || 0), { validate: false });
  invalid.focus({ preventScroll: false });
}

async function saveOwnerCheckout(owner, cardId, checkoutId, form) {
  const checkout = readCheckoutEntry(form);
  if (!checkout) return;
  const timestamp = serverTimestamp();
  const batch = writeBatch(getDb());
  batch.update(checkoutRef(owner.board.id, cardId, checkoutId), {
    ...checkout,
    updatedAt: timestamp
  });
  batch.update(cardRef(owner.board.id, cardId), { updatedAt: timestamp });
  await batch.commit();
  showToast('Checkout updated', 'success');
  await loadOwnerBoard(owner, { force: true });
}

async function reopenCheckout(owner, cardId, checkoutId) {
  await updateDoc(checkoutRef(owner.board.id, cardId, checkoutId), {
    status: 'open',
    canFulfill: null,
    cannotFulfillReason: '',
    unavailableItems: [],
    fulfilledAt: null,
    failedAt: null,
    updatedAt: serverTimestamp()
  });
  await updateDoc(cardRef(owner.board.id, cardId), {
    status: 'fulfilling',
    updatedAt: serverTimestamp()
  });
  showToast('Checkout reopened', 'success');
  await loadOwnerBoard(owner, { force: true });
}

async function replaceFailedCheckout(owner, cardId, checkoutId) {
  if (!owner.board) return;
  const checkout = (owner.checkoutsByCard.get(cardId) || []).find(co => co.id === checkoutId);
  if (!checkout || checkout.status !== 'cannot_fulfill') return;
  const matches = owner.pendingCheckouts.filter(pc => pc.status === 'pending' && voucherKey(pc.voucher) === voucherKey(checkout.voucher));
  if (!matches.length) {
    showToast(`No pending ${checkout.voucher} request available.`, 'error');
    return;
  }
  const pendingId = await showPicker(`Replace ${firstName(checkout.customerName)}’s ${checkout.voucher} checkout with a pending request:`, {
    options: matches.map(pc => ({
      value: pc.id,
      label: pc.customerName || 'Customer',
      sublabel: `${peso(pc.expectedTotal)} · ${pc.voucher}`
    })),
    confirmLabel: 'Replace'
  });
  if (!pendingId) return;
  const db = getDb();
  const user = getAuthUser();
  try {
    await runTransaction(db, async transaction => {
      const coRef = checkoutRef(owner.board.id, cardId, checkoutId);
      const pendRef = pendingCheckoutRef(owner.board.id, pendingId);
      const [coSnap, pendSnap] = await Promise.all([transaction.get(coRef), transaction.get(pendRef)]);
      if (!coSnap.exists() || coSnap.data().status !== 'cannot_fulfill') throw new Error('checkout changed');
      if (!pendSnap.exists() || pendSnap.data().status !== 'pending') throw new Error('already taken');
      if (voucherKey(pendSnap.data().voucher) !== voucherKey(coSnap.data().voucher)) throw new Error('voucher mismatch');
      const failed = coSnap.data();
      const incoming = pendSnap.data();
      const timestamp = serverTimestamp();
      // Failed checkout returns to the queue (needs editing before re-pooling).
      transaction.set(doc(pendingCheckoutsRef(owner.board.id)), {
        ownerUid: user.uid,
        status: 'failed',
        assignedCardId: '',
        customerName: failed.customerName,
        customerContact: failed.customerContact,
        customerAddress: failed.customerAddress,
        voucher: failed.voucher,
        expectedTotal: failed.expectedTotal,
        cartUrl: failed.cartUrl,
        items: failed.items,
        notes: failed.notes,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      // Incoming request fills the checkout slot, reset to open.
      transaction.update(coRef, {
        status: 'open',
        customerName: incoming.customerName,
        customerContact: incoming.customerContact,
        customerAddress: incoming.customerAddress,
        voucher: incoming.voucher,
        expectedTotal: incoming.expectedTotal,
        cartUrl: incoming.cartUrl,
        items: incoming.items,
        notes: incoming.notes,
        canFulfill: null,
        cannotFulfillReason: '',
        unavailableItems: [],
        failedAt: null,
        updatedAt: timestamp
      });
      transaction.delete(pendRef);
      transaction.update(cardRef(owner.board.id, cardId), { status: 'fulfilling', updatedAt: timestamp });
    });
    showToast('Checkout replaced — failed request moved to the queue for editing.', 'success');
    await loadOwnerBoard(owner, { force: true });
  } catch (err) {
    if (String(err.message).includes('already taken')) {
      showToast('That request was just taken. Pick another.', 'error');
    } else {
      console.warn('replaceFailedCheckout failed:', err);
      showToast('Replace failed. Try again.', 'error');
    }
  }
}

async function approveOwnerCard(owner, cardId) {
  const card = owner.cards.find(item => item.id === cardId);
  const checkouts = owner.checkoutsByCard.get(cardId) || [];
  if (!card || card.status !== 'surrendered') return;
  const fulfilled = checkouts.filter(checkout => checkout.status === 'fulfilled');
  if (!fulfilled.length) {
    showToast('No fulfilled checkouts are ready for approval.', 'error');
    return;
  }
  const cardReview = owner.root.querySelector(`[data-card-review="${cssEscape(cardId)}"]`);
  const accountCostInput = cardReview?.querySelector('[data-review-account-cost]');
  const accountCostValue = accountCostInput?.value ?? String(card.accountCost ?? 190);
  if (accountCostInput && !validateField(accountCostInput, { show: true })) return;
  if (accountCostValue === '') {
    showToast('Account cost is required before approval.', 'error');
    return;
  }
  const reviewRows = {};
  for (const checkout of fulfilled) {
    const row = owner.root.querySelector(`[data-review-row="${cssEscape(checkout.id)}"]`);
    const totalPrice = row?.querySelector('[data-review-total]')?.value || '';
    const discountedPrice = row?.querySelector('[data-review-discounted]')?.value || '';
    if (totalPrice === '' || discountedPrice === '') {
      showToast('Customer payment and checkout cost are required for every fulfilled checkout.', 'error');
      return;
    }
    reviewRows[checkout.id] = {
      totalPrice,
      discountedPrice,
      refund: row?.querySelector('[data-review-refund]')?.value || 0,
      tracking: row?.querySelector('[data-review-tracking]')?.value || '',
      itemCount: checkout.items.length
    };
  }

  try {
    const reviewedCard = { ...card, accountCost: numberValue(accountCostValue, 190) };
    if (!window.POS?.prepareFulfillmentApproval || !window.POS?.commitFulfillmentApproval) {
      throw new Error('POS approval helpers are unavailable.');
    }
    const result = window.POS.prepareFulfillmentApproval(reviewedCard, checkouts, reviewRows);
    const batch = writeBatch(getDb());
    fulfilled.forEach(checkout => {
      batch.update(checkoutRef(owner.board.id, cardId, checkout.id), {
        status: 'approved',
        posOrderId: result.orderIdsByCheckout?.[checkout.id] || '',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    batch.update(cardRef(owner.board.id, cardId), {
      status: 'approved',
      accountCost: reviewedCard.accountCost,
      posAccountId: result.accountId,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    if (card.bookerName) {
      batch.set(bookerLockRef(owner.board.id, card.bookerName), {
        bookerName: card.bookerName,
        cardId,
        status: 'released',
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
    window.POS.commitFulfillmentApproval(result);
    owner.ownerCardModalId = '';
    showToast('Fulfilled checkouts approved to POS', 'success');
    await loadOwnerBoard(owner, { force: true });
  } catch (err) {
    showToast(err.message || 'Approval failed.', 'error');
  }
}

function initBookerApp() {
  document.body.classList.add('booker-route');
  document.querySelector('.app-shell')?.setAttribute('hidden', '');
  document.getElementById('auth-overlay')?.setAttribute('hidden', '');
  hideBookerPosChrome();

  const root = document.createElement('main');
  root.id = 'booker-app';
  root.className = 'booker-shell';
  document.body.appendChild(root);

  const state = {
    root,
    boardId: '',
    board: null,
    cards: [],
    checkoutsByCard: new Map(),
    bookerName: '',
    inviteHash: '',
    activeTab: 'unclaimed',
    accessStatus: 'checking',
    accessMessage: '',
    surrenderCardId: '',
    surrenderEmailSkipsByCard: new Map(),
    expandedCardIds: new Set(),
    expandedCheckoutIds: new Set(),
    boardUnsub: null,
    loading: true
  };

  root.addEventListener('click', event => handleBookerClick(event, state));
  root.addEventListener('submit', event => handleBookerSubmit(event, state));
  root.addEventListener('focusout', event => handleValidationBlur(event));
  root.addEventListener('input', event => handleValidationInput(event));
  if (IS_LOCAL_DEV_HOST && SEARCH_PARAMS.has('mock')) {
    applyMockBookerState(state);
    renderBooker(state);
    return;
  }
  loadBookerSession(state);
}

/* ─── Dev-only mock data (localhost + ?mock; never runs in prod) ─── */
function mockCheckout(id, customerName, voucher, expectedTotal, status, extra = {}) {
  return normalizeCheckout(id, {
    customerName, voucher, expectedTotal, status,
    customerContact: '0917 555 0142',
    customerAddress: 'Unit 4B, 12 Mabini St, Quezon City',
    cartUrl: `https://www.shein.com/cart#${id}`,
    items: [
      { label: 'Ribbed knit top — beige (M)' },
      { label: 'Wide-leg trousers — black (S)' },
      { label: 'Gold hoop earrings' }
    ].slice(0, (id.charCodeAt(id.length - 1) % 3) + 1),
    notes: extra.notes || '',
    ...extra
  });
}

function applyMockBookerState(state) {
  const now = Date.now();
  const at = ms => ({ toMillis: () => ms });
  const scenario = SEARCH_PARAMS.get('mock') || 'browse';
  state.bookerName = 'Maria Santos';
  state.board = normalizeBoard('mock-board', { active: true, gmailBase: 'shopmain@gmail.com' });
  state.accessStatus = 'ready';
  state.loading = false;
  const cards = [];
  const map = new Map();
  const add = (card, checkouts) => { cards.push(card); map.set(card.id, checkouts); };
  if (scenario === 'active') {
    state.activeTab = 'active';
    add(normalizeCard('c4', { status: 'fulfilling', bookerName: 'Maria Santos', claimedAt: at(now - 2.7e6), createdAt: at(now - 2.7e6) }),
      [mockCheckout('c4a', 'Fe Yu', '83%', 1450, 'fulfilled'), mockCheckout('c4b', 'Gigi Co', '70%', 990, 'open')]);
    add(normalizeCard('c5', { status: 'ready_to_surrender', bookerName: 'Maria Santos', claimedAt: at(now - 5.4e6), createdAt: at(now - 5.4e6) }),
      [mockCheckout('c5a', 'Hana Sy', '83%', 1450, 'fulfilled'), mockCheckout('c5b', 'Ivy Uy', '60%', 800, 'cannot_fulfill', { cannotFulfillReason: 'Out of stock on 2 of 3 items' })]);
    state.expandedCardIds = new Set(['c5']);
  } else {
    state.activeTab = 'unclaimed';
    add(normalizeCard('c1', { status: 'open', createdAt: at(now - 6e5) }),
      [mockCheckout('c1a', 'Ana Cruz', '83%', 1450, 'open'), mockCheckout('c1b', 'Bea Lim', '70%', 980, 'open')]);
    add(normalizeCard('c2', { status: 'open', createdAt: at(now - 12e5) }),
      [mockCheckout('c2a', 'Carla Reyes', '57%', 2300, 'open')]);
    add(normalizeCard('c3', { status: 'open', createdAt: at(now - 18e5) }),
      [mockCheckout('c3a', 'Dina Tan', '75%', 1750, 'open'), mockCheckout('c3b', 'Ella Ng', '60%', 1180, 'open'), mockCheckout('c3c', 'Faye Ong', '83%', 1450, 'open')]);
  }
  add(normalizeCard('c6', { status: 'approved', bookerName: 'Maria Santos', accountCost: 190, createdAt: at(now - 9e7) }),
    [mockCheckout('c6a', 'Joy Ho', '83%', 1450, 'approved'), mockCheckout('c6b', 'Kay Po', '75%', 1750, 'approved')]);
  state.cards = cards;
  state.checkoutsByCard = map;
}

function applyMockOwnerState(owner) {
  const now = Date.now();
  const at = ms => ({ toMillis: () => ms });
  owner.board = normalizeBoard('mock-board', { active: true, gmailBase: 'shopmain@gmail.com', ownerUid: 'mock-uid', targetVouchers: ['60%', '70%', '79%'] });
  owner.invites = [
    normalizeInvite('inv1', { bookerName: 'Maria Santos', active: true, boardId: 'mock-board', ownerUid: 'mock-uid', updatedAt: at(now - 8.6e7) }),
    normalizeInvite('inv2', { bookerName: 'Liza Reyes', active: false, boardId: 'mock-board', ownerUid: 'mock-uid', updatedAt: at(now - 1.7e8) })
  ];
  const cards = [];
  const map = new Map();
  const add = (card, checkouts) => { cards.push(card); map.set(card.id, checkouts); };
  add(normalizeCard('o1', { status: 'fulfilling', bookerName: 'Maria Santos', createdAt: at(now - 3.6e6) }),
    [mockCheckout('o1a', 'Ana Cruz', '83%', 1450, 'fulfilled'), mockCheckout('o1b', 'Ana Cruz', '60%', 980, 'cannot_fulfill', { cannotFulfillReason: 'Out of stock on 2 of 3 items' })]);
  add(normalizeCard('o2', { status: 'open', createdAt: at(now - 9e5) }),
    [mockCheckout('o2a', 'Carla Reyes', '57%', 2300, 'open')]);
  add(normalizeCard('o3', { status: 'surrendered', bookerName: 'Maria Santos', surrenderedEmail: 'shop.main+co3@gmail.com', generatedEmail: 'shop.main+co3@gmail.com', accountEmail: 'mariaco3@gmail.com', accountCost: 190, vouchers: ['59%', '70%'], expiresAt: new Date(now + 18 * 3.6e6).toISOString(), createdAt: at(now - 7.2e6) }),
    [mockCheckout('o3a', 'Dina Tan', '83%', 1450, 'fulfilled'), mockCheckout('o3b', 'Ella Ng', '75%', 1750, 'fulfilled')]);
  add(normalizeCard('o4', { status: 'approved', bookerName: 'Liza Reyes', accountCost: 190, createdAt: at(now - 9e7) }),
    [mockCheckout('o4a', 'Joy Ho', '83%', 1450, 'approved')]);
  owner.cards = cards;
  owner.checkoutsByCard = map;
  owner.cardFilter = 'active';
  owner.pendingCheckouts = [
    normalizePendingCheckout('p1', { customerName: 'Ana Cruz', voucher: '70%', expectedTotal: 980, items: [{ label: 'Knit top (M)' }], notes: '', status: 'pending', createdAt: at(now - 9e5) }),
    normalizePendingCheckout('p2', { customerName: 'Bea Lim', voucher: '60%', expectedTotal: 1180, items: [{ label: 'Wide trousers (S)' }], notes: '', status: 'pending', createdAt: at(now - 6e5) }),
    normalizePendingCheckout('p3', { customerName: 'Carmen Diaz', voucher: '79%', expectedTotal: 1620, items: [{ label: 'Linen dress (L)' }], notes: '', status: 'failed', createdAt: at(now - 3e5) })
  ];
}

function hideBookerPosChrome() {
  const fabToggle = document.getElementById('fab-toggle');
  const fabMenu = document.getElementById('fab-menu');
  const fabBackdrop = document.getElementById('fab-menu-backdrop');
  [fabToggle, fabMenu, fabBackdrop].forEach(element => {
    element?.setAttribute('hidden', '');
    element?.classList.remove('visible', 'open');
  });
  fabToggle?.setAttribute('aria-expanded', 'false');
}

async function loadBookerSession(state) {
  if (state.boardUnsub) { state.boardUnsub(); state.boardUnsub = null; }
  state.accessStatus = 'checking';
  state.accessMessage = '';
  state.loading = true;
  renderBooker(state);
  try {
    const user = await window.POSFirebase?.ensureBookerAuth?.();
    if (!user) throw new Error('Booker sign-in is unavailable.');
    const snap = await getDoc(sessionRef(user.uid));
    if (!snap.exists() || snap.data().active !== true) {
      state.accessStatus = 'needs_code';
      state.loading = false;
      renderBooker(state);
      return;
    }
    const session = normalizeBookerSession(user.uid, snap.data());
    const inviteSnap = await getDoc(inviteRef(session.inviteHash));
    if (!inviteSnap.exists() || inviteSnap.data().active !== true) {
      localStorage.removeItem(BOOKER_SESSION_KEY);
      state.accessStatus = 'needs_code';
      state.accessMessage = 'Your invite code was revoked or regenerated. Enter the latest code from the shop owner.';
      state.loading = false;
      renderBooker(state);
      return;
    }
    applyBookerSession(state, session);
    localStorage.setItem(BOOKER_SESSION_KEY, JSON.stringify({ inviteHash: session.inviteHash, boardId: session.boardId }));
    await updateDoc(sessionRef(user.uid), { lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
    await loadBookerBoard(state);
  } catch (err) {
    console.warn('booker session load failed:', err);
    state.accessStatus = 'needs_code';
    state.accessMessage = err?.code === 'auth/operation-not-allowed'
      ? 'Anonymous Auth is not enabled yet. Ask the owner to enable it in Firebase Authentication.'
      : 'Enter your invite code to access the booker board.';
    state.loading = false;
    renderBooker(state);
  }
}

function applyBookerSession(state, session) {
  state.boardId = session.boardId;
  state.bookerName = session.bookerName;
  state.inviteHash = session.inviteHash;
  state.accessStatus = 'ready';
}

async function redeemBookerInvite(state, code) {
  const user = await window.POSFirebase?.ensureBookerAuth?.();
  if (!user) throw new Error('Booker sign-in is unavailable.');
  const inviteHash = await hashInviteCode(code);
  const snap = await getDoc(inviteRef(inviteHash));
  if (!snap.exists() || snap.data().active !== true) throw new Error('Invite code is invalid or revoked.');
  const invite = normalizeInvite(inviteHash, snap.data());
  const session = {
    inviteHash,
    boardId: invite.boardId,
    ownerUid: invite.ownerUid,
    bookerName: invite.bookerName,
    active: true,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(sessionRef(user.uid), session, { merge: true });
  applyBookerSession(state, { id: user.uid, ...session });
  localStorage.setItem(BOOKER_SESSION_KEY, JSON.stringify({ inviteHash, boardId: invite.boardId }));
  await loadBookerBoard(state);
}

async function loadBookerBoard(state) {
  if (state.boardUnsub) { state.boardUnsub(); state.boardUnsub = null; }
  state.loading = true;
  renderBooker(state);
  try {
    const snap = await getDoc(boardRef(state.boardId));
    if (!snap.exists() || !snap.data().active) {
      state.board = null;
      state.cards = [];
      state.checkoutsByCard = new Map();
      state.loading = false;
      renderBooker(state);
      return;
    }
    state.board = normalizeBoard(snap.id, snap.data());
    subscribeBookerBoard(state);
  } catch (err) {
    console.warn('booker board load failed:', err);
    state.loading = false;
    renderBooker(state);
  }
}

function subscribeBookerBoard(state) {
  if (state.boardUnsub) { state.boardUnsub(); state.boardUnsub = null; }
  let unclaimedCards = [];
  let myCards = [];
  let refreshId = 0;
  const refreshCards = async () => {
    const currentRefreshId = ++refreshId;
    try {
      const cards = Array.from(new Map([...unclaimedCards, ...myCards].map(card => [card.id, card])).values())
        .sort((a, b) => statusSort(a.status) - statusSort(b.status) || toMs(a.createdAt) - toMs(b.createdAt));
      const pairs = await Promise.all(cards.map(async card => {
        const checkoutSnap = await getDocs(checkoutsRef(state.boardId, card.id));
        return [
          card.id,
          checkoutSnap.docs.map(docSnap => normalizeCheckout(docSnap.id, docSnap.data())).sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))
        ];
      }));
      if (currentRefreshId !== refreshId) return;
      state.cards = cards;
      state.checkoutsByCard = new Map(pairs);
      state.loading = false;
      // Don't clobber an in-progress surrender form; refresh data silently and render when it closes.
      if (!state.surrenderCardId) renderBooker(state);
    } catch (err) {
      console.warn('booker board sync failed:', err);
      state.loading = false;
    }
  };
  const handleSnapshot = async (bucket, cardSnap) => {
    const cards = cardSnap.docs.map(docSnap => normalizeCard(docSnap.id, docSnap.data()));
    if (bucket === 'mine') myCards = cards;
    else unclaimedCards = cards;
    await refreshCards();
  };
  const handleError = err => {
    console.warn('booker board snapshot error:', err);
    state.loading = false;
  };
  const unclaimedUnsub = onSnapshot(
    query(cardsRef(state.boardId), where('bookerName', '==', '')),
    cardSnap => { handleSnapshot('unclaimed', cardSnap); },
    handleError
  );
  const mineUnsub = onSnapshot(
    query(cardsRef(state.boardId), where('bookerName', '==', state.bookerName)),
    cardSnap => { handleSnapshot('mine', cardSnap); },
    handleError
  );
  state.boardUnsub = () => {
    unclaimedUnsub();
    mineUnsub();
  };
}

function renderBooker(state) {
  document.title = state.bookerName ? `${state.bookerName} - Booker Board` : 'Booker Board';
  if (state.accessStatus === 'checking') {
    state.root.innerHTML = '<section class="booker-card"><p class="empty-note">Preparing secure booker access...</p></section>';
    return;
  }
  if (state.accessStatus === 'needs_code') {
    state.root.innerHTML = renderBookerCodeForm(state);
    return;
  }
  if (state.loading) {
    state.root.innerHTML = '<section class="booker-card"><p class="empty-note">Loading booker board...</p></section>';
    return;
  }
  if (!state.board) {
    state.root.innerHTML = '<section class="booker-card"><h1>Board unavailable</h1><p class="fulfillment-muted">This link is invalid or has been revoked.</p></section>';
    return;
  }
  const activeCard = getActiveBookerCard(state);
  const unclaimedCards = state.cards.filter(card => card.status === 'open' && !card.bookerName);
  const activeCards = state.cards.filter(card => isBookerOwnedCard(state, card) && BOOKER_BUSY_CARD_STATUSES.includes(card.status));
  state.root.innerHTML = `
    <header class="booker-header">
      <div>
        <span class="page-kicker">Booker Board</span>
        <h1>${escapeHtml(state.bookerName)}</h1>
      </div>
      ${iconButton('Refresh board', 'refresh', 'type="button" data-booker-refresh', 'secondary', 'sm')}
    </header>
    ${!state.board.gmailBase ? '<section class="booker-card"><p class="booker-lock">Gmail base is not configured yet. Tell the owner before surrendering an account.</p></section>' : ''}
    ${activeCard && state.activeTab === 'unclaimed' ? '<section class="booker-card"><p class="booker-note">Finish your current CO before claiming another account.</p></section>' : ''}
    ${renderBookerTabContent(state, unclaimedCards, activeCards)}
    ${renderBookerBottomNav(state, unclaimedCards.length, activeCards.length)}
    ${state.surrenderCardId ? renderSurrenderModal(state) : ''}
  `;
  initializeStepForms(state.root);
}

function renderBookerCodeForm(state) {
  return `
    <section class="booker-name-gate">
      <form id="booker-code-form" class="booker-card booker-name-panel" novalidate>
        <div>
          <span class="page-kicker">Booker Board</span>
          <h1>Enter invite code</h1>
        </div>
        ${state.accessMessage ? `<p class="booker-lock">${escapeHtml(state.accessMessage)}</p>` : ''}
        <div class="form-group">
          <label class="form-label">Invite Code</label>
          <input class="form-input invite-code-input" name="inviteCode" inputmode="text" autocomplete="one-time-code" placeholder="ABCD-EFGH-IJKL" required />
        </div>
        <button type="submit" class="btn btn-primary btn-full">Continue</button>
      </form>
    </section>
  `;
}

function renderBookerTabContent(state, unclaimedCards, activeCards) {
  if (state.activeTab === 'active') {
    return `
      <section class="booker-card-list">
        ${activeCards.length ? activeCards.map(card => renderBookerCard(state, card)).join('') : '<section class="booker-card"><p class="empty-note">No active CO right now.</p></section>'}
      </section>
    `;
  }
  if (state.activeTab === 'stats') return renderBookerStats(state);
  return `
    <section class="booker-card-list">
      ${unclaimedCards.length ? unclaimedCards.map(card => renderBookerCard(state, card)).join('') : '<section class="booker-card"><p class="empty-note">No unclaimed CO right now.</p></section>'}
    </section>
  `;
}

function renderBookerBottomNav(state, unclaimedCount, activeCount) {
  return `
    <nav class="booker-bottom-nav" aria-label="Booker navigation">
      ${renderBookerNavButton(state, 'unclaimed', 'Unclaimed', unclaimedCount)}
      ${renderBookerNavButton(state, 'active', 'Active', activeCount)}
      ${renderBookerNavButton(state, 'stats', 'Stats', '')}
    </nav>
  `;
}

function renderBookerNavButton(state, tab, label, count) {
  const active = state.activeTab === tab;
  const iconName = { unclaimed: 'list', active: 'activity', stats: 'bar-chart' }[tab] || 'list';
  return `
    <button type="button" class="booker-nav-btn ${active ? 'is-active' : ''}" data-booker-tab="${tab}" aria-label="${escapeAttr(label)}">
      <span class="booker-nav-icon">${icon(iconName)}</span>
      <span>${escapeHtml(label)}</span>
      ${count !== '' ? `<strong>${count}</strong>` : ''}
    </button>
  `;
}

function renderBookerStats(state) {
  const stats = getBookerStats(state);
  return `
    <section class="booker-card booker-stats-card">
      <div>
        <span class="page-kicker">Approved Stats</span>
        <h2>${escapeHtml(state.bookerName)}</h2>
      </div>
      <div class="booker-stats-grid">
        <div><span>Items Checked Out</span><strong>${stats.items}</strong></div>
        <div><span>Accounts Sold</span><strong>${stats.accounts}</strong></div>
        <div><span>Earnings</span><strong>${peso(stats.earnings)}</strong></div>
      </div>
      <p class="fulfillment-muted">Stats update after the shop owner approves surrendered accounts.</p>
    </section>
  `;
}

function getBookerStats(state) {
  const approvedCards = state.cards.filter(card => isBookerOwnedCard(state, card) && card.status === 'approved');
  return approvedCards.reduce((stats, card) => {
    const approvedCheckouts = (state.checkoutsByCard.get(card.id) || []).filter(checkout => checkout.status === 'approved');
    stats.accounts += 1;
    stats.earnings += Number(card.accountCost || 0);
    stats.items += approvedCheckouts.reduce((sum, checkout) => sum + checkout.items.length, 0);
    return stats;
  }, { accounts: 0, earnings: 0, items: 0 });
}

function renderBookerCard(state, card) {
  const checkouts = state.checkoutsByCard.get(card.id) || [];
  if (!card.bookerName && card.status === 'open') return renderBookerUnclaimedRow(state, card, checkouts);
  const ours = isBookerOwnedCard(state, card);
  const claimedByOther = card.bookerName && !ours;
  const done = checkouts.length > 0 && checkouts.every(checkout => ['fulfilled', 'cannot_fulfill', 'approved'].includes(checkout.status));
  const expanded = state.expandedCardIds.has(card.id);
  const totalItems = checkouts.reduce((sum, checkout) => sum + checkout.items.length, 0);
  const expectedTotal = checkouts.reduce((sum, checkout) => sum + Number(checkout.expectedTotal || 0), 0);
  const vouchers = uniqueByVoucherKey(checkouts.map(checkout => checkout.voucher).filter(Boolean));
  const claimedAge = getClaimedAge(card);
  const staleClaim = isStaleClaim(card);
  const canExpand = Boolean(ours);
  const claimBlockedByActiveCard = !card.bookerName && Boolean(getActiveBookerCard(state, card.id));
  const canClaim = !card.bookerName && state.bookerName && !claimBlockedByActiveCard;
  const nextCheckout = getNextBookerCheckout(card, checkouts, ours);
  const nextCheckoutKey = nextCheckout ? checkoutExpansionKey(card.id, nextCheckout.id) : '';
  const nextCheckoutExpanded = nextCheckoutKey ? state.expandedCheckoutIds.has(nextCheckoutKey) : false;
  const summaryOpen = canExpand
    ? `<button type="button" class="booker-account-summary" data-toggle-booker-card="${escapeAttr(card.id)}" aria-expanded="${expanded ? 'true' : 'false'}">`
    : '<div class="booker-account-summary is-locked" aria-expanded="false" aria-disabled="true">';
  const summaryClose = canExpand ? '</button>' : '</div>';
  const title = `${checkouts.length} checkout${checkouts.length === 1 ? '' : 's'}`;
  const action = canClaim
    ? `<button type="button" class="booker-card-action booker-card-action-cta" data-claim-card="${escapeAttr(card.id)}">Claim <span aria-hidden="true">→</span></button>`
    : claimBlockedByActiveCard ? '<span class="booker-card-action is-disabled">Finish current CO</span>'
    : canExpand ? `<span class="booker-card-action is-link" aria-hidden="true">${icon(expanded ? 'chevron-down' : 'chevron-right')}</span>` : '';
  return `
    <article class="booker-card booker-account-card ${expanded ? 'is-expanded' : ''}">
      ${summaryOpen}
        <div class="booker-card-head">
          <span class="badge ${statusClass(card.status)}">${escapeHtml(getBookerCardState(card, ours, claimedByOther))}</span>
          <span class="booker-card-action-slot">${action}</span>
        </div>
        <div class="booker-account-main">
          <h2 class="booker-card-title">${escapeHtml(title)}</h2>
          ${vouchers.length ? `<div class="booker-voucher-chips" aria-label="Vouchers needed">${vouchers.map(voucher => `<span class="voucher-chip">${escapeHtml(voucher)}</span>`).join('')}</div>` : '<p class="fulfillment-muted">No voucher set yet</p>'}
          <div class="booker-card-meta-row" aria-label="Account card summary">
            <span><strong>${totalItems}</strong> item${totalItems === 1 ? '' : 's'}</span>
            <span><strong>${peso(expectedTotal)}</strong> expected</span>
            ${claimedAge ? `<span class="booker-claim-age ${staleClaim ? 'is-stale' : ''}">${escapeHtml(claimedAge)}</span>` : ''}
          </div>
          ${nextCheckout ? renderBookerNextSummary(nextCheckout, expanded) : ''}
          ${claimedByOther ? `<span class="booker-claimed-by">Claimed by ${escapeHtml(card.bookerName)}</span>` : ''}
        </div>
      ${summaryClose}
      ${expanded && nextCheckout ? renderBookerNextActionPanel(card, nextCheckout, nextCheckoutExpanded) : ''}
      ${expanded ? `
        <div class="list-stack booker-checkout-list">
          ${checkouts.map(checkout => renderBookerCheckout(state, card, checkout, ours)).join('')}
        </div>
      ` : ''}
      ${expanded && ours && done && !['surrendered', 'approved'].includes(card.status) ? `
        <div class="booker-surrender-cta">
          <p class="fulfillment-muted">Before surrendering, send order-status screenshots for each checkout to the shop owner on Messenger.</p>
          <button type="button" class="btn btn-primary btn-full" data-open-surrender="${escapeAttr(card.id)}" ${state.board.gmailBase ? '' : 'disabled'}>Surrender Account</button>
        </div>
      ` : ''}
      ${card.status === 'surrendered' ? '<p class="booker-done">Surrender submitted. Send/confirm screenshots in Messenger, then wait for owner review.</p>' : ''}
    </article>
  `;
}

function renderBookerUnclaimedRow(state, card, checkouts) {
  const totalItems = checkouts.reduce((sum, checkout) => sum + checkout.items.length, 0);
  const expectedTotal = checkouts.reduce((sum, checkout) => sum + Number(checkout.expectedTotal || 0), 0);
  const vouchers = uniqueByVoucherKey(checkouts.map(checkout => checkout.voucher).filter(Boolean));
  const claimBlocked = Boolean(getActiveBookerCard(state, card.id));
  const canClaim = state.bookerName && !claimBlocked;
  const action = canClaim
    ? `<button type="button" class="booker-card-action booker-card-action-cta" data-claim-card="${escapeAttr(card.id)}">Claim <span aria-hidden="true">→</span></button>`
    : claimBlocked ? '<span class="booker-card-action is-disabled">Finish current CO</span>' : '';
  const meta = `${checkouts.length} checkout${checkouts.length === 1 ? '' : 's'} · ${totalItems} item${totalItems === 1 ? '' : 's'} · ${peso(expectedTotal)}`;
  return `
    <article class="ful-pending-row booker-unclaimed-row">
      <div class="ful-pending-row-top ful-pending-row-top--static">
        <div class="ful-pending-row-info">
          ${vouchers.length
            ? vouchers.map(voucher => `<span class="ful-voucher-pill">${escapeHtml(voucher)}</span>`).join('')
            : '<span class="fulfillment-muted">No voucher set</span>'}
          <span class="ful-pending-meta">${escapeHtml(meta)}</span>
        </div>
        <span class="ful-pending-row-end">${action}</span>
      </div>
    </article>
  `;
}

function getNextBookerCheckout(card, checkouts, ours) {
  if (!ours || ['surrendered', 'approved'].includes(card.status)) return null;
  return checkouts.find(checkout => !['fulfilled', 'cannot_fulfill', 'approved'].includes(checkout.status)) || null;
}

function renderBookerNextSummary(checkout, expanded) {
  return `
    <div class="booker-next-summary" aria-label="Next checkout">
      <span class="booker-next-label">Next checkout</span>
      <strong>${escapeHtml(checkout.customerName || 'Customer')}</strong>
      <span>${escapeHtml(checkout.voucher || 'Voucher')} - ${expanded ? 'review below' : 'tap card to review'}</span>
    </div>
  `;
}

function renderBookerNextActionPanel(card, checkout, expanded) {
  const expansionKey = checkoutExpansionKey(card.id, checkout.id);
  return `
    <div class="booker-next-panel" aria-label="Next checkout action">
      <div class="booker-next-panel-copy">
        <span class="booker-next-label">Next step</span>
        <strong>${escapeHtml(checkout.customerName || 'Customer')}</strong>
        <span>Open the cart, review the checkout, then mark the outcome.</span>
      </div>
      <div class="booker-next-panel-actions">
        ${checkout.cartUrl ? `<a class="btn btn-secondary booker-next-cart" href="${escapeAttr(checkout.cartUrl)}" target="_blank" rel="noreferrer">${icon('external')}<span>Open cart</span></a>` : ''}
        <button type="button" class="btn btn-primary" data-toggle-booker-checkout="${escapeAttr(expansionKey)}" data-focus-booker-checkout aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? 'Hide details' : 'Review details'}</button>
      </div>
    </div>
  `;
}

function getBookerCardState(card, ours, claimedByOther) {
  if (!card.bookerName) return 'Open';
  if (claimedByOther) return 'Claimed';
  return labelStatus(card.status);
}

function getClaimedAge(card) {
  if (!card.bookerName || !['claimed', 'fulfilling'].includes(card.status)) return '';
  return `since ${formatElapsedSince(card.claimedAt)} ago`;
}

function isStaleClaim(card) {
  const claimedMs = toMs(card.claimedAt);
  return Boolean(card.bookerName && claimedMs && ['claimed', 'fulfilling'].includes(card.status) && Date.now() - claimedMs >= 3600000);
}

function getActiveBookerCard(state, excludeCardId = '') {
  if (!state.bookerName) return null;
  return state.cards.find(card => (
    card.id !== excludeCardId
    && normalizeBookerName(card.bookerName) === normalizeBookerName(state.bookerName)
    && BOOKER_BUSY_CARD_STATUSES.includes(card.status)
  )) || null;
}

function isBookerOwnedCard(state, card) {
  return Boolean(state.bookerName && normalizeBookerName(card.bookerName) === normalizeBookerName(state.bookerName));
}

function renderBookerCheckout(state, card, checkout, ours) {
  const canEdit = ours && !['surrendered', 'approved'].includes(card.status) && !['fulfilled', 'cannot_fulfill', 'approved'].includes(checkout.status);
  const expansionKey = checkoutExpansionKey(card.id, checkout.id);
  const expanded = state.expandedCheckoutIds.has(expansionKey);
  return `
    <article class="booker-checkout ${expanded ? 'is-expanded' : ''}">
      <button type="button" class="booker-checkout-summary" data-toggle-booker-checkout="${escapeAttr(expansionKey)}" aria-expanded="${expanded ? 'true' : 'false'}">
        <div class="ful-pending-row-info">
          <span class="ful-voucher-pill">${escapeHtml(checkout.voucher || 'Voucher')}</span>
          <strong>${escapeHtml(checkout.customerName || 'Customer')}</strong>
          <span class="ful-pending-meta">${peso(checkout.expectedTotal)} · ${checkout.items.length} item${checkout.items.length === 1 ? '' : 's'}</span>
        </div>
        <div class="booker-checkout-summary-side">
          <span class="badge ${statusClass(checkout.status)}">${labelStatus(checkout.status)}</span>
          <span class="booker-expand-mark" aria-hidden="true">${icon(expanded ? 'chevron-down' : 'chevron-right')}</span>
        </div>
      </button>
      ${expanded ? `
        <div class="booker-checkout-body">
          <div class="booker-detail-grid">
            <div class="span-2"><span class="field-label">Phone / Contact</span><span class="field-main wrap">${escapeHtml(checkout.customerContact || 'Not provided')}</span></div>
            <div class="span-2"><span class="field-label">Address</span><span class="field-main wrap">${escapeHtml(checkout.customerAddress || 'Not provided')}</span></div>
            <div><span class="field-label">Items</span><span class="field-main">${checkout.items.length}</span></div>
            <div><span class="field-label">Expected Total</span><span class="field-main">${peso(checkout.expectedTotal)}</span></div>
          </div>
          <ul class="booker-item-list">
            ${checkout.items.map(item => `<li>${escapeHtml(item.label)}</li>`).join('')}
          </ul>
          ${checkout.cartUrl ? `<a class="btn btn-secondary btn-full booker-cart-btn" href="${escapeAttr(checkout.cartUrl)}" target="_blank" rel="noreferrer">${icon('external')}<span>Open cart in SHEIN</span></a>` : ''}
          ${checkout.notes ? `<p class="booker-note">${escapeHtml(checkout.notes)}</p>` : ''}
          ${checkout.status === 'fulfilled' ? '<p class="booker-done">Fulfilled. Send the order-status screenshot to Messenger.</p>' : ''}
          ${checkout.status === 'cannot_fulfill' ? `<p class="booker-lock">Cannot fulfill: ${escapeHtml(checkout.cannotFulfillReason || 'No reason saved')}</p>` : ''}
          ${canEdit ? renderCheckoutActionButtons(card, checkout) : ''}
        </div>
      ` : ''}
    </article>
  `;
}

function renderCheckoutActionButtons(card, checkout) {
  return `
    <p class="booker-task-hint">Order this on SHEIN with the voucher, then mark it:</p>
    <div class="booker-decision-actions">
      <button type="button" class="btn btn-primary" data-mark-checkout="fulfilled" data-card-id="${escapeAttr(card.id)}" data-checkout-id="${escapeAttr(checkout.id)}">Mark as ordered</button>
      <button type="button" class="btn btn-danger" data-mark-checkout="cannot_fulfill" data-card-id="${escapeAttr(card.id)}" data-checkout-id="${escapeAttr(checkout.id)}">Can't order this</button>
    </div>
  `;
}

function checkoutExpansionKey(cardId, checkoutId) {
  return `${cardId}:${checkoutId}`;
}

function renderExpiryHourOptions() {
  return Array.from({ length: 24 }, (_, index) => {
    const hours = index + 1;
    return `<option value="${hours}" ${hours === 24 ? 'selected' : ''}>${hours} hour${hours === 1 ? '' : 's'} left</option>`;
  }).join('');
}

function renderSurrenderModal(state) {
  const card = state.cards.find(item => item.id === state.surrenderCardId);
  if (!card) return '';
  const generatedOptions = generateAvailableGmailOptions(state.board.gmailBase, getReservedEmails(state.cards, card.id));
  const skipCount = state.surrenderEmailSkipsByCard.get(card.id) || 0;
  const generatedEmail = card.generatedEmail || generatedOptions[skipCount % Math.max(generatedOptions.length, 1)] || '';
  return `
    <div class="booker-surrender-modal" role="dialog" aria-modal="true">
      <div class="booker-surrender-panel">
        <div class="fulfillment-panel-head">
          <div>
            <span class="page-kicker">Surrender</span>
            <h2>Account Details</h2>
          </div>
          ${iconButton('Close surrender form', 'x', 'type="button" data-close-surrender', 'ghost', 'sm')}
        </div>
        <form class="booker-surrender-form fulfillment-step-form" data-surrender-form="${escapeAttr(card.id)}" data-step-form data-step-index="0" novalidate>
          ${renderStepProgress(2)}
          <section class="fulfillment-step-panel is-active" data-step="0">
            <div class="fulfillment-form-section">
              <span class="section-label">Step 1 of 2</span>
              <h4>Account Login</h4>
              <div class="booker-surrender-target">
                <span class="field-label">Generated surrender email</span>
                <span class="field-main wrap">${escapeHtml(generatedEmail || 'No available Gmail dot variant')}</span>
                <input type="hidden" name="generatedEmail" value="${escapeAttr(generatedEmail)}" />
                ${iconButton('Regenerate surrender email', 'rotate', `type="button" data-regenerate-surrender="${escapeAttr(card.id)}" ${generatedOptions.length > 1 ? '' : 'disabled'}`, 'secondary', 'sm')}
              </div>
              <div class="form-group">
                <label class="form-label">Created Account Email *</label>
                <input class="form-input" name="accountEmail" type="email" inputmode="email" autocomplete="email" required />
              </div>
              <div class="form-group">
                <label class="form-label">Password *</label>
                <input class="form-input" name="accountPassword" type="password" autocomplete="current-password" required data-step-autoadvance />
              </div>
            </div>
          </section>
          <section class="fulfillment-step-panel" data-step="1">
            <div class="fulfillment-form-section">
              <span class="section-label">Step 2 of 2</span>
              <h4>Vouchers & Expiry</h4>
              <div class="pair-2col">
                <div class="form-group">
                  <label class="form-label">Unused Vouchers</label>
                  <input class="form-input" name="vouchers" placeholder="e.g. 59%, 60%" autocomplete="off" />
                </div>
                <div class="form-group">
                  <label class="form-label">Hours Until Expiry *</label>
                  <select class="form-select" name="expiryHoursLeft" required>
                    ${renderExpiryHourOptions()}
                  </select>
                </div>
              </div>
            </div>
          </section>
          <p class="booker-note">Send screenshots of every checkout order status to the shop owner on Messenger. Do not upload proof here.</p>
          <div class="fulfillment-step-footer">
            ${iconButton('Back', 'arrow-left', 'type="button" data-step-prev', 'ghost')}
            <span class="fulfillment-step-count" data-step-count>Step 1 of 2</span>
            ${iconButton('Next', 'arrow-right', 'type="button" data-step-next')}
            <button type="submit" class="btn btn-primary btn-full" ${generatedEmail ? '' : 'disabled'}>Submit Surrender</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleBookerClick(event, state) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (handleStepClick(event, target)) return;
  if (target.closest('[data-booker-refresh]')) {
    await loadBookerSession(state);
    return;
  }
  const tab = target.closest('[data-booker-tab]')?.getAttribute('data-booker-tab');
  if (tab) {
    state.activeTab = tab;
    renderBooker(state);
    return;
  }
  const toggleCardId = target.closest('[data-toggle-booker-card]')?.getAttribute('data-toggle-booker-card');
  if (toggleCardId) {
    const card = state.cards.find(item => item.id === toggleCardId);
    if (!card || !isBookerOwnedCard(state, card)) return;
    toggleSingleExpanded(state.expandedCardIds, toggleCardId);
    state.expandedCheckoutIds.clear();
    renderBooker(state);
    return;
  }
  const toggleCheckout = target.closest('[data-toggle-booker-checkout]');
  const toggleCheckoutId = toggleCheckout?.getAttribute('data-toggle-booker-checkout');
  if (toggleCheckoutId) {
    const shouldFocusCheckout = toggleCheckout.hasAttribute('data-focus-booker-checkout') && !state.expandedCheckoutIds.has(toggleCheckoutId);
    toggleSingleExpanded(state.expandedCheckoutIds, toggleCheckoutId);
    renderBooker(state);
    if (shouldFocusCheckout) focusBookerCheckout(state, toggleCheckoutId);
    return;
  }
  const decisionButton = target.closest('[data-mark-checkout]');
  if (decisionButton) {
    await saveBookerCheckoutDecision(
      state,
      decisionButton.getAttribute('data-card-id'),
      decisionButton.getAttribute('data-checkout-id'),
      decisionButton.getAttribute('data-mark-checkout')
    );
    return;
  }
  if (target.closest('[data-close-surrender]')) {
    state.surrenderCardId = '';
    renderBooker(state);
    return;
  }
  const regenerateId = target.closest('[data-regenerate-surrender]')?.getAttribute('data-regenerate-surrender');
  if (regenerateId) {
    state.surrenderEmailSkipsByCard.set(regenerateId, (state.surrenderEmailSkipsByCard.get(regenerateId) || 0) + 1);
    renderBooker(state);
    return;
  }
  const claimId = target.closest('[data-claim-card]')?.getAttribute('data-claim-card');
  if (claimId) {
    await claimBookerCard(state, claimId);
    return;
  }
  const surrenderId = target.closest('[data-open-surrender]')?.getAttribute('data-open-surrender');
  if (surrenderId) {
    state.surrenderCardId = surrenderId;
    renderBooker(state);
  }
}

function toggleSingleExpanded(set, id) {
  const shouldOpen = !set.has(id);
  set.clear();
  if (shouldOpen) set.add(id);
}

function focusBookerCheckout(state, expansionKey) {
  requestAnimationFrame(() => {
    const summary = state.root.querySelector(`[data-toggle-booker-checkout="${cssEscape(expansionKey)}"]:not([data-focus-booker-checkout])`);
    const checkout = summary?.closest('.booker-checkout');
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    checkout?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  });
}

async function handleBookerSubmit(event, state) {
  if (event.target.id === 'booker-code-form') {
    event.preventDefault();
    if (!validateFormFields(event.target, { show: true })) return;
    const code = String(new FormData(event.target).get('inviteCode') || '').trim();
    if (!code) return;
    state.accessStatus = 'checking';
    state.loading = true;
    renderBooker(state);
    try {
      await redeemBookerInvite(state, code);
    } catch (err) {
      state.accessStatus = 'needs_code';
      state.accessMessage = err.message || 'Invite code is invalid or revoked.';
      state.loading = false;
      renderBooker(state);
    }
    return;
  }
  const surrenderCardId = event.target.getAttribute('data-surrender-form');
  if (surrenderCardId) {
    event.preventDefault();
    if (!validateFormFields(event.target, { show: true })) return;
    await surrenderBookerCard(state, surrenderCardId, event.target);
  }
}

async function claimBookerCard(state, cardId) {
  if (!state.bookerName) return;
  const activeCard = getActiveBookerCard(state, cardId);
  if (activeCard) {
    showToast('Surrender your current CO before claiming another.', 'error');
    return;
  }
  try {
    await runTransaction(getDb(), async transaction => {
      const ref = cardRef(state.boardId, cardId);
      const lockRef = bookerLockRef(state.boardId, state.bookerName);
      const [snap, lockSnap] = await Promise.all([
        transaction.get(ref),
        transaction.get(lockRef)
      ]);
      if (!snap.exists()) throw new Error('Card not found.');
      const data = snap.data();
      if (data.bookerName && normalizeBookerName(data.bookerName) !== normalizeBookerName(state.bookerName)) throw new Error('This account is already claimed.');
      if (lockSnap.exists()) {
        const lock = lockSnap.data();
        if (['active', 'surrendered'].includes(lock.status) && lock.cardId !== cardId) {
          throw new Error('Surrender your current CO before claiming another.');
        }
      }
      const timestamp = serverTimestamp();
      transaction.update(ref, {
        status: data.status === 'open' ? 'claimed' : data.status,
        bookerName: state.bookerName,
        claimedAt: data.claimedAt || timestamp,
        updatedAt: timestamp
      });
      transaction.set(lockRef, {
        bookerName: state.bookerName,
        cardId,
        status: 'active',
        claimedAt: data.claimedAt || timestamp,
        updatedAt: timestamp
      });
    });
    state.expandedCardIds.clear();
    state.expandedCardIds.add(cardId);
    state.expandedCheckoutIds.clear();
    state.activeTab = 'active';
    await loadBookerBoard(state);
  } catch (err) {
    showToast(err.message || 'Could not claim account.', 'error');
  }
}

async function saveBookerCheckoutDecision(state, cardId, checkoutId, decision) {
  if (!cardId || !checkoutId || !['fulfilled', 'cannot_fulfill'].includes(decision)) return;
  const cannotFulfill = decision === 'cannot_fulfill';
  let cannotFulfillReason = '';
  if (cannotFulfill) {
    const reason = await showPrompt('Why can this checkout not be fulfilled?', {
      label: 'Reason',
      placeholder: 'Add the reason for the owner...',
      required: true,
      multiline: true
    });
    if (reason === null) return;
    cannotFulfillReason = reason;
  }

  try {
    await runTransaction(getDb(), async transaction => {
      const cRef = cardRef(state.boardId, cardId);
      const coRef = checkoutRef(state.boardId, cardId, checkoutId);
      const [cardSnap, checkoutSnap] = await Promise.all([transaction.get(cRef), transaction.get(coRef)]);
      if (!cardSnap.exists() || !checkoutSnap.exists()) throw new Error('Checkout not found.');
      const card = cardSnap.data();
      const checkout = checkoutSnap.data();
      if (normalizeBookerName(card.bookerName) !== normalizeBookerName(state.bookerName)) throw new Error('This account belongs to another booker.');
      if (['fulfilled', 'cannot_fulfill', 'approved'].includes(checkout.status)) throw new Error('This checkout is already decided.');
      transaction.update(coRef, {
        status: cannotFulfill ? 'cannot_fulfill' : 'fulfilled',
        bookerName: state.bookerName,
        canFulfill: !cannotFulfill,
        unavailableItems: [],
        cannotFulfillReason: cannotFulfill ? cannotFulfillReason : '',
        fulfilledAt: cannotFulfill ? null : serverTimestamp(),
        failedAt: cannotFulfill ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
      transaction.update(cRef, {
        status: 'fulfilling',
        updatedAt: serverTimestamp()
      });
    });
    await refreshCardReadyState(state, cardId);
    await loadBookerBoard(state);
  } catch (err) {
    showToast(err.message || 'Could not save checkout status.', 'error');
  }
}

async function refreshCardReadyState(state, cardId) {
  const checkoutSnap = await getDocs(checkoutsRef(state.boardId, cardId));
  const checkouts = checkoutSnap.docs.map(docSnap => docSnap.data());
  if (checkouts.length && checkouts.every(checkout => ['fulfilled', 'cannot_fulfill'].includes(checkout.status))) {
    await updateDoc(cardRef(state.boardId, cardId), {
      status: 'ready_to_surrender',
      updatedAt: serverTimestamp()
    });
  }
}

async function surrenderBookerCard(state, cardId, form) {
  const data = new FormData(form);
  const generatedEmail = String(data.get('generatedEmail') || '').trim().toLowerCase();
  const accountEmail = String(data.get('accountEmail') || '').trim();
  const accountPassword = String(data.get('accountPassword') || '').trim();
  const vouchers = splitList(data.get('vouchers'));
  const expiryHoursLeft = numberValue(data.get('expiryHoursLeft'), 0);
  const expiresAt = expiryHoursLeft > 0 ? new Date(Date.now() + expiryHoursLeft * 3600000).toISOString() : '';
  if (!generatedEmail || !accountEmail || !accountPassword || !expiresAt) return;

  const checkoutSnap = await getDocs(checkoutsRef(state.boardId, cardId));
  const checkoutRefs = checkoutSnap.docs.map(docSnap => checkoutRef(state.boardId, cardId, docSnap.id));
  if (!checkoutRefs.length) {
    showToast('Decide every checkout before surrendering the account.', 'error');
    return;
  }
  try {
    await runTransaction(getDb(), async transaction => {
      const ref = cardRef(state.boardId, cardId);
      const lockRef = bookerLockRef(state.boardId, state.bookerName);
      const [snap, ...checkoutSnaps] = await Promise.all([
        transaction.get(ref),
        ...checkoutRefs.map(checkoutDoc => transaction.get(checkoutDoc))
      ]);
      if (!snap.exists()) throw new Error('Account card not found.');
      if (!checkoutSnaps.every(checkoutDoc => checkoutDoc.exists() && ['fulfilled', 'cannot_fulfill'].includes(checkoutDoc.data().status))) {
        throw new Error('Decide every checkout before surrendering the account.');
      }
      const card = snap.data();
      if (normalizeBookerName(card.bookerName) !== normalizeBookerName(state.bookerName)) throw new Error('This account belongs to another booker.');
      const timestamp = serverTimestamp();
      transaction.update(ref, {
        status: 'surrendered',
        accountEmail,
        accountPassword,
        vouchers,
        generatedEmail,
        surrenderedEmail: generatedEmail,
        expiresAt,
        surrenderedAt: timestamp,
        updatedAt: timestamp
      });
      transaction.set(lockRef, {
        bookerName: state.bookerName,
        cardId,
        status: 'surrendered',
        surrenderedAt: timestamp,
        updatedAt: timestamp
      }, { merge: true });
    });
    state.surrenderCardId = '';
    await loadBookerBoard(state);
  } catch (err) {
    showToast(err.message || 'Could not surrender account.', 'error');
  }
}

function normalizeBoard(id, data = {}) {
  return {
    id,
    gmailBase: data.gmailBase || '',
    targetVouchers: Array.isArray(data.targetVouchers) ? data.targetVouchers : [],
    ...data
  };
}

function normalizeInvite(id, data = {}) {
  return {
    id,
    ownerUid: data.ownerUid || '',
    boardId: data.boardId || '',
    bookerName: data.bookerName || '',
    active: data.active === true,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    ...data
  };
}

function normalizeBookerSession(id, data = {}) {
  return {
    id,
    inviteHash: data.inviteHash || '',
    boardId: data.boardId || '',
    ownerUid: data.ownerUid || '',
    bookerName: data.bookerName || '',
    active: data.active === true,
    ...data
  };
}

function normalizeCard(id, data = {}) {
  return {
    id,
    status: data.status || 'open',
    generatedEmail: data.generatedEmail || '',
    accountEmail: data.accountEmail || '',
    accountPassword: data.accountPassword || '',
    vouchers: Array.isArray(data.vouchers) ? data.vouchers : [],
    surrenderedEmail: data.surrenderedEmail || '',
    bookerName: data.bookerName || '',
    accountCost: data.accountCost ?? 190,
    expiresAt: data.expiresAt || '',
    ...data
  };
}

function normalizeCheckout(id, data = {}) {
  return {
    id,
    status: data.status || 'open',
    customerName: data.customerName || '',
    customerContact: data.customerContact || '',
    customerAddress: data.customerAddress || '',
    voucher: data.voucher || '',
    expectedTotal: data.expectedTotal ?? 0,
    cartUrl: data.cartUrl || '',
    items: normalizeItems(data.items || data.itemLines || []),
    notes: data.notes || '',
    cannotFulfillReason: data.cannotFulfillReason || '',
    unavailableItems: Array.isArray(data.unavailableItems) ? data.unavailableItems : [],
    ...data
  };
}

function normalizePendingCheckout(id, data = {}) {
  return {
    id,
    status: data.status || 'pending',
    assignedCardId: data.assignedCardId || '',
    customerName: data.customerName || '',
    customerContact: data.customerContact || '',
    customerAddress: data.customerAddress || '',
    voucher: data.voucher || '',
    expectedTotal: data.expectedTotal ?? 0,
    cartUrl: data.cartUrl || '',
    items: normalizeItems(data.items || []),
    notes: data.notes || '',
    ownerUid: data.ownerUid || '',
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
}

function normalizeItems(items) {
  if (Array.isArray(items)) {
    return items.map(item => typeof item === 'string' ? { label: item } : { label: item.label || '' }).filter(item => item.label);
  }
  return parseItemLines(items);
}

function parseItemLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(label => ({ label }));
}

function getBookerPortalLink() {
  const url = new URL('booker.html', window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function randomToken(length = 28) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(36).padStart(2, '0')).join('').slice(0, length);
}

function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
  return raw.match(/.{1,4}/g).join('-');
}

async function hashInviteCode(code) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return '';
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const digest = sha256Bytes(new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeInviteCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sha256Bytes(message) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const length = message.length;
  const bitLength = length * 8;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength, false);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + constants[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => {
      hash[index] = (hash[index] + value) >>> 0;
    });
  }

  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  hash.forEach((value, index) => outputView.setUint32(index * 4, value, false));
  return output;
}

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function generateAvailableGmailOptions(email, reserved) {
  const [localRaw, domainRaw] = String(email).toLowerCase().split('@');
  if (!localRaw || !domainRaw) return [];
  const domain = domainRaw === 'googlemail.com' ? 'gmail.com' : domainRaw;
  if (domain !== 'gmail.com') return reserved.has(email) ? [] : [email];
  const clean = localRaw.replace(/\./g, '');
  const candidates = generateDotVariants(clean).map(local => `${local}@gmail.com`);
  return candidates.filter(candidate => !reserved.has(candidate));
}

function generateDotVariants(local) {
  const clean = String(local || '').replace(/\./g, '');
  if (clean.length <= 1) return [clean];
  const maxMask = 1 << Math.min(clean.length - 1, 12);
  const variants = [];
  for (let mask = 0; mask < maxMask; mask += 1) {
    let value = clean[0];
    for (let i = 1; i < clean.length; i += 1) {
      if (mask & (1 << (i - 1))) value += '.';
      value += clean[i];
    }
    variants.push(value);
  }
  return variants.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function getReservedEmails(cards, excludeCardId = '') {
  const reserved = new Set();
  cards.forEach(card => {
    if (card.id === excludeCardId) return;
    [card.generatedEmail, card.surrenderedEmail, card.accountEmail].filter(Boolean).forEach(email => reserved.add(String(email).toLowerCase()));
  });
  return reserved;
}

function splitList(value) {
  return [...new Set(String(value || '').split(/[,+]/).map(item => item.trim()).filter(Boolean))];
}

function normalizeBookerName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function bookerLockKey(value) {
  return encodeURIComponent(normalizeBookerName(value) || 'booker');
}

function numberValue(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return 0;
}

function statusSort(status) {
  return {
    open: 0,
    claimed: 1,
    fulfilling: 2,
    ready_to_surrender: 3,
    surrendered: 4,
    approved: 5
  }[status] ?? 9;
}

function labelStatus(status) {
  return {
    open: 'Open',
    claimed: 'Claimed',
    fulfilling: 'Fulfilling',
    ready_to_surrender: 'Ready to Surrender',
    surrendered: 'Surrendered',
    fulfilled: 'Fulfilled',
    cannot_fulfill: 'Cannot Fulfill',
    approved: 'Approved'
  }[status] || 'Open';
}

function statusClass(status) {
  const known = ['open', 'claimed', 'fulfilling', 'ready_to_surrender', 'surrendered', 'fulfilled', 'cannot_fulfill', 'approved'];
  return known.includes(status) ? `is-${status}` : 'is-open';
}

function formatDateTimeValue(value) {
  const ms = toMs(value);
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
}

function formatElapsedSince(value) {
  const ms = toMs(value);
  if (!ms) return 'just now';
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}

function inviteErrorMessage(err) {
  if (err?.code === 'permission-denied') return 'Invite code was blocked by Firestore rules. Publish the latest rules, then try again.';
  if (err?.code === 'unauthenticated') return 'Sign in again before creating invite codes.';
  return err?.message || 'Invite code action failed.';
}

let fallbackToastTimer;
let appDialogId = 0;

function showToast(message, type = '') {
  if (window.POS?.showToast) {
    window.POS.showToast(message, type);
    return;
  }
  let toast = document.querySelector('[data-fulfillment-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('data-fulfillment-toast', '');
    toast.hidden = true;
    document.body.appendChild(toast);
  }
  clearTimeout(fallbackToastTimer);
  toast.textContent = message;
  toast.className = `toast ${type}`.trim();
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  fallbackToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.hidden = true;
    }, 280);
  }, 2800);
}

function showConfirm(message, { confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    const { dialog, panel, close } = createAppDialog(message, resolve, false);
    const actions = document.createElement('div');
    actions.className = 'app-dialog-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.textContent = cancelLabel;
    cancelButton.addEventListener('click', () => close(false));
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    confirmButton.textContent = confirmLabel;
    confirmButton.addEventListener('click', () => close(true));
    actions.append(cancelButton, confirmButton);
    panel.append(actions);
    mountAppDialog(dialog, confirmButton);
  });
}

function showPicker(message, { options = [], cancelLabel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    const { dialog, panel, close } = createAppDialog(message, resolve, null);
    const list = document.createElement('div');
    list.className = 'app-dialog-picker';
    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-dialog-picker-item';
      const label = document.createElement('span');
      label.className = 'app-dialog-picker-label';
      label.textContent = option.label;
      button.append(label);
      if (option.sublabel) {
        const sub = document.createElement('span');
        sub.className = 'app-dialog-picker-sub';
        sub.textContent = option.sublabel;
        button.append(sub);
      }
      button.addEventListener('click', () => close(option.value));
      list.append(button);
    });
    const actions = document.createElement('div');
    actions.className = 'app-dialog-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.textContent = cancelLabel;
    cancelButton.addEventListener('click', () => close(null));
    actions.append(cancelButton);
    panel.append(list, actions);
    mountAppDialog(dialog, list.querySelector('.app-dialog-picker-item'));
  });
}

function showPrompt(message, { label = '', placeholder = '', initial = '', required = true, multiline = true } = {}) {
  return new Promise(resolve => {
    const { dialog, panel, close } = createAppDialog(message, resolve, null);
    const form = document.createElement('form');
    form.className = 'app-dialog-form';
    form.noValidate = true;
    const group = document.createElement('div');
    group.className = 'form-group';
    const fieldId = `app-dialog-field-${appDialogId}`;
    const labelEl = document.createElement('label');
    labelEl.className = label ? 'form-label' : 'sr-only';
    labelEl.setAttribute('for', fieldId);
    labelEl.textContent = label || 'Response';
    const field = multiline ? document.createElement('textarea') : document.createElement('input');
    field.id = fieldId;
    field.className = 'form-input';
    field.placeholder = placeholder;
    field.value = initial;
    field.required = required;
    if (!multiline) field.type = 'text';
    const error = document.createElement('span');
    error.className = 'form-error';
    error.hidden = true;
    group.append(labelEl, field, error);
    const actions = document.createElement('div');
    actions.className = 'app-dialog-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => close(null));
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'btn btn-primary';
    submitButton.textContent = 'Submit';
    actions.append(cancelButton, submitButton);
    form.append(group, actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const value = field.value.trim();
      if (required && !value) {
        field.classList.add('is-invalid');
        error.textContent = 'Required field.';
        error.hidden = false;
        field.focus({ preventScroll: true });
        return;
      }
      close(value);
    });
    field.addEventListener('input', () => {
      field.classList.remove('is-invalid');
      error.hidden = true;
    });
    panel.append(form);
    mountAppDialog(dialog, field);
  });
}

function createAppDialog(message, resolve, fallbackValue) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement('div');
  const messageId = `app-dialog-message-${++appDialogId}`;
  dialog.className = 'app-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', messageId);
  const panel = document.createElement('section');
  panel.className = 'app-dialog-panel';
  const text = document.createElement('p');
  text.id = messageId;
  text.className = 'app-dialog-message';
  text.textContent = message;
  panel.append(text);
  dialog.append(panel);
  let settled = false;
  const onKeydown = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close(fallbackValue);
  };
  function close(value) {
    if (settled) return;
    settled = true;
    document.removeEventListener('keydown', onKeydown);
    dialog.remove();
    refreshAppDialogModalState();
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
    resolve(value);
  }
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close(fallbackValue);
  });
  document.addEventListener('keydown', onKeydown);
  return { dialog, panel, close };
}

function mountAppDialog(dialog, focusTarget) {
  document.body.appendChild(dialog);
  refreshAppDialogModalState();
  requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
}

function refreshAppDialogModalState() {
  const hasOpenModal = document.querySelector('.app-dialog, .fulfillment-create-modal, .booker-surrender-modal, .modal:not([hidden])');
  document.body.classList.toggle('modal-open', Boolean(hasOpenModal));
}
