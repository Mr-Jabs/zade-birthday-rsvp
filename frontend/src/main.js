import './styles/main.css';
import { renderIcons } from './components/icons.js';
import { getEvent } from './api/client.js';
import { invitationSnapshot } from './state/event.js';
import { downloadCalendar } from './utils/calendar.js';
import { initRsvpWizard } from './components/rsvp-wizard.js';

renderIcons();
function syncNavigation() {
  const currentHash = location.hash || '#home';
  document.querySelectorAll('.desktop-nav a').forEach((link) => {
    if (link.hash === currentHash) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', syncNavigation);
syncNavigation();
let event = invitationSnapshot;
const rsvp = initRsvpWizard({ getEvent: () => event, onCalendar: () => downloadCalendar(event) });
document.querySelectorAll('[data-rsvp]').forEach((button) => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      // Recheck availability: the backend may have reopened since this page loaded.
      await refreshEvent();
    } catch {
      document.querySelector('#event-data-note').hidden = false;
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
    rsvp.open(button);
  });
});

document.querySelector('#calendar-button').addEventListener('click', () => {
  downloadCalendar(event);
  const toast = document.querySelector('#toast');
  toast.textContent = 'Calendar file downloaded. Open it to add Zade’s big day.';
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 5000);
});

function renderEvent(data) {
  const date = new Date(data.starts_at);
  const dateOptions = { timeZone: data.timezone };
  const fullDate = date.toLocaleDateString('en-US', { ...dateOptions, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const shortDate = date.toLocaleDateString('en-US', { ...dateOptions, weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
  const timeFormat = new Intl.DateTimeFormat('en-US', { ...dateOptions, hour: 'numeric', minute: '2-digit' });
  const time = `${timeFormat.format(date)}–${timeFormat.format(new Date(data.ends_at))}`;
  const values = { shortDate: fullDate, day: shortDate, time: `${time} PHT`, cardTime: time, venue: `${data.venue_name} · San Juan City`, cardVenue: data.venue_name.toUpperCase(), address: data.venue_address, reminder: data.reminders.join(' ') };
  document.querySelectorAll('[data-event]').forEach((element) => {
    if (values[element.dataset.event] !== undefined) element.textContent = values[element.dataset.event];
  });
  const mapsUrl = new URL(data.maps_url);
  if (mapsUrl.protocol === 'https:' && ['www.google.com', 'maps.google.com'].includes(mapsUrl.hostname)) {
    document.querySelector('#maps-link').href = mapsUrl.href;
  }
}

let pendingEvent;
function refreshEvent() {
  // Share in-flight requests so an older page-load response cannot overwrite a newer one.
  if (pendingEvent) return pendingEvent;
  pendingEvent = getEvent().then((data) => {
    renderEvent(data);
    event = data;
    document.querySelector('#event-data-note').hidden = true;
  }).finally(() => { pendingEvent = undefined; });
  return pendingEvent;
}

// Keep event updates atomic: invalid API data cannot replace the invitation snapshot.
refreshEvent().catch(() => {
  document.querySelector('#event-data-note').hidden = false;
});
