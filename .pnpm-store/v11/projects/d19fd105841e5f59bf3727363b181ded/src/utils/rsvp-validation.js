export const stepFields = [
  ['name', 'relationship', 'contact_number'],
  ['attendance'],
  ['adults', 'kids', 'party', 'message'],
];

export function normalizePhone(value) {
  const compact = value.replace(/[\s().-]/g, '');
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
  if (/^\+?639\d{9}$/.test(compact)) return `+${compact.replace(/^\+/, '')}`;
  return null;
}

export function makePayload(draft) {
  return {
    name: draft.name.trim().replace(/\s+/g, ' '),
    relationship: draft.relationship,
    contact_number: normalizePhone(draft.contact_number) || draft.contact_number.trim(),
    attendance: draft.attendance,
    adults: draft.attendance === 'not_attending' ? 0 : draft.adults,
    kids: draft.attendance === 'not_attending' ? 0 : draft.kids,
    message: draft.message.trim(),
  };
}

export function validateDraft(draft) {
  const errors = {};
  const name = draft.name.trim().replace(/\s+/g, ' ');
  if (Array.from(name).length < 2 || Array.from(name).length > 100 || /[\u0000-\u001f\u007f-\u009f]/.test(draft.name.trim())) errors.name = 'Enter your name (2–100 characters).';
  if (!['family', 'friend', 'parents_friend', 'other'].includes(draft.relationship)) errors.relationship = 'Choose your relationship to Zade.';
  if (!normalizePhone(draft.contact_number) || draft.contact_number.trim().length > 32) errors.contact_number = 'Enter a Philippine mobile number, such as 0917 123 4567.';
  if (!['attending', 'not_attending', 'maybe'].includes(draft.attendance)) errors.attendance = 'Let us know whether you can join the party.';
  if (draft.attendance !== 'not_attending') {
    for (const field of ['adults', 'kids']) {
      if (!Number.isInteger(draft[field]) || draft[field] < 0 || draft[field] > 20) errors[field] = 'Use a whole number from 0 to 20.';
    }
    if (draft.attendance === 'attending' && draft.adults + draft.kids === 0) errors.party = 'Add at least one adult or child to your party.';
  }
  if (Array.from(draft.message.trim()).length > 200) errors.message = 'Keep your message to 200 characters or fewer.';
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(draft.message.trim())) errors.message = 'Remove control characters from your message.';
  return errors;
}
