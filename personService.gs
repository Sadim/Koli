/**
 * personService.gs
 * Person: the normalized human-contact record the CRM data-model pass
 * added -- fills a real gap (brand-side decision-makers and creators'
 * managers had nowhere to live before this; Channels' own Contact field is
 * an auto-scraped note, not a curated record, and stays untouched).
 * Read/write goes through recordService.gs's generic mechanism
 * (getPersonRecord/setPersonField); this file only owns creation, since
 * that needs more than a blank-row append (minting a Person ID, resolving
 * the Brand name against the canonical Brands directory).
 */

function createPerson(name, role, email, phone, linkedChannelId, brandName, source, notes) {
  if (!name) throw new Error('Name is required.');
  const sheet = getOrCreateSheet_(SHEET_NAMES.PEOPLE, PERSON_HEADERS);
  const brand = brandName ? resolveBrandId_(brandName) : { id: '', name: '' };
  const personId = Utilities.getUuid();
  const newRow = sheet.getLastRow() + 1;

  sheet.appendRow([
    personId, sanitizeCellText_(name), sanitizeCellText_(role || ''),
    sanitizeCellText_(email || ''), sanitizeCellText_(phone || ''),
    linkedChannelId || '', brand.name, brand.id,
    sanitizeCellText_(source || ''), sanitizeCellText_(notes || ''), new Date()
  ]);
  sheet.getRange(newRow, PERSON_HEADERS.indexOf('Added') + 1).setNumberFormat('yyyy-mm-dd hh:mm');

  return { ok: true, personId: personId, name: name };
}
