import { apiUrl } from './config.js';

export class RsvpError extends Error {
  constructor(message, fields = {}, code = 'REQUEST_FAILED') {
    super(message);
    this.fields = fields;
    this.code = code;
  }
}

export async function submitRsvp(payload, key) {
  let response;
  try {
    response = await fetch(apiUrl('/rsvp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new RsvpError('We couldn’t confirm your RSVP. Your answers are still here—please retry.');
  }
  let data;
  try { data = await response.json(); } catch {
    throw new RsvpError('We couldn’t confirm your RSVP. Please retry with the same details.');
  }
  if (!data || typeof data !== 'object') throw new RsvpError('We couldn’t confirm your RSVP. Please retry with the same details.');
  if (!response.ok) throw new RsvpError(data.error?.message || 'Your RSVP couldn’t be saved. Please try again.', data.error?.fields, data.error?.code);
  if (!data.id || typeof data.name !== 'string' || !['attending', 'not_attending', 'maybe'].includes(data.attendance) || !Number.isInteger(data.adults) || !Number.isInteger(data.kids)) {
    throw new RsvpError('We couldn’t confirm your RSVP. Please retry with the same details.');
  }
  return data;
}
