import './styles/main.css';
import './styles/admin.css';
import { renderIcons } from './components/icons.js';
import { apiUrl } from './api/config.js';

renderIcons();
const $ = (selector) => document.querySelector(selector);
const labels = { attending: 'Attending', not_attending: 'Not attending', maybe: 'Maybe' };
const relationships = { family: 'Family', friend: 'Friend', parents_friend: 'Parent’s friend', other: 'Other' };
const views = {
  overview: ['Overview', 'THE PARTY, AT A GLANCE.', 'Big plans. Little racers. All your RSVPs in one place.'],
  guests: ['Guest list', 'MEET THE STARTING GRID.', 'Every guest, every crew, and all the little details.'],
  messages: ['Messages', 'A LITTLE BIRTHDAY LOVE.', 'Happy wishes from Zade’s favorite people.'],
  statistics: ['Statistics', 'BIG DAY. REAL NUMBERS.', 'A clear picture of who’s coming and how many to plan for.'],
};
let auth = null;
let view = 'overview';
let status = 'all';
let offset = 0;
let serial = 0;
let controller;
let pending = false;
let debounce;
let detailTrigger;
let deleteTarget = null;
let deleting = false;
let deleteTrigger;

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), { credentials: 'include', ...options, signal: options.signal || AbortSignal.timeout(15000) });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('We couldn’t reach the party desk. Check your connection and try again.', 0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.error?.message || 'This request couldn’t be completed. Please try again.', response.status);
  }
  return response;
}

function text(selector, value) { $(selector).textContent = value; }
function node(tag, value, className) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
}
function date(value, detailed = false) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', ...(detailed ? { year: 'numeric', hour: 'numeric', minute: '2-digit' } : {}) }).format(new Date(value));
}
function badge(status) { return node('span', labels[status], `status-badge ${status}`); }

function showLogin(message = '') {
  auth = null;
  serial += 1;
  controller?.abort();
  pending = false;
  $('#dashboard').hidden = true;
  $('#login-screen').hidden = false;
  $('#session-check').hidden = true;
  $('#guest-dialog').close();
  $('#delete-dialog').close();
  deleteTarget = null;
  deleteTrigger = null;
  text('#delete-guest-name', '');
  $('#delete-notice').hidden = true;
  $('#guest-rows').replaceChildren();
  $('#message-list').replaceChildren();
  $('#detail-name').textContent = '';
  $('#detail-fields').replaceChildren();
  $('#detail-message').textContent = '';
  $('#detail-status').replaceChildren();
  $('#attendance-bars').replaceChildren();
  text('#nav-count', '0');
  text('#results-count', '');
  text('#page-summary', '');
  detailTrigger = null;
  document.querySelectorAll('[data-metric]').forEach((element) => { element.textContent = '—'; });
  $('#login-error').hidden = !message;
  text('#login-error', message);
  $('#login-password').value = '';
}

function handleError(error) {
  if (error.name === 'AbortError') return;
  if (error.status === 401) { showLogin('Your organizer session has ended. Please sign in again.'); return; }
  text('#admin-error', error.message);
  $('#admin-error').hidden = false;
  text('#update-status', 'Updates paused · Refresh to retry');
}

function params(forExport = false) {
  const query = new URLSearchParams();
  if (view !== 'overview' && view !== 'statistics') {
    query.set('search', $('#guest-search').value.trim());
    query.set('status', status);
    query.set('sort', $('#guest-sort').value);
    if (view === 'messages') query.set('messages_only', 'true');
  }
  if (!forExport) { query.set('limit', view === 'overview' ? '5' : '25'); query.set('offset', String(offset)); }
  return query;
}

