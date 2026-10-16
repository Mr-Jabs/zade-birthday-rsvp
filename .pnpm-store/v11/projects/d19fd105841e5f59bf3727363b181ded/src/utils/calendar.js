function escapeIcs(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function timestamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function makeCalendar(event) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zade Birthday//Invitation//EN',
    'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:zade-birthday-2026@zade.local',
    `DTSTAMP:${timestamp(new Date())}`,
    `DTSTART:${timestamp(event.starts_at)}`, `DTEND:${timestamp(event.ends_at)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(`${event.venue_name}, ${event.venue_address}`)}`,
    `DESCRIPTION:${escapeIcs(event.reminders.join('\n'))}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

export function downloadCalendar(event) {
  const url = URL.createObjectURL(new Blob([makeCalendar(event)], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'zade-birthday-october-25.ics';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
