/**
 * recordService.gs
 * The shared "expanded record" system behind Koli's Airtable/Teable-grade
 * record modal (RecordModal.html): one schema-driven read/write pair per
 * record type (Channels, Campaigns), reused by three surfaces that all need
 * to open the identical editable record -- the Sidebar's Expand button, a
 * click on an Outreach Kanban card, and a click on a Campaigns Kanban card.
 *
 * Deliberately separate from getChannelRowData_/getVideoRowData_
 * (sheetWriter.gs): those return a narrow, purpose-built subset other
 * features (Brand Fit Score, exports) already depend on by exact shape.
 * This reads/writes the FULL row against CHANNEL_FIELD_SCHEMA/
 * CAMPAIGN_FIELD_SCHEMA (constants.gs) instead.
 */

function getChannelRecord(channelId) {
  return getRecordGeneric_(SHEET_NAMES.CHANNELS, CHANNEL_FIELD_SCHEMA, 'ID', channelId);
}
function setChannelField(channelId, header, value) {
  return setRecordFieldGeneric_(SHEET_NAMES.CHANNELS, CHANNEL_FIELD_SCHEMA, 'ID', channelId, header, value);
}
function getChannelFieldSchema() { return CHANNEL_FIELD_SCHEMA; }

function getCampaignRecord(campaignId) {
  return getRecordGeneric_(SHEET_NAMES.CAMPAIGNS, CAMPAIGN_FIELD_SCHEMA, 'Campaign ID', campaignId);
}
function setCampaignField(campaignId, header, value) {
  return setRecordFieldGeneric_(SHEET_NAMES.CAMPAIGNS, CAMPAIGN_FIELD_SCHEMA, 'Campaign ID', campaignId, header, value);
}
function getCampaignFieldSchema() { return CAMPAIGN_FIELD_SCHEMA; }

// ---------- CRM data model additions (2026-09-14) -- same generic
// mechanism, two more thin wrapper triads. ----------

function getPersonRecord(personId) {
  return getRecordGeneric_(SHEET_NAMES.PEOPLE, PERSON_FIELD_SCHEMA, 'Person ID', personId);
}
function setPersonField(personId, header, value) {
  return setRecordFieldGeneric_(SHEET_NAMES.PEOPLE, PERSON_FIELD_SCHEMA, 'Person ID', personId, header, value);
}
function getPersonFieldSchema() { return PERSON_FIELD_SCHEMA; }

function getOpportunityRecord(opportunityId) {
  return getRecordGeneric_(SHEET_NAMES.OPPORTUNITIES, OPPORTUNITY_FIELD_SCHEMA, 'Opportunity ID', opportunityId);
}
function setOpportunityField(opportunityId, header, value) {
  return setRecordFieldGeneric_(SHEET_NAMES.OPPORTUNITIES, OPPORTUNITY_FIELD_SCHEMA, 'Opportunity ID', opportunityId, header, value);
}
function getOpportunityFieldSchema() { return OPPORTUNITY_FIELD_SCHEMA; }

/**
 * Fixed, server-side entity->{sheetName,schema,keyHeader} map -- lets the
 * Web App expose ONE get_record/set_record action pair (inboxService.gs)
 * instead of a new get_x/set_x case every time a record type is added.
 * The client only ever picks an `entity` NAME from this list; it can never
 * supply its own sheet name or schema, which is the whole point -- same
 * "vetted, fixed set of Koli's own functions, never arbitrary code" rule
 * inboxService.gs's own header comment already states for every other
 * action here.
 */
const RECORD_ENTITY_MAP = {
  channel: { sheetName: SHEET_NAMES.CHANNELS, schema: CHANNEL_FIELD_SCHEMA, keyHeader: 'ID' },
  campaign: { sheetName: SHEET_NAMES.CAMPAIGNS, schema: CAMPAIGN_FIELD_SCHEMA, keyHeader: 'Campaign ID' },
  person: { sheetName: SHEET_NAMES.PEOPLE, schema: PERSON_FIELD_SCHEMA, keyHeader: 'Person ID' },
  opportunity: { sheetName: SHEET_NAMES.OPPORTUNITIES, schema: OPPORTUNITY_FIELD_SCHEMA, keyHeader: 'Opportunity ID' }
};

function getRecordForWebApp_(entity, keyValue) {
  const spec = RECORD_ENTITY_MAP[entity];
  if (!spec) throw new Error('Unknown record type: ' + entity);
  return getRecordGeneric_(spec.sheetName, spec.schema, spec.keyHeader, keyValue);
}
function setRecordFieldForWebApp_(entity, keyValue, header, value) {
  const spec = RECORD_ENTITY_MAP[entity];
  if (!spec) throw new Error('Unknown record type: ' + entity);
  return setRecordFieldGeneric_(spec.sheetName, spec.schema, spec.keyHeader, keyValue, header, value);
}

/**
 * Every row for an entity, not just one by key -- added for the Appsmith
 * CRM-UI scoping pass (2026-09-14): a table/board view needs a list before
 * it can ever know which key to ask getRecordGeneric_ for. Deliberately a
 * lighter projection than getRecordGeneric_: no link-formula parsing, no
 * Documents, no cell Notes -- those stay on the single-record fetch
 * (get_record), which is what a detail view is for. Skips rows with no
 * value in the key column (not a real record yet, e.g. mid-creation).
 */
