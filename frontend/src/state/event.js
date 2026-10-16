// Invitation snapshot keeps the visual shell useful when the API is offline.
// The seeded database is authoritative whenever the API is available.
export const invitationSnapshot = Object.freeze({
  title: 'Zade’s Monster Truck Birthday Bash!',
  celebrant_name: 'Zade',
  starts_at: '2026-10-25T15:00:00+08:00',
  ends_at: '2026-10-25T19:00:00+08:00',
  timezone: 'Asia/Manila',
  venue_name: 'PlayTown Kids Cafe',
  venue_address: 'San Juan City, Metro Manila',
  maps_url: 'https://www.google.com/maps/search/?api=1&query=PlayTown+Kids+Cafe+San+Juan+City',
  reminders: ['Bring non-slip socks for the little racers so they’re ready to play!'],
  rsvp_open: true,
});
