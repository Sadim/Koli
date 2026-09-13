/**
 * kolindarService.gs
 * Kolindar: Koli's own free scheduling page (a Calendly/Koalendar
 * equivalent), built the same way Koli avoids every other per-seat SaaS --
 * on Apps Script's native Calendar service, not a paid API. Zero cost by
 * construction, same as everything else in this project: no Calendly/
 * Koalendar account, no per-booking fee, nothing to outgrow.
 *
 * Two halves, matching the user's explicit ask ("part of webapp and koli
 * sheet"): the PUBLIC booking page is served through the Web App's doGet
 * (see inboxService.gs's `?kolindar=1` branch) -- a visitor never touches
 * the spreadsheet. Configuration (meeting types, weekly available hours,
 * buffer, lookahead) and the bookings log both live in the Sheet, same
 * pattern as Brand Interest/Publish-as-Page.
 *
 * Deliberately NOT built (real scope cuts, not oversights): auto-generated
 * Google Meet links (needs the Advanced Calendar Service enabled, a real
 * setup step and a real risk class -- this project's own history has a
 * documented case of an Advanced-Service integration breaking a working
 * feature; skipped until asked for), SMS reminders and payment collection
 * (both paid-tier-only on Koalendar/Calendly, out of scope for "100% free"
 * by definition), multi-host/team scheduling (Koli is single-operator by
 * design, see PRODUCT.md).
 */

/** Sane defaults for a brand-new setup: one 30-min call, weekday 9-5, in the founder's own configured timezone. */
function defaultKolindarConfig_() {
  const weekdayHours = [['09:00', '17:00']];
  return {
    meetingTypes: [{ id: 'call30', name: '30-min Call', minutes: 30 }],
    weeklyHours: { sun: [], mon: weekdayHours, tue: weekdayHours, wed: weekdayHours, thu: weekdayHours, fri: weekdayHours, sat: [] },
    bufferMinutes: 10,
    lookaheadDays: 14,
    minNoticeHours: 12
  };
}

function getKolindarConfig_() {
  const raw = getProp_(PROP_KEYS.KOLINDAR_CONFIG, '');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.meetingTypes) && parsed.meetingTypes.length) return parsed;
    } catch (e) { /* fall through to default on any malformed stored config */ }
  }
  return defaultKolindarConfig_();
}

function saveKolindarConfig_(config) {
  PropertiesService.getDocumentProperties().setProperty(PROP_KEYS.KOLINDAR_CONFIG, JSON.stringify(config));
}

/** The one public URL to share -- same WEB_APP_URL Settings already has you set for the extension's connection code, reused here rather than asking for it twice. */
function getKolindarBookingLink_() {
  const url = getProp_(PROP_KEYS.WEB_APP_URL, '');
  return url ? url + '?kolindar=1' : '';
}

function showKolindarSetupDialog() {
  const html = HtmlService.createHtmlOutputFromFile('KolindarDialog').setWidth(480).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Set Up Kolindar');
}

function getKolindarSettingsForDialog() {
  return { config: getKolindarConfig_(), bookingLink: getKolindarBookingLink_(), timezone: getTimezone_() };
}

function saveKolindarSettings(config) {
  // Minimal validation: a malformed config would otherwise silently break
  // the public page for every future visitor, not just the person saving it.
  if (!config || !Array.isArray(config.meetingTypes) || !config.meetingTypes.length) {
    return { ok: false, error: 'At least one meeting type is required.' };
  }
  const badType = config.meetingTypes.find(function (m) { return !m.id || !m.name || !(Number(m.minutes) > 0); });
  if (badType) return { ok: false, error: 'Every meeting type needs a name and a duration greater than 0.' };
  saveKolindarConfig_(config);
  return { ok: true };
}

const KOLINDAR_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * The actual availability computation: weekly recurring hours minus real
 * Calendar busy time (with buffer) minus the minimum-notice window, for
 * one specific meeting type's duration. Returns UTC ISO start/end pairs --
 * timezone conversion for DISPLAY happens client-side (the visitor's own
 * browser timezone), the founder's configured timezone is only used to
 * interpret what "9am Tuesday" means when building candidate slots.
 */