function listRecordsGeneric_(sheetName, schema, keyHeader) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const lastCol = sheet.getLastColumn();
  const actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const keyCol = actualHeaders.indexOf(keyHeader);
  if (keyCol === -1) return [];
  const tz = getTimezone_();
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();

  return data
    .filter(function (row) { return row[keyCol]; })
    .map(function (row) {
      const fields = schema.map(function (f) {
        const idx = actualHeaders.indexOf(f.header);
        let value = idx === -1 ? '' : row[idx];
        if (value instanceof Date) value = Utilities.formatDate(value, tz, 'yyyy-MM-dd');
        return { header: f.header, type: f.type, value: value };
      });
      return { key: row[keyCol], fields: fields };
    });
}

function listRecordsForWebApp_(entity) {
  const spec = RECORD_ENTITY_MAP[entity];
  if (!spec) throw new Error('Unknown record type: ' + entity);
  return listRecordsGeneric_(spec.sheetName, spec.schema, spec.keyHeader);
}

/** Focused single-record dialog for the Sidebar's Expand button (the Kanban boards render this same field set inline instead, via RecordModal.html included directly into their own dialog). */
function showChannelRecordDialog(channelId) {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Expanded channel record'); return; }
  const t = HtmlService.createTemplateFromFile('RecordModalDialog');
  t.recordType = 'channel';
  t.recordKey = channelId;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(480).setHeight(640), 'Channel record');
}

function showCampaignRecordDialog(campaignId) {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Expanded campaign record'); return; }
  const t = HtmlService.createTemplateFromFile('RecordModalDialog');
  t.recordType = 'campaign';
  t.recordKey = campaignId;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(480).setHeight(640), 'Campaign record');
}

function getRecordGeneric_(sheetName, schema, keyHeader, keyValue) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet "' + sheetName + '" not found.');
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const keyCol = actualHeaders.indexOf(keyHeader) + 1;
  if (!keyCol) throw new Error('This ' + sheetName + ' sheet has no "' + keyHeader + '" column.');
  const row = findRowByKey_(sheet, keyCol, keyValue);
  if (row === -1) throw new Error('Row not found: it may have been deleted since this view loaded.');

  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const get = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? '' : values[idx]; };

  const fields = schema.map(function (f) {
    const col = actualHeaders.indexOf(f.header) + 1;
    let value = get(f.header);
    if (value instanceof Date) value = Utilities.formatDate(value, getTimezone_(), 'yyyy-MM-dd');

    const entry = { header: f.header, type: f.type, editable: !!f.editable, value: value, options: f.options || null, tones: f.tones || null };

    if (f.type === 'link' && col) {
      const linked = parseHyperlinkFormula_(sheet.getRange(row, col).getFormula());
      if (linked) { entry.value = linked.label; entry.url = linked.url; }
    }
    if (f.type === 'documents') {
      entry.documents = col ? getRecordDocuments_(sheet.getRange(row, col)) : [];
    }
    // Surfaces whatever Koli's own pipeline already attached as a cell Note
    // (About/socials on Contact, Grade's confidence breakdown, auth
    // justification, etc.) -- these have always existed, but nothing in the
    // Sidebar or this modal showed them before; a hover on the raw Sheet
    // cell was the only way to see one.
    if (col) {
      const note = sheet.getRange(row, col).getNote();
      if (note) entry.note = note;
    }
    return entry;
  });

  return { key: keyValue, fields: fields };
}

function setRecordFieldGeneric_(sheetName, schema, keyHeader, keyValue, header, value) {
  const field = schema.filter(function (f) { return f.header === header; })[0];
  if (!field) throw new Error('Unknown field: ' + header);
  if (!field.editable) throw new Error('"' + header + '" isn\'t editable here.');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet "' + sheetName + '" not found.');
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const keyCol = actualHeaders.indexOf(keyHeader) + 1;
  const col = actualHeaders.indexOf(header) + 1;
  if (!keyCol || !col) throw new Error('Column "' + header + '" not found on ' + sheetName + '.');
  const row = findRowByKey_(sheet, keyCol, keyValue);
  if (row === -1) throw new Error('Row not found: it may have been deleted since this view loaded.');

  const coerced = coerceFieldValue_(field, value);
  const cell = sheet.getRange(row, col);
  cell.setValue(coerced.value);
  if (coerced.numberFormat) cell.setNumberFormat(coerced.numberFormat);

  const updatedCol = actualHeaders.indexOf('Updated') + 1;
  if (updatedCol && header !== 'Updated') sheet.getRange(row, updatedCol).setValue(new Date());

  return { ok: true, value: coerced.display };
}

/** Validates + converts a raw client value into what actually gets written, per field type. Throws on anything that fails validation (an enum value not in its option list, an unparsable date/number) rather than silently writing something wrong. */
function coerceFieldValue_(field, raw) {
  switch (field.type) {
    case 'enum': {
      const v = String(raw || '');
      if (v && (field.options || []).indexOf(v) === -1) throw new Error('"' + v + '" isn\'t a valid ' + field.header + '.');
      return { value: v };
    }
    case 'date': {
      if (!raw) return { value: '' };
      const d = new Date(raw + 'T00:00:00');
      if (isNaN(d.getTime())) throw new Error('"' + raw + '" isn\'t a valid date.');
      return { value: d, numberFormat: 'yyyy-mm-dd', display: raw };
    }
    case 'currency':
    case 'number': {
      if (raw === '' || raw === null || raw === undefined) return { value: '' };
      const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
      if (isNaN(n)) throw new Error('"' + raw + '" isn\'t a valid number.');
      return { value: n, numberFormat: field.type === 'currency' ? '$#,##0.00' : undefined };
    }
    case 'text':
    case 'longtext':
      return { value: sanitizeCellText_(raw == null ? '' : String(raw)) };
    default:
      throw new Error('"' + field.header + '" isn\'t editable here.');
  }
}
