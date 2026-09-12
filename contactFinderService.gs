/**
 * contactFinderService.gs
 * The free tier of "our version of Derrick": given a person's name and
 * their company's domain, generate the common corporate email patterns
 * and check whether the domain even accepts mail (a public DNS MX
 * lookup, no key needed). This is the same base mechanism open-source
 * tools like MailFinder/Mail-Hunter use -- pattern generation, not a
 * licensed contact database.
 *
 * Honest limitation, stated plainly rather than hidden: Apps Script has
 * no raw socket API, so a real SMTP handshake (what actually confirms
 * one specific address exists, the way Hunter/Apollo/Derrick do) isn't
 * possible here. This ranks candidates by how common each pattern is
 * and confirms only that the DOMAIN accepts mail -- "plausible," not
 * "verified." The premium tier (a real Apollo/Hunter-style lookup
 * against an actual licensed database, Koli-fronted per the business
 * model decided for it) is the upgrade path once that's connected;
 * this free tier stays useful on its own and never blocks on it.
 */

/**
 * Ordered by real-world commonness (first.last@ and firstlast@ dominate
 * in practice): callers should treat earlier entries as more likely, not
 * shuffle or alphabetize them.
 */
function generateEmailPatterns_(firstName, lastName, domain) {
  const f = String(firstName || '').trim().toLowerCase().replace(/[^a-z-]/g, '');
  const l = String(lastName || '').trim().toLowerCase().replace(/[^a-z-]/g, '');
  const d = String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!f || !d) return [];

  const patterns = [];
  const add = function (local) { if (local) patterns.push(local + '@' + d); };

  add(l ? f + '.' + l : f);
  add(l ? f + l : null);
  add(f);
  add(l ? f[0] + l : null);
  add(l ? f[0] + '.' + l : null);
  add(l ? l + '.' + f : null);
  add(l ? f + '_' + l : null);
  add(l ? l : null);

  return Array.from(new Set(patterns)); // a short name (no distinct first/last) can collapse patterns to duplicates
}

/**
 * Free, keyless DNS-over-HTTPS lookup (Google's own public resolver) --
 * confirms the domain has a mail server at all before we hand back a
 * list of guesses for a domain that can't receive email in the first
 * place (a parked domain, a typo, etc).
 */
function checkDomainAcceptsMail_(domain) {
  try {
    const url = 'https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX';
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { checked: false, acceptsMail: null };
    const data = JSON.parse(resp.getContentText());
    return { checked: true, acceptsMail: !!(data.Answer && data.Answer.length) };
  } catch (e) {
    return { checked: false, acceptsMail: null };
  }
}

function dnsTxtLookup_(name) {
  try {
    const url = 'https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=TXT';
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return [];
    const data = JSON.parse(resp.getContentText());
    return (data.Answer || []).map(function (a) { return String(a.data || '').replace(/^"|"$/g, ''); });
  } catch (e) {
    return [];
  }
}

/**
 * Koli's own version of Verdict's (github.com/omm9846/verdict) DNS-level
 * "precheck" stage -- MX + SPF + DMARC, all free via public DNS records.
 * NOT a substitute for Verdict's actual SMTP-level verification (which
 * confirms one specific mailbox exists): Apps Script has no raw socket
 * API, so that stage genuinely can't be replicated here. What this DOES
 * confirm is real: whether the domain accepts mail at all, and whether
 * it publishes the records that indicate a maintained, non-parked
 * domain. Every email-guessing flow in Koli should run through this
 * before a guess is treated as good enough to use, per the "run it
 * through our own verification before using" rule -- this is that gate.
 */
function verifyDomainMailHealth_(domain) {
  const mx = checkDomainAcceptsMail_(domain);
  const spfRecords = dnsTxtLookup_(domain).filter(function (t) { return /^v=spf1/i.test(t); });
  const dmarcRecords = dnsTxtLookup_('_dmarc.' + domain).filter(function (t) { return /^v=dmarc1/i.test(t); });

  const signals = [];
  signals.push(mx.acceptsMail ? 'MX: has a mail server' : (mx.checked ? 'MX: NO mail server found (likely undeliverable)' : 'MX: could not check'));
  signals.push(spfRecords.length ? 'SPF: published' : 'SPF: none found');
  signals.push(dmarcRecords.length ? 'DMARC: published' : 'DMARC: none found');

  let confidence;
  if (!mx.acceptsMail) confidence = 'low'; // no mail server = nothing else matters
  else if (spfRecords.length && dmarcRecords.length) confidence = 'higher'; // an actively maintained domain
  else confidence = 'medium';

  return { acceptsMail: !!mx.acceptsMail, hasSpf: !!spfRecords.length, hasDmarc: !!dmarcRecords.length, confidence: confidence, signals: signals };
}

function showContactFinderDialog() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Guess Contact Email'); return; }
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const sheetName = sheet.getName();
  if (sheetName !== SHEET_NAMES.SPONSORS && sheetName !== SHEET_NAMES.BRAND_TARGETS) {
    ui.alert('Select a row on the Sponsors or Brand Targets sheet first, then run this again.');
    return;
  }
  const range = SpreadsheetApp.getActiveRange();
  if (!range || range.getRow() < 2) {
    ui.alert('Select a single data row first, then run this again.');
    return;
  }
  const row = range.getRow();

  const nameResp = ui.prompt('Guess Contact Email', 'Full name of the person (e.g. "Jane Doe"):', ui.ButtonSet.OK_CANCEL);
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  const fullName = nameResp.getResponseText().trim();
  if (!fullName) { ui.alert('A name is required.'); return; }

  const domainResp = ui.prompt('Guess Contact Email', 'Company domain (e.g. "brand.com" -- check the Research Sponsor Contacts note if you already ran that):', ui.ButtonSet.OK_CANCEL);
  if (domainResp.getSelectedButton() !== ui.Button.OK) return;
  const domain = domainResp.getResponseText().trim();
  if (!domain) { ui.alert('A domain is required.'); return; }

  const parts = fullName.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const candidates = generateEmailPatterns_(firstName, lastName, domain);
  if (!candidates.length) { ui.alert('Could not generate candidates from that name/domain.'); return; }

  const health = verifyDomainMailHealth_(domain);

  const lines = [
    'Email guesses for ' + fullName + ' at ' + domain + ' (' + Utilities.formatDate(new Date(), getTimezone_(), 'MMM d, yyyy') + '):',
    '', 'Domain mail health (' + health.confidence + ' confidence): ' + health.signals.join(' · '), '',
    'Ranked by how common each pattern is -- PATTERN-GUESSED, NOT VERIFIED (no per-address confirmation, only that the domain itself is set up to receive mail):'
  ];
  candidates.forEach(function (c, i) { lines.push((i + 1) + '. ' + c); });
  if (!health.acceptsMail) lines.push('', 'Do not send to these: the domain has no mail server on record at all.');
  lines.push('', 'Upgrade path: a real per-address lookup (Apollo/Hunter-style, against an actual database) is the accurate version of this -- ask before sending to an unconfirmed guess.');

  const brandCol = sheetName === SHEET_NAMES.SPONSORS ? SPONSOR_HEADERS.indexOf('Brand') + 1 : 1;
  const cell = sheet.getRange(row, brandCol);
  const existingNote = cell.getNote();
  cell.setNote((existingNote ? existingNote + '\n\n' : '') + lines.join('\n'));

  ui.alert('Guess Contact Email', 'Top guess: ' + candidates[0] + '\n\nDomain health: ' + health.confidence + ' confidence (' + health.signals.join(' · ') + ')\n\nFull ranked list added to the row\'s note.', ui.ButtonSet.OK);
}
