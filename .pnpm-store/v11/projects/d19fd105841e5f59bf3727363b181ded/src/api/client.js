export async function getEvent() {
  const response = await fetch('/api/v1/event', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Event request failed (${response.status})`);
  const event = await response.json();
  for (const key of ['title', 'starts_at', 'ends_at', 'timezone', 'venue_name', 'venue_address', 'maps_url']) {
    if (typeof event[key] !== 'string') throw new Error('Invalid event response');
  }
  if (Number.isNaN(Date.parse(event.starts_at)) || Number.isNaN(Date.parse(event.ends_at))) {
    throw new Error('Invalid event date');
  }
  new Intl.DateTimeFormat('en-US', { timeZone: event.timezone });
  const mapsUrl = new URL(event.maps_url);
  if (mapsUrl.protocol !== 'https:' || !['www.google.com', 'maps.google.com'].includes(mapsUrl.hostname)) {
    throw new Error('Invalid maps URL');
  }
  if (!Array.isArray(event.reminders) || !event.reminders.every((item) => typeof item === 'string')) throw new Error('Invalid reminders');
  if (typeof event.rsvp_open !== 'boolean') throw new Error('Invalid RSVP availability');
  return event;
}
