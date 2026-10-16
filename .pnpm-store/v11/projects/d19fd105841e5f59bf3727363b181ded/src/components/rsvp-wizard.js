import { createRsvpStore } from '../state/rsvp-store.js';
import { makePayload, stepFields, validateDraft } from '../utils/rsvp-validation.js';
import { submitRsvp } from '../api/rsvp-api.js';

const copy = [
  ['FIRST, MEET THE PIT CREW', 'WHO’S ROLLING IN?', 'A few details so we know who to save a spot for.'],
  ['THE BIG QUESTION', 'ARE YOU JOINING THE BASH?', 'Big wheels are better with good company.'],
  ['ROOM FOR THE WHOLE CREW', 'HOW MANY ARE COMING?', 'Count everyone in your party, including yourself.'],
];
const statusLabels = { attending: 'Yes, we’ll be there!', not_attending: 'Sorry, we can’t make it', maybe: 'Maybe' };

export function initRsvpWizard({ getEvent, onCalendar }) {
  const store = createRsvpStore();
  const dialog = document.querySelector('#rsvp-dialog');
  // Static template only. Guest values use DOM text/value APIs, never HTML interpolation.
  dialog.innerHTML = `
    <div class="rsvp-shell">
      <aside class="rsvp-art" aria-hidden="true">
        <span class="eyebrow">ZADE’S BIRTHDAY PIT CREW</span>
        <span class="rsvp-art-heading">BIG WHEELS.<br /><em>BIGGER SMILES.</em></span>
        <span class="rsvp-race-number">02</span>
        <img src="${import.meta.env.BASE_URL}assets/trucks/monster-truck.svg" alt="" width="840" height="580" />
        <span class="rsvp-art-date">OCT 25, 2026 <span>·</span> SAN JUAN CITY</span>
        <div class="checker-divider"></div>
      </aside>
      <div class="rsvp-content">
        <button type="button" class="dialog-close" id="rsvp-close" aria-label="Close RSVP form">×</button>
        <div id="wizard-body">
          <ol class="rsvp-progress" aria-label="RSVP steps">
            <li><span>01</span> Your details</li><li><span>02</span> The plan</li><li><span>03</span> Your crew</li>
          </ol>
          <div class="rsvp-heading"><p class="eyebrow" id="rsvp-kicker"></p><h2 id="rsvp-title" tabindex="-1"></h2><p id="rsvp-description"></p></div>
          <p class="sr-only" id="rsvp-step-status" role="status"></p>
          <form id="rsvp-form" novalidate>
            <fieldset data-step="0">
              <legend class="sr-only">Your details</legend>
              <div class="rsvp-field"><label for="guest-name">Your name <span aria-hidden="true">*</span></label><input id="guest-name" name="name" autocomplete="name" placeholder="e.g. Juan Dela Cruz" required aria-describedby="error-name" /><p class="field-error" id="error-name" hidden></p></div>
              <div class="rsvp-field"><label for="guest-relationship">Relationship to Zade <span aria-hidden="true">*</span></label><select id="guest-relationship" name="relationship" required aria-describedby="error-relationship"><option value="">Choose your relationship</option><option value="family">Family</option><option value="friend">Friend</option><option value="parents_friend">Parent’s friend</option><option value="other">Other</option></select><p class="field-error" id="error-relationship" hidden></p></div>
              <div class="rsvp-field"><label for="guest-contact">Contact number <span aria-hidden="true">*</span></label><input id="guest-contact" name="contact_number" type="tel" inputmode="tel" autocomplete="tel" placeholder="0917 123 4567" required aria-describedby="contact-help error-contact_number" /><p class="field-help" id="contact-help">A Philippine mobile number for party updates.</p><p class="field-error" id="error-contact_number" hidden></p></div>
              <p class="rsvp-privacy">Your contact details are shared only with the party organizer.</p>
            </fieldset>
            <fieldset data-step="1" hidden>
              <legend class="sr-only">Attendance</legend>
              <div class="attendance-options" role="radiogroup" aria-label="Will you attend?" aria-describedby="error-attendance">
                <label class="attendance-card"><input type="radio" name="attendance" value="attending" /><span class="radio-mark" aria-hidden="true"></span><span><strong>Yes, we’ll be there!</strong><small>Ready to celebrate with Zade.</small></span><span class="attendance-symbol" aria-hidden="true">↗</span></label>
                <label class="attendance-card"><input type="radio" name="attendance" value="not_attending" /><span class="radio-mark" aria-hidden="true"></span><span><strong>Sorry, we can’t make it</strong><small>Sending birthday love from afar.</small></span></label>
                <label class="attendance-card"><input type="radio" name="attendance" value="maybe" /><span class="radio-mark" aria-hidden="true"></span><span><strong>Maybe</strong><small>We’re still checking our plans.</small></span></label>
              </div>
              <p class="field-error" id="error-attendance" hidden></p>
            </fieldset>
            <fieldset data-step="2" hidden>
              <legend class="sr-only">Your crew and message</legend>
              <div id="party-counts">
                <p class="tentative-note" id="tentative-note" hidden>These counts are tentative. It’s okay if your plans aren’t settled yet.</p>
                <div class="party-grid">
                  <div class="rsvp-field"><label for="guest-adults">Adults</label><div class="party-counter"><button type="button" data-counter="adults" data-delta="-1" aria-label="Decrease adults">−</button><input id="guest-adults" type="number" name="adults" min="0" max="20" step="1" inputmode="numeric" value="1" aria-describedby="error-adults error-party" /><button type="button" data-counter="adults" data-delta="1" aria-label="Increase adults">+</button></div><p class="field-error" id="error-adults" hidden></p></div>
                  <div class="rsvp-field"><label for="guest-kids">Kids</label><div class="party-counter"><button type="button" data-counter="kids" data-delta="-1" aria-label="Decrease kids">−</button><input id="guest-kids" type="number" name="kids" min="0" max="20" step="1" inputmode="numeric" value="0" aria-describedby="error-kids error-party" /><button type="button" data-counter="kids" data-delta="1" aria-label="Increase kids">+</button></div><p class="field-error" id="error-kids" hidden></p></div>
                </div>
                <p class="field-error" id="error-party" hidden></p>
              </div>
              <div class="declined-note" id="declined-note" hidden>We’ll miss your crew! You can still leave Zade a little birthday message.</div>
              <div class="rsvp-field message-field"><label for="guest-message">A little message for Zade <span class="optional">(optional)</span></label><textarea id="guest-message" name="message" rows="3" placeholder="Happy 2nd birthday, Zade!" aria-describedby="message-limit error-message"></textarea><div class="message-meta"><span id="message-limit">Up to 200 characters</span><output id="message-count" for="guest-message">0/200</output></div><p class="field-error" id="error-message" hidden></p></div>
              <div class="rsvp-review"><span class="eyebrow">YOUR RSVP AT A GLANCE</span><strong id="review-name"></strong><span id="review-plan"></span></div>
            </fieldset>
            <div id="submit-error" class="submit-error" role="alert" tabindex="-1" hidden></div>
            <div class="rsvp-actions"><button class="rsvp-back" type="button" id="rsvp-back" hidden><span aria-hidden="true">←</span> Back</button><button class="button button-orange" type="submit" id="rsvp-next">Next <span aria-hidden="true">→</span></button></div>
            <p class="rsvp-save-status" id="rsvp-save-status" role="status"></p>
          </form>
        </div>
        <section id="rsvp-confirmation" hidden aria-labelledby="confirmation-title">
          <span class="saved-badge"><span aria-hidden="true">✓</span> RSVP SAVED</span>
          <div class="confirmation-truck" aria-hidden="true"><img src="${import.meta.env.BASE_URL}assets/trucks/monster-truck.svg" alt="" width="840" height="580" /></div>
          <h2 id="confirmation-title" tabindex="-1"></h2><p id="confirmation-description"></p>
          <div class="confirmation-ticket"><span class="eyebrow">YOUR PARTY PASS</span><strong id="confirmation-name"></strong><span id="confirmation-status"></span><span id="confirmation-counts"></span><div class="ticket-date">SUN, OCT 25 <span>3:00–7:00 PM PHT</span></div></div>
          <p class="confirmation-note" id="confirmation-note"></p>
          <button type="button" class="button button-orange" id="confirmation-home">Back to Home <span aria-hidden="true">↗</span></button><button type="button" class="text-link" id="confirmation-calendar">Add the party to your calendar <span aria-hidden="true">↗</span></button>
        </section>
        <section id="rsvp-closed" class="rsvp-closed" hidden aria-labelledby="closed-title"><span class="dialog-number" aria-hidden="true">02</span><p class="eyebrow">THANK YOU FOR STOPPING BY</p><h2 id="closed-title" tabindex="-1">THE PIT DESK<br />IS CLOSED.</h2><p>We’re not accepting RSVPs right now. You can still explore all the birthday details.</p><button type="button" class="button button-orange" id="closed-details">Explore party details <span aria-hidden="true">↓</span></button></section>
      </div>
    </div>`;

  const form = dialog.querySelector('form');
  const find = (selector) => dialog.querySelector(selector);
  const setText = (selector, value) => { find(selector).textContent = value; };
  let trigger;

  function paintErrors(errors = validateDraft(store.draft)) {
    const current = stepFields[store.step];
    [...new Set(stepFields.flat())].forEach((field) => {
      const element = find(`#error-${field}`);
      const message = current.includes(field) && store.touched.has(field) ? errors[field] : '';
      element.textContent = message || '';
      element.hidden = !message;
      const input = form.elements.namedItem(field);
      if (input instanceof HTMLElement) {
        if (message) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    });
    find('.attendance-options').setAttribute('aria-invalid', String(!find('#error-attendance').hidden));
  }

  function updateParty() {
    const declined = store.draft.attendance === 'not_attending';
    find('#party-counts').hidden = declined;
    find('#declined-note').hidden = !declined;
    find('#tentative-note').hidden = store.draft.attendance !== 'maybe';
    for (const field of ['adults', 'kids']) {
      const value = store.draft[field];
      dialog.querySelectorAll(`[data-counter="${field}"]`).forEach((button) => {
        button.disabled = store.busy || (Number(button.dataset.delta) < 0 ? value <= 0 : value >= 20);
      });
    }
    const count = Array.from(store.draft.message.trim()).length;
    setText('#message-count', `${count}/200`);
    find('#message-count').classList.toggle('over-limit', count > 200);
    const payload = makePayload(store.draft);
    setText('#review-name', payload.name);
    const crew = `${payload.adults} adult${payload.adults === 1 ? '' : 's'} · ${payload.kids} ${payload.kids === 1 ? 'kid' : 'kids'}`;
    setText('#review-plan', declined ? statusLabels.not_attending : `${statusLabels[payload.attendance]} · ${crew}${payload.attendance === 'maybe' ? ' (tentative)' : ''}`);
  }

  function renderStep(focus = false) {
    const [kicker, title, description] = copy[store.step];
    setText('#rsvp-kicker', kicker);
    setText('#rsvp-title', store.step === 2 && store.draft.attendance === 'not_attending' ? 'SEND A LITTLE BIRTHDAY LOVE.' : title);
    setText('#rsvp-description', store.step === 2 && store.draft.attendance === 'not_attending' ? 'A message from afar will still make Zade’s day.' : description);
    setText('#rsvp-step-status', `Step ${store.step + 1} of 3: ${['Your details', 'Attendance', 'Your crew'][store.step]}`);
    dialog.querySelectorAll('[data-step]').forEach((panel) => { panel.hidden = Number(panel.dataset.step) !== store.step; });
    dialog.querySelectorAll('.rsvp-progress li').forEach((item, index) => {
      item.classList.toggle('is-complete', index < store.step);
      if (index === store.step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    find('#rsvp-back').hidden = store.step === 0;
    find('#rsvp-next').innerHTML = store.step === 2 ? 'Submit RSVP <span aria-hidden="true">↗</span>' : 'Next <span aria-hidden="true">→</span>';
    find('#submit-error').hidden = true;
    updateParty();
    paintErrors();
    if (focus) {
      find('#rsvp-title').focus({ preventScroll: true });
      dialog.scrollTop = 0;
    }
  }

  function focusError(errors) {
    const field = stepFields[store.step].find((key) => errors[key]);
    const target = field === 'attendance' ? find('input[name="attendance"]') : field === 'party' ? form.elements.adults : form.elements.namedItem(field);
    target?.focus();
  }

  function busy(value) {
    store.busy = value;
    form.setAttribute('aria-busy', String(value));
    [...form.elements].forEach((element) => { element.disabled = value; });
    find('#rsvp-close').disabled = value;
    find('#rsvp-next').textContent = value ? 'Saving your RSVP…' : 'Submit RSVP ↗';
    setText('#rsvp-save-status', value ? 'Hold tight. We’re saving your spot.' : '');
    updateParty();
  }

  function confirmation(result) {
    find('#wizard-body').hidden = true;
    find('#rsvp-closed').hidden = true;
    find('#rsvp-confirmation').hidden = false;
    const attending = result.attendance === 'attending';
    const maybe = result.attendance === 'maybe';
    setText('#confirmation-title', attending ? 'YOU’RE ON THE STARTING GRID!' : maybe ? 'YOUR MAYBE IS ON THE GRID!' : 'THANKS FOR LETTING US KNOW!');
    setText('#confirmation-description', attending ? 'Big smiles ahead. We can’t wait to celebrate with you!' : maybe ? 'Plans still in the air? We’ve saved your tentative response.' : 'We’ll miss you at the track. Thanks for sending Zade some birthday love.');
    setText('#confirmation-name', result.name);
    setText('#confirmation-status', statusLabels[result.attendance]);
    setText('#confirmation-counts', result.attendance === 'not_attending' ? 'No guests included' : `${result.adults} adult${result.adults === 1 ? '' : 's'} · ${result.kids} ${result.kids === 1 ? 'kid' : 'kids'}${maybe ? ' · Tentative' : ''}`);
    setText('#confirmation-note', result.message ? 'Your birthday message has been delivered to Zade’s party crew. Thank you!' : 'Thank you for being part of Zade’s big little adventure.');
    dialog.setAttribute('aria-labelledby', 'confirmation-title');
    dialog.setAttribute('aria-describedby', 'confirmation-description');
    dialog.scrollTop = 0;
    find('#confirmation-title').focus({ preventScroll: true });
  }

  form.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input.name in store.draft)) return;
    store.draft[input.name] = input.type === 'number' ? (input.value === '' ? NaN : Number(input.value)) : input.value;
    if (input.name === 'attendance') store.touched.add('attendance');
    updateParty();
    paintErrors();
    find('#submit-error').hidden = true;
  });
  form.addEventListener('focusout', (event) => {
    if (event.target.name in store.draft) {
      store.touched.add(event.target.name);
      paintErrors();
    }
  });
  dialog.querySelectorAll('[data-counter]').forEach((button) => {
    button.addEventListener('click', () => {
      const field = button.dataset.counter;
      const current = Number.isFinite(store.draft[field]) ? store.draft[field] : 0;
      store.draft[field] = Math.max(0, Math.min(20, current + Number(button.dataset.delta)));
      form.elements.namedItem(field).value = store.draft[field];
      store.touched.add(field);
      updateParty();
      paintErrors();
    });
  });
  find('#rsvp-back').addEventListener('click', () => { store.step -= 1; renderStep(true); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (store.busy || store.result) return;
    const errors = validateDraft(store.draft);
    stepFields[store.step].forEach((field) => store.touched.add(field));
    if (stepFields[store.step].some((field) => errors[field])) {
      paintErrors(errors);
      focusError(errors);
      return;
    }
    if (store.step < 2) { store.step += 1; renderStep(true); return; }
    const invalidStep = stepFields.findIndex((fields) => fields.some((field) => errors[field]));
    if (invalidStep >= 0) {
      store.step = invalidStep;
      stepFields[invalidStep].forEach((field) => store.touched.add(field));
      renderStep();
      focusError(errors);
      return;
    }
    const payload = makePayload(store.draft);
    busy(true);
    find('#submit-error').hidden = true;
    try {
      const result = await submitRsvp(payload, store.submissionKey(payload));
      store.clearAfterSuccess(result);
      form.reset();
      busy(false);
      confirmation(result);
    } catch (error) {
      busy(false);
      const fields = error.fields || {};
      const errorStep = stepFields.findIndex((names) => names.some((name) => fields[name]));
      if (errorStep >= 0) {
        store.step = errorStep;
        stepFields[errorStep].forEach((name) => store.touched.add(name));
        renderStep();
        paintErrors(fields);
      }
      setText('#submit-error', error.message);
      find('#submit-error').hidden = false;
      if (errorStep >= 0) focusError(fields);
      else find('#submit-error').focus();
    }
  });

  find('#rsvp-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => { if (store.busy) event.preventDefault(); });
  dialog.addEventListener('close', () => trigger?.focus());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog || store.busy) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  find('#confirmation-home').addEventListener('click', () => { dialog.close(); location.hash = 'home'; });
  find('#confirmation-calendar').addEventListener('click', onCalendar);
  find('#closed-details').addEventListener('click', () => { dialog.close(); location.hash = 'details'; });

  return {
    open(button) {
      trigger = button;
      if (store.result) { dialog.showModal(); confirmation(store.result); return; }
      const closed = getEvent().rsvp_open === false;
      find('#wizard-body').hidden = closed;
      find('#rsvp-closed').hidden = !closed;
      find('#rsvp-confirmation').hidden = true;
      dialog.setAttribute('aria-labelledby', closed ? 'closed-title' : 'rsvp-title');
      if (closed) dialog.removeAttribute('aria-describedby');
      else dialog.setAttribute('aria-describedby', 'rsvp-description');
      renderStep();
      dialog.showModal();
      find(closed ? '#closed-title' : '#rsvp-title').focus({ preventScroll: true });
    },
  };
}