function computeKolindarSlots_(config, meetingType) {
  const tz = getTimezone_();
  const now = new Date();
  const minStart = new Date(now.getTime() + (config.minNoticeHours || 0) * 3600000);
  const windowEnd = new Date(now.getTime() + config.lookaheadDays * 86400000);

  const bufferMs = (config.bufferMinutes || 0) * 60000;
  const busy = CalendarApp.getDefaultCalendar().getEvents(now, windowEnd).map(function (ev) {
    return { start: ev.getStartTime().getTime() - bufferMs, end: ev.getEndTime().getTime() + bufferMs };
  });

  const durationMs = meetingType.minutes * 60000;
  const slots = [];

  for (let d = 0; d < config.lookaheadDays; d++) {
    const dayDate = new Date(now.getTime() + d * 86400000);
    const dayKey = KOLINDAR_DAY_KEYS[dayDate.getDay()];
    const windows = config.weeklyHours[dayKey] || [];
    const dateStr = Utilities.formatDate(dayDate, tz, 'yyyy-MM-dd');

    windows.forEach(function (win) {
      // parseDate, not `new Date(dateStr + 'T' + win[0])`: the latter is
      // interpreted in the Apps Script RUNTIME's own default timezone,
      // which is not guaranteed to match the founder's configured `tz` --
      // parseDate pins the wall-clock time to the right zone explicitly.
      let slotStart = Utilities.parseDate(dateStr + ' ' + win[0], tz, 'yyyy-MM-dd HH:mm');
      const dayWindowEnd = Utilities.parseDate(dateStr + ' ' + win[1], tz, 'yyyy-MM-dd HH:mm');
      while (slotStart.getTime() + durationMs <= dayWindowEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durationMs);
        if (slotStart.getTime() >= minStart.getTime()) {
          const conflict = busy.some(function (b) { return slotStart.getTime() < b.end && slotEnd.getTime() > b.start; });
          if (!conflict) slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
        }
        slotStart = new Date(slotStart.getTime() + durationMs);
      }
    });
  }
  return slots;
}

/** Called from doGet (?kolindar=1&action=slots&type=<id>) -- the public page's own follow-up fetch after a visitor picks a meeting type. */
function getKolindarSlotsForWebApp_(meetingTypeId) {
  const config = getKolindarConfig_();
  const meetingType = config.meetingTypes.find(function (m) { return m.id === meetingTypeId; });
  if (!meetingType) return { ok: false, error: 'Unknown meeting type.' };
  return { ok: true, slots: computeKolindarSlots_(config, meetingType) };
}

/** Called from doGet (?kolindar=1&action=book&...) -- creates the real Calendar event, logs it, emails the visitor. */
function createKolindarBooking_(meetingTypeId, startIso, name, email, notes) {
  const config = getKolindarConfig_();
  const meetingType = config.meetingTypes.find(function (m) { return m.id === meetingTypeId; });
  if (!meetingType) return { ok: false, error: 'Unknown meeting type.' };
  if (!name || !email) return { ok: false, error: 'Name and email are required.' };

  const start = new Date(startIso);
  if (isNaN(start.getTime())) return { ok: false, error: 'Invalid time slot.' };
  const end = new Date(start.getTime() + meetingType.minutes * 60000);

  // Re-check the slot is still open right before booking: another visitor
  // could have taken it between this page loading and this form being
  // submitted. Never trust the client's own claim that a slot is free.
  const stillOpen = computeKolindarSlots_(config, meetingType).some(function (s) { return s.start === start.toISOString(); });
  if (!stillOpen) return { ok: false, error: 'That slot was just booked by someone else -- please pick another time.' };

  CalendarApp.getDefaultCalendar().createEvent(
    meetingType.name + ' with ' + name,
    start, end,
    { description: notes || '', guests: email, sendInvites: true }
  );

  const tz = getTimezone_();
  const sheet = getOrCreateSheet_(SHEET_NAMES.KOLINDAR_BOOKINGS, KOLINDAR_BOOKINGS_HEADERS);
  sheet.appendRow([
    '', sanitizeCellText_(name), email, meetingType.name,
    Utilities.formatDate(start, tz, 'yyyy-MM-dd HH:mm zzz'),
    Utilities.formatDate(end, tz, 'yyyy-MM-dd HH:mm zzz'),
    sanitizeCellText_(notes || ''), new Date()
  ]);
  formatStatusCell_(sheet.getRange(sheet.getLastRow(), 1), STATUS.DONE);

  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Confirmed: ' + meetingType.name,
      body: 'Hi ' + name + ',\n\nYour ' + meetingType.name + ' is confirmed for ' +
        Utilities.formatDate(start, tz, "EEEE, MMMM d, yyyy 'at' h:mm a zzz") + '.\n\n' +
        'A calendar invite has been sent to this email address.\n\n' +
        (notes ? 'Your note: ' + notes + '\n\n' : '')
    });
  } catch (e) { /* the booking itself already succeeded -- a failed confirmation email shouldn't undo it */ }

  return { ok: true };
}

