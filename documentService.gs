/**
 * documentService.gs
 * "Documents" field on the shared record modal (Channels and Campaigns):
 * attach a file to a row two ways -- upload-and-OCR (same Gemini Vision
 * mechanism as the existing Brand Kit feature, brandKitService.gs, which
 * this generalizes without touching) or link an already-existing Drive file
 * via the Google Picker.
 *
 * Storage per attachment cell: a human-readable running log in the cell's
 * Note (same convention Brand Kit already uses) for anyone reading the raw
 * Sheet, PLUS a structured JSON array in the cell's Developer Metadata (key
 * 'koliDocs') as the reliable source the record modal actually renders
 * from -- parsing the free-text Note back out would be fragile the moment
 * its wording changes.
 */

const DOC_OCR_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Where a Documents attachment lives for each record type, and how to steer the extraction prompt for it. */
function resolveRecordLocation_(recordType, recordKey) {
  const cfg = recordType === 'campaign'
    ? {
        sheetName: SHEET_NAMES.CAMPAIGNS, keyHeader: 'Campaign ID',
        promptContext: 'a contract, brief, or deliverable proof for an influencer-marketing deal -- extract deliverables, payment terms, and dates if present'
      }
    : {
        sheetName: SHEET_NAMES.CHANNELS, keyHeader: 'ID',
        promptContext: 'a document related to a content-creator channel (e.g. a media kit, one-off agreement, or rate card) -- extract anything relevant to working with this creator'
      };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.sheetName);
  if (!sheet) throw new Error('Sheet "' + cfg.sheetName + '" not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const keyCol = headers.indexOf(cfg.keyHeader) + 1;
  const docsCol = headers.indexOf('Documents') + 1;
  if (!keyCol || !docsCol) throw new Error('This sheet is missing its "' + cfg.keyHeader + '"/"Documents" column.');
  const row = findRowByKey_(sheet, keyCol, recordKey);
  if (row === -1) throw new Error('Row not found: it may have been deleted since this view loaded.');
  return { sheet: sheet, row: row, docsCol: docsCol, promptContext: cfg.promptContext };
}

function getRecordDocuments_(cell) {
  const meta = cell.getDeveloperMetadata().filter(function (m) { return m.getKey() === 'koliDocs'; })[0];
  if (!meta) return [];
  try { return JSON.parse(meta.getValue() || '[]'); } catch (e) { return []; }
}

/** Appends one attachment: updates the structured metadata list, the visible hyperlink (points at the most recent file), and the human-readable Note log. */
function appendDocumentEntry_(sheet, row, docsCol, entry) {
  const cell = sheet.getRange(row, docsCol);
  const docs = getRecordDocuments_(cell);
  docs.push(entry);

  const json = JSON.stringify(docs);
  const existingMeta = cell.getDeveloperMetadata().filter(function (m) { return m.getKey() === 'koliDocs'; })[0];
  if (existingMeta) existingMeta.setValue(json); else cell.addDeveloperMetadata('koliDocs', json);

  cell.setFormula(hyperlinkFormula_(entry.url, entry.name));

  const dateStr = Utilities.formatDate(new Date(), getTimezone_(), 'yyyy-MM-dd');
  const sourceLabel = entry.source === 'drive' ? 'linked from Drive' : 'uploaded';
  const line = entry.name + ' (' + sourceLabel + ', ' + dateStr + '): ' + entry.url + (entry.extractedSummary ? '\n' + entry.extractedSummary : '');
  const existingNote = cell.getNote();
  cell.setNote(existingNote ? existingNote + '\n\n' + line : line);
}

/**
 * @param {string} base64Data - raw base64, no "data:...;base64," prefix
 * @param {string} mimeType
 * @param {string} fileName
 * @param {string} recordType - 'channel' | 'campaign'
 * @param {string} recordKey - Channel ID or Campaign ID
 */