function renderMetrics(metrics) {
  document.querySelectorAll('[data-metric]').forEach((element) => { element.textContent = Number(metrics[element.dataset.metric]).toLocaleString(); });
  text('#nav-count', metrics.total_responses.toLocaleString());
  const bars = $('#attendance-bars');
  bars.replaceChildren();
  for (const [key, label] of Object.entries(labels)) {
    const amount = metrics[key];
    const percent = metrics.total_responses ? Math.round(amount / metrics.total_responses * 100) : 0;
    const section = node('div');
    const heading = node('div', undefined, 'attendance-bar-label');
    heading.append(node('span', label), node('strong', `${amount} · ${percent}%`));
    const track = node('div', undefined, 'attendance-bar-track');
    track.setAttribute('role', 'meter');
    track.setAttribute('aria-label', `${label} responses`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(Math.max(metrics.total_responses, 1)));
    track.setAttribute('aria-valuenow', String(amount));
    const fill = node('div', undefined, `attendance-bar-fill ${key}`);
    fill.style.width = `${percent}%`;
    track.append(fill);
    section.append(heading, track);
    bars.append(section);
  }
}

function guestButton(guest, arrow = false) {
  const button = node('button', arrow ? '↗' : guest.name, arrow ? 'guest-details-button' : 'guest-name-button');
  button.type = 'button';
  button.setAttribute('aria-label', `View details for ${guest.name}`);
  button.addEventListener('click', () => showGuest(guest.id, button));
  return button;
}

function renderGuests(data) {
  const rows = $('#guest-rows');
  const messages = $('#message-list');
  rows.replaceChildren();
  messages.replaceChildren();
  for (const guest of data.items) {
    if (view === 'messages') {
      const card = node('article', undefined, 'message-card');
      card.append(badge(guest.attendance), node('p', guest.message), guestButton(guest), node('small', date(guest.created_at, true) + ' PHT'));
      messages.append(card);
      continue;
    }
    const row = node('tr');
    const name = node('td');
    name.append(guestButton(guest), node('span', relationships[guest.relationship], 'guest-relationship'));
    const statusCell = node('td');
    statusCell.append(badge(guest.attendance));
    const detail = node('td');
    const actions = node('div', undefined, 'guest-row-actions');
    const deleteButton = node('button', 'Delete', 'guest-delete-button');
    deleteButton.type = 'button';
    deleteButton.setAttribute('aria-label', `Delete response for ${guest.name}`);
    deleteButton.addEventListener('click', () => {
      deleteTarget = guest;
      deleteTrigger = deleteButton;
      text('#delete-guest-name', guest.name);
      $('#delete-error').hidden = true;
      $('#delete-notice').hidden = true;
      $('#delete-dialog').showModal();
      $('#delete-cancel').focus();
    });
    actions.append(guestButton(guest, true), deleteButton);
    detail.append(actions);
    row.append(name, node('td', guest.contact_number), statusCell, node('td', guest.adults), node('td', guest.kids), node('td', date(guest.created_at)), detail);
    rows.append(row);
  }
  const empty = data.items.length === 0;
  $('#empty-state').hidden = !empty;
  $('#table-wrap').hidden = empty || view === 'messages';
  $('#message-list').hidden = empty || view !== 'messages';
  const filtered = status !== 'all' || $('#guest-search').value.trim() || view === 'messages';
  text('#empty-title', filtered ? 'No responses match this view.' : 'Your starting grid is waiting.');
  text('#empty-description', filtered ? 'Try another search or attendance filter.' : 'Guest responses will appear here as soon as they RSVP.');
  text('#results-count', view === 'overview' ? '' : `${data.total} ${view === 'messages' ? 'messages' : 'responses'}`);
  const end = Math.min(offset + data.items.length, data.total);
  text('#page-summary', data.total ? `Showing ${offset + 1}–${end} of ${data.total} responses` : 'No responses to show yet');
  $('#pagination').hidden = view === 'overview' || data.total <= 25;
  text('#page-number', `Page ${Math.floor(offset / 25) + 1}`);
  $('#previous-page').disabled = offset === 0;
  $('#next-page').disabled = end >= data.total;
}