/**
 * The public page itself: a template string, same convention
 * publishService.gs's renderPublishedChannelsPage_ already uses for
 * anything doGet serves directly (no separate .html file, since this is
 * generated content, not a static template). Built on this session's
 * Impeccable design tokens for visual consistency with the rest of Koli,
 * not the older palette that page happens to still use.
 */
function renderKolindarPage_(config) {
  const esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const typesJson = JSON.stringify(config.meetingTypes);

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Book time</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    ':root{--ink:oklch(13% 0 0);--text:oklch(22% 0 0);--mut:oklch(46% 0 0);--bg:oklch(97.8% 0 0);--surface:oklch(99.5% 0 0);' +
    '--border:oklch(13% 0 0 / .08);--patina-deep:oklch(45% .1 190);--patina:oklch(70% .12 188);--kinpaku-deep:oklch(61% .085 78);--error:oklch(52% .16 35);}' +
    '*{box-sizing:border-box;}body{font-family:"Albert Sans","Avenir Next","Helvetica Neue",Arial,system-ui,sans-serif;background:var(--bg);color:var(--ink);margin:0;padding:32px 16px;}' +
    '.wrap{max-width:480px;margin:0 auto;}' +
    '.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;box-shadow:0 1px 1px oklch(13% 0 0/.05),0 3px 5px oklch(13% 0 0/.05),0 12px 20px oklch(13% 0 0/.06);}' +
    'h1{font-size:19px;margin:0 0 4px;}.sub{color:var(--mut);font-size:12.5px;margin-bottom:22px;}' +
    '.type-btn{display:block;width:100%;text-align:left;padding:14px 16px;margin-bottom:8px;border:1px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;color:var(--ink);}' +
    '.type-btn:hover{border-color:var(--patina-deep);}.type-btn span{display:block;font-weight:400;color:var(--mut);font-size:11.5px;margin-top:2px;}' +
    '.day-group{margin-bottom:16px;}.day-label{font-weight:700;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px;}' +
    '.slot-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}' +
    '.slot-btn{padding:9px 4px;border:1px solid var(--border);border-radius:8px;background:var(--surface);cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;color:var(--ink);}' +
    '.slot-btn:hover{background:var(--patina-deep);border-color:var(--patina-deep);color:#fff;}' +
    'label{display:block;font-weight:600;font-size:12px;margin:12px 0 5px;}' +
    'input,textarea{width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px;font-family:inherit;}' +
    'textarea{resize:vertical;min-height:60px;}' +
    '.back-link,.submit-btn{cursor:pointer;font-family:inherit;}' +
    '.back-link{background:none;border:none;color:var(--patina-deep);font-weight:600;font-size:12px;padding:0;margin-bottom:14px;}' +
    '.submit-btn{width:100%;margin-top:16px;padding:11px 0;border:none;border-radius:10px;background:var(--patina-deep);color:#fff;font-weight:700;font-size:13.5px;}' +
    '.submit-btn:disabled{opacity:.55;}' +
    '.msg{font-size:12px;margin-top:10px;text-align:center;}.msg.err{color:var(--error);}.msg.ok{color:var(--patina-deep);}' +
    '.empty{color:var(--mut);font-size:12.5px;text-align:center;padding:20px 0;}' +
    '.foot{margin-top:22px;font-size:10.5px;color:var(--mut);text-align:center;}' +
    '</style></head><body><div class="wrap"><div class="card" id="app"></div>' +
    '<div class="foot">Powered by Koli</div></div>' +
    '<script>' +
    'const TYPES=' + typesJson + ';' +
    'const BASE=window.location.href.split("?")[0];' +
    'let selectedType=null, selectedSlot=null;' +
    'function el(tag,attrs,children){const e=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){if(k==="text")e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);});(children||[]).forEach(function(c){e.appendChild(c);});return e;}' +
    'function renderTypePicker(){' +
    'const app=document.getElementById("app");app.innerHTML="";' +
    'app.appendChild(el("h1",{text:"Book time"}));' +
    'app.appendChild(el("div",{class:"sub",text:"Pick a meeting type to see open times."}));' +
    'TYPES.forEach(function(t){' +
    'const btn=el("button",{class:"type-btn",type:"button"});' +
    'btn.appendChild(document.createTextNode(t.name));' +
    'btn.appendChild(el("span",{text:t.minutes+" minutes"}));' +
    'btn.onclick=function(){selectedType=t;loadSlots();};' +
    'app.appendChild(btn);' +
    '});' +
    '}' +
    'function loadSlots(){' +
    'const app=document.getElementById("app");app.innerHTML="<div class=\\"empty\\">Loading times…</div>";' +
    'fetch(BASE+"?kolindar=1&action=slots&type="+encodeURIComponent(selectedType.id)).then(function(r){return r.json();}).then(function(resp){' +
    'if(!resp.ok){app.innerHTML="<div class=\\"empty\\">"+resp.error+"</div>";return;}' +
    'renderSlotPicker(resp.slots);' +
    '}).catch(function(){app.innerHTML="<div class=\\"empty\\">Could not load available times. Try reloading the page.</div>";});' +
    '}' +
    'function renderSlotPicker(slots){' +
    'const app=document.getElementById("app");app.innerHTML="";' +
    'const back=el("button",{class:"back-link",type:"button",text:"\\u2190 Choose a different meeting type"});' +
    'back.onclick=renderTypePicker;app.appendChild(back);' +
    'app.appendChild(el("h1",{text:selectedType.name}));' +
    'app.appendChild(el("div",{class:"sub",text:"Times shown in your local timezone."}));' +
    'if(!slots.length){app.appendChild(el("div",{class:"empty",text:"No open times in the next couple of weeks -- check back soon."}));return;}' +
    'const byDay={};const order=[];' +
    'slots.forEach(function(s){' +
    'const d=new Date(s.start);' +
    'const key=d.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});' +
    'if(!byDay[key]){byDay[key]=[];order.push(key);}' +
    'byDay[key].push(s);' +
    '});' +
    'order.forEach(function(dayKey){' +
    'const group=el("div",{class:"day-group"});' +
    'group.appendChild(el("div",{class:"day-label",text:dayKey}));' +
    'const grid=el("div",{class:"slot-grid"});' +
    'byDay[dayKey].forEach(function(s){' +
    'const d=new Date(s.start);' +
    'const btn=el("button",{class:"slot-btn",type:"button",text:d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})});' +
    'btn.onclick=function(){selectedSlot=s;renderForm();};' +
    'grid.appendChild(btn);' +
    '});' +
    'group.appendChild(grid);app.appendChild(group);' +
    '});' +
    '}' +
    'function renderForm(){' +
    'const app=document.getElementById("app");app.innerHTML="";' +
    'const back=el("button",{class:"back-link",type:"button",text:"\\u2190 Choose a different time"});' +
    'back.onclick=function(){loadSlots();};app.appendChild(back);' +
    'const d=new Date(selectedSlot.start);' +
    'app.appendChild(el("h1",{text:selectedType.name}));' +
    'app.appendChild(el("div",{class:"sub",text:d.toLocaleString(undefined,{weekday:"long",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}));' +
    'app.appendChild(el("label",{text:"Name"}));' +
    'const nameInput=el("input",{type:"text",id:"kName"});app.appendChild(nameInput);' +
    'app.appendChild(el("label",{text:"Email"}));' +
    'const emailInput=el("input",{type:"email",id:"kEmail"});app.appendChild(emailInput);' +
    'app.appendChild(el("label",{text:"What\\u2019s this about? (optional)"}));' +
    'const notesInput=el("textarea",{id:"kNotes"});app.appendChild(notesInput);' +
    'const msg=el("div",{class:"msg"});' +
    'const submitBtn=el("button",{class:"submit-btn",type:"button",text:"Confirm booking"});' +
    'submitBtn.onclick=function(){' +
    'const name=nameInput.value.trim(),email=emailInput.value.trim(),notes=notesInput.value.trim();' +
    'if(!name||!email){msg.className="msg err";msg.textContent="Name and email are required.";return;}' +
    'submitBtn.disabled=true;submitBtn.textContent="Booking…";' +
    'fetch(BASE+"?kolindar=1&action=book&type="+encodeURIComponent(selectedType.id)+"&start="+encodeURIComponent(selectedSlot.start)+"&name="+encodeURIComponent(name)+"&email="+encodeURIComponent(email)+"&notes="+encodeURIComponent(notes))' +
    '.then(function(r){return r.json();}).then(function(resp){' +
    'if(!resp.ok){msg.className="msg err";msg.textContent=resp.error;submitBtn.disabled=false;submitBtn.textContent="Confirm booking";return;}' +
    'app.innerHTML="<h1>You\\u2019re booked</h1><div class=\\"sub\\">A calendar invite and confirmation email are on their way to "+email+".</div>";' +
    '}).catch(function(){msg.className="msg err";msg.textContent="Something went wrong -- please try again.";submitBtn.disabled=false;submitBtn.textContent="Confirm booking";});' +
    '};' +
    'app.appendChild(submitBtn);app.appendChild(msg);' +
    '}' +
    'if(TYPES.length===1){selectedType=TYPES[0];loadSlots();}else{renderTypePicker();}' +
    '</script></body></html>';
}