function processRecordDocumentUpload(base64Data, mimeType, fileName, recordType, recordKey) {
  try {
    if (!hasPremiumAccess_()) return { ok: false, error: 'Documents is part of Koli\'s premium tier.' };
    if (!base64Data) throw new Error('No file data received.');
    if (DOC_OCR_TYPES.indexOf(mimeType) === -1) throw new Error('Unsupported file type (' + mimeType + '): use a PDF, JPEG, PNG, or WebP.');

    const loc = resolveRecordLocation_(recordType, recordKey);
    const extracted = callGeminiVisionJson_(extractionPrompt_(loc.promptContext), base64Data, mimeType);

    const folderId = getOrCreateDocumentsFolder_();
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName || 'document');
    const file = Drive.Files.create({ name: fileName || 'document', parents: [folderId] }, blob);
    const url = 'https://drive.google.com/file/d/' + file.id + '/view';

    appendDocumentEntry_(loc.sheet, loc.row, loc.docsCol, {
      name: fileName || 'document', url: url, source: 'upload',
      uploadedAt: new Date().toISOString(), extractedSummary: extracted.summary || ''
    });

    return { ok: true, url: url, summary: extracted.summary || '' };
  } catch (e) {
    return { ok: false, error: errMsg_(e) };
  }
}

/** Called after a Google Picker selection: links an existing Drive file without duplicating it into Koli's own folder. Picker grants per-file read access under the drive.file scope already declared -- no broader Drive scope needed. */
function attachDriveFileToRecord(recordType, recordKey, fileId, fileName, mimeType) {
  try {
    if (!hasPremiumAccess_()) return { ok: false, error: 'Documents is part of Koli\'s premium tier.' };
    const loc = resolveRecordLocation_(recordType, recordKey);
    const file = DriveApp.getFileById(fileId);
    const url = file.getUrl();

    let summary = '';
    if (DOC_OCR_TYPES.indexOf(mimeType) !== -1) {
      try {
        const base64 = Utilities.base64Encode(file.getBlob().getBytes());
        summary = callGeminiVisionJson_(extractionPrompt_(loc.promptContext), base64, mimeType).summary || '';
      } catch (e) { /* best-effort: linking the file must still succeed even if OCR fails (e.g. an unreadable scan) */ }
    }

    appendDocumentEntry_(loc.sheet, loc.row, loc.docsCol, {
      name: fileName || file.getName(), url: url, source: 'drive',
      uploadedAt: new Date().toISOString(), extractedSummary: summary
    });

    return { ok: true, url: url, summary: summary };
  } catch (e) {
    return { ok: false, error: errMsg_(e) };
  }
}

function extractionPrompt_(promptContext) {
  return 'This is ' + promptContext + '. Extract what you can actually find -- if a field genuinely is not ' +
    'present, leave it out rather than guessing or inferring one, since a wrong invented fact here is worse than ' +
    'a blank field. Respond as JSON: {"summary": "two or three sentences on what this document is and its key facts"}';
}

function getOrCreateDocumentsFolder_() {
  const storedId = getProp_(PROP_KEYS.DOCUMENTS_FOLDER_ID, '');
  if (storedId) {
    try {
      const existing = Drive.Files.get(storedId, { fields: 'id, trashed' });
      if (!existing.trashed) return existing.id;
    } catch (e) { /* stored folder no longer reachable: fall through and recreate */ }
  }
  const folder = Drive.Files.create({ name: 'Koli Documents', mimeType: 'application/vnd.google-apps.folder' });
  PropertiesService.getDocumentProperties().setProperty(PROP_KEYS.DOCUMENTS_FOLDER_ID, folder.id);
  return folder.id;
}

/**
 * Client-callable config for the record modal's "Connect from Drive"
 * button: an unconfigured Picker (no API key saved in Settings yet) and a
 * non-premium user get distinct `reason`s so the client can show the right
 * explanation instead of a dead button with no context.
 */
function getPickerConfig() {
  if (!hasPremiumAccess_()) return { ok: false, reason: 'premium' };
  const apiKey = getProp_(PROP_KEYS.PICKER_API_KEY, '');
  if (!apiKey) return { ok: false, reason: 'unconfigured' };
  return { ok: true, apiKey: apiKey, oauthToken: ScriptApp.getOAuthToken() };
}
