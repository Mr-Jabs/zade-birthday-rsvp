export function createRsvpStore() {
  const keys = new Map();
  return {
    step: 0,
    busy: false,
    result: null,
    touched: new Set(),
    draft: { name: '', relationship: '', contact_number: '', attendance: '', adults: 1, kids: 0, message: '' },
    submissionKey(payload) {
      const signature = JSON.stringify(payload);
      if (!keys.has(signature)) keys.set(signature, crypto.randomUUID());
      return keys.get(signature);
    },
    clearAfterSuccess(result) {
      this.result = result;
      this.draft = { name: '', relationship: '', contact_number: '', attendance: '', adults: 1, kids: 0, message: '' };
      this.touched.clear();
      keys.clear();
    },
  };
}