async function refresh() {
  if (!auth) return;
  const version = ++serial;
  controller?.abort();
  controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
  const session = auth;
  pending = true;
  $('#refresh-button').disabled = true;
  $('#admin-error').hidden = true;
  $('#table-loading').hidden = view === 'statistics';
  $('#guest-panel').setAttribute('aria-busy', 'true');
  try {
    const calls = [request('/admin/overview', { signal }).then((r) => r.json())];
    if (view !== 'statistics') calls.push(request(`/admin/rsvps?${params()}`, { signal }).then((r) => r.json()));
    const [metrics, guests] = await Promise.all(calls);
    if (version !== serial || session !== auth) return;
    renderMetrics(metrics);
    if (guests) {
      if (guests.total > 0 && offset >= guests.total) { offset = 0; return refresh(); }
      renderGuests(guests);
    }
    text('#update-status', `Live · Updated ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(metrics.updated_at))} PHT`);
  } catch (error) {
    if (version === serial && session === auth) handleError(error);
  } finally {
    if (version === serial) {
      pending = false;
      $('#refresh-button').disabled = false;
      $('#table-loading').hidden = true;
      $('#guest-panel').setAttribute('aria-busy', 'false');
    }
  }
}

function setView() {
  view = Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  offset = 0;
  status = 'all';
  $('#guest-search').value = '';
  $('#guest-sort').value = 'newest';
  document.querySelectorAll('[data-status]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.status === status)));
  document.querySelectorAll('[data-view]').forEach((link) => {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const [label, title, description] = views[view];
  text('#breadcrumb', label); text('#page-title', title); text('#page-description', description);
  $('#overview-panel').hidden = !['overview', 'statistics'].includes(view);
  $('#guest-panel').hidden = view === 'statistics';
  $('#statistics-panel').hidden = view !== 'statistics';
  $('#guest-controls').hidden = view === 'overview';
  $('#view-all').hidden = view !== 'overview';
  text('#table-title', view === 'overview' ? 'Latest responses' : view === 'messages' ? 'Birthday messages' : 'The guest list');
  text('#table-eyebrow', view === 'overview' ? 'FRESH OFF THE STARTING LINE' : view === 'messages' ? 'FROM THE WHOLE PIT CREW' : 'YOUR PARTY, PERSON BY PERSON');
  if (auth) refresh();
}

function signedIn(session) {
  auth = session;
  $('#login-screen').hidden = true;
  $('#session-check').hidden = true;
  $('#dashboard').hidden = false;
  $('#login-password').value = '';
  text('#account-name', session.username);
  setView();
}

async function showGuest(id, trigger) {
  const session = auth;
  trigger.disabled = true;
  try {
    const guest = await (await request(`/admin/rsvps/${encodeURIComponent(id)}`)).json();
    if (!auth || auth !== session) return;
    detailTrigger = trigger;
    text('#detail-name', guest.name);
    $('#detail-status').replaceChildren(badge(guest.attendance));
    const fields = $('#detail-fields');
    fields.replaceChildren();
    for (const [label, value] of [['Relationship', relationships[guest.relationship]], ['Contact number', guest.contact_number], ['Adults', guest.adults], ['Kids', guest.kids], ['Submitted', `${date(guest.created_at, true)} PHT`], ['Party count', guest.attendance === 'maybe' ? 'Tentative' : guest.attendance === 'attending' ? 'Confirmed' : 'Not attending']]) {
      const group = node('div');
      group.append(node('dt', label), node('dd', value));
      fields.append(group);
    }
    text('#detail-message', guest.message || 'No birthday message included.');
    $('#guest-dialog').showModal();
  } catch (error) { handleError(error); }
  finally { trigger.disabled = false; }
}

let exporting = false;
async function downloadCsv(filtered = false) {
  if (!auth || exporting) return;
  exporting = true;
  const session = auth;
  $('#export-button').disabled = true;
  $('#sidebar-export').disabled = true;
  $('#export-filtered').disabled = true;
  try {
    const response = await request(`/admin/export.csv${filtered ? `?${params(true)}` : ''}`);
    const blob = await response.blob();
    if (!auth || auth !== session) return;
    const url = URL.createObjectURL(blob);
    const link = node('a');
    link.href = url; link.download = 'zade-birthday-guests.csv';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    text('#update-status', filtered ? 'CSV downloaded · All matching responses included, across every page' : 'CSV downloaded · Full guest list included, across every page');
  } catch (error) { handleError(error); }
  finally { exporting = false; $('#export-button').disabled = false; $('#sidebar-export').disabled = false; $('#export-filtered').disabled = false; }
}

$('#delete-cancel').addEventListener('click', () => $('#delete-dialog').close());
$('#delete-dialog').addEventListener('cancel', (event) => { if (deleting) event.preventDefault(); });
$('#delete-dialog').addEventListener('close', () => {
  deleteTarget = null;
  text('#delete-guest-name', '');
  if (!auth) return;
  if (deleteTrigger?.isConnected) deleteTrigger.focus();
  else {
    $('#page-title').setAttribute('tabindex', '-1');
    $('#page-title').focus({ preventScroll: true });
  }
  deleteTrigger = null;
});
$('#delete-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!auth || !deleteTarget || deleting) return;
  const session = auth;
  const id = deleteTarget.id;
  deleting = true;
  $('#delete-form').setAttribute('aria-busy', 'true');
  $('#delete-confirm').disabled = true;
  $('#delete-cancel').disabled = true;
  text('#delete-confirm', 'Deleting…');
  $('#delete-error').hidden = true;
  try {
    // A retry after a lost success response may return 404: the desired state is already reached.
    try {
      await request(`/admin/rsvps/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-CSRF-Token': session.csrf_token } });
    } catch (error) { if (error.status !== 404) throw error; }
    if (auth !== session) return;
    $('#delete-dialog').close();
    text('#delete-notice', 'Response deleted.');
    $('#delete-notice').hidden = false;
    await refresh();
    if (auth === session) {
      $('#table-title').setAttribute('tabindex', '-1');
      $('#table-title').focus({ preventScroll: true });
    }
  } catch (error) {
    if (auth !== session) return;
    if (error.status === 401) handleError(error);
    else { text('#delete-error', error.message); $('#delete-error').hidden = false; }
  } finally {
    deleting = false;
    $('#delete-form').setAttribute('aria-busy', 'false');
    $('#delete-confirm').disabled = false;
    $('#delete-cancel').disabled = false;
    text('#delete-confirm', 'Delete response');
  }
});

$('#login-username').value = 'organizer';
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if ($('#login-submit').disabled) return;
  $('#login-submit').disabled = true;
  $('#login-form').setAttribute('aria-busy', 'true');
  $('#login-error').hidden = true;
  try {
    const response = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#login-username').value.trim(), password: $('#login-password').value }) });
    signedIn(await response.json());
  } catch (error) { text('#login-error', error.message); $('#login-error').hidden = false; $('#login-password').focus(); }
  finally { $('#login-submit').disabled = false; $('#login-form').setAttribute('aria-busy', 'false'); }
});

$('#logout-button').addEventListener('click', async () => {
  $('#logout-button').disabled = true;
  try {
    await request('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': auth.csrf_token } });
    showLogin();
  } catch (error) { handleError(error); }
  finally { $('#logout-button').disabled = false; }
});
$('#refresh-button').addEventListener('click', refresh);
$('#export-button').addEventListener('click', () => downloadCsv());
$('#sidebar-export').addEventListener('click', () => downloadCsv());
$('#export-filtered').addEventListener('click', () => downloadCsv(true));
$('#guest-search').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { offset = 0; refresh(); }, 300); });
$('#guest-sort').addEventListener('change', () => { offset = 0; refresh(); });
document.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', () => {
  status = button.dataset.status; offset = 0;
  document.querySelectorAll('[data-status]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  refresh();
}));
$('#previous-page').addEventListener('click', () => { if (!pending) { offset = Math.max(0, offset - 25); refresh(); } });
$('#next-page').addEventListener('click', () => { if (!pending) { offset += 25; refresh(); } });
$('#guest-dialog-close').addEventListener('click', () => $('#guest-dialog').close());
$('#guest-dialog').addEventListener('close', () => {
  if (auth && detailTrigger?.isConnected) detailTrigger.focus();
});
window.addEventListener('hashchange', setView);
document.querySelectorAll('[data-view], #view-all').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  history.pushState(null, '', link.hash);
  setView();
}));
setInterval(() => { if (auth && !pending && !document.hidden) refresh(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && auth) refresh(); });
window.addEventListener('pageshow', async (event) => {
  if (!event.persisted) return;
  $('#dashboard').hidden = true;
  try { signedIn(await (await request('/auth/me')).json()); } catch { showLogin(); }
});

try { signedIn(await (await request('/auth/me')).json()); }
catch (error) { showLogin(error.status === 401 ? '' : error.message); }
