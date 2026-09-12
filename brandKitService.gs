/**
 * brandKitService.gs
 * A brand sends over a PDF/image "brand kit" (guidelines, logo pack,
 * contact sheet) and today that information just sits in an email
 * attachment, disconnected from Koli entirely. This reads it directly:
 * upload once, Gemini's vision input extracts brand name, website, niche/
 * category, decision-maker names or titles if present, and contact info,
 * and it lands as a note on the Sponsors or Brand Targets row you had
 * selected -- enriching what's already there instead of replacing it.
 *
 * Deliberately NOT a Drive-file-picker flow: reading an arbitrary
 * pre-existing Drive file needs either full `drive` scope (the CASA cost
 * this project specifically avoided, see ROADMAP.md round 13) or the
 * Google Picker API (its own separate API key/setup). A plain HTML file
 * input sends the bytes straight from the browser to this script as
 * base64 -- no Drive access needed for the read at all. The file is
 * still saved to Drive afterward, but that's a file *this script
 * creates*, squarely inside the drive.file scope already in place.
 */

function showBrandKitUploadDialog() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Attach Brand Kit'); return; }
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const sheetName = sheet.getName();
  if (sheetName !== SHEET_NAMES.SPONSORS && sheetName !== SHEET_NAMES.BRAND_TARGETS) {
    ui.alert('Select a row on the Sponsors or Brand Targets sheet first, then run this again.');
    return;
  }
  const range = SpreadsheetApp.getActiveRange();
  if (!range || range.getRow() < 2) {
    ui.alert('Select a single data row on ' + sheetName + ' first, then run this again.');
    return;
  }
  const row = range.getRow();
  const brandCol = sheetName === SHEET_NAMES.SPONSORS ? SPONSOR_HEADERS.indexOf('Brand') + 1 : 1;
  const brandName = sheet.getRange(row, brandCol).getValue();
  if (!brandName) {
    ui.alert('That row has no brand name yet: fill it in first, then attach a brand kit to it.');
    return;
  }

  const t = HtmlService.createTemplateFromFile('BrandKitUploadDialog');
  t.sheetName = sheetName;
  t.row = row;
  t.brandName = brandName;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(420).setHeight(340), 'Attach Brand Kit: ' + brandName);
}

/**
 * @param {string} base64Data - raw base64, no "data:...;base64," prefix
 * @param {string} mimeType - e.g. "application/pdf", "image/jpeg"
 * @param {string} fileName
 * @param {string} sheetName - SHEET_NAMES.SPONSORS or SHEET_NAMES.BRAND_TARGETS
 * @param {number} row
 */
function processBrandKitUpload(base64Data, mimeType, fileName, sheetName, row) {
  try {
    if (!base64Data) throw new Error('No file data received.');
    const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (ALLOWED_TYPES.indexOf(mimeType) === -1) {
      throw new Error('Unsupported file type (' + mimeType + '): use a PDF, JPEG, PNG, or WebP.');
    }

    const prompt =
      'This is a brand kit document (guidelines, media kit, or partnership one-pager) a brand sent to an ' +
      'influencer-marketing agency. Extract what you can actually find in the document -- if a field genuinely ' +
      'is not present, return an empty string or empty array for it rather than guessing or inferring one, ' +
      'since a wrong invented fact here is worse than a blank field.\n\n' +
      'Respond as JSON: {"brandName": "...", "website": "...", "niche": "...", "contactEmail": "...", ' +
      '"decisionMakers": [{"name": "...", "title": "..."}], "socials": ["..."], ' +
      '"notes": "one or two sentences on anything else relevant: budget ranges mentioned, campaign goals, brand voice/guidelines"}';

    const extracted = callGeminiVisionJson_(prompt, base64Data, mimeType);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet "' + sheetName + '" not found.');
    const brandCol = sheetName === SHEET_NAMES.SPONSORS ? SPONSOR_HEADERS.indexOf('Brand') + 1 : 1;
    const cell = sheet.getRange(row, brandCol);

    const lines = ['From uploaded Brand Kit (' + Utilities.formatDate(new Date(), getTimezone_(), 'yyyy-MM-dd') + '):'];
    if (extracted.website) lines.push('Website: ' + extracted.website);
    if (extracted.niche) lines.push('Niche: ' + extracted.niche);
    if (extracted.contactEmail) lines.push('Contact: ' + extracted.contactEmail);
    if (extracted.decisionMakers && extracted.decisionMakers.length) {
      lines.push('Decision-makers: ' + extracted.decisionMakers.map(function (d) {
        return d.name + (d.title ? ' (' + d.title + ')' : '');
      }).join(', '));
    }
    if (extracted.socials && extracted.socials.length) lines.push('Socials: ' + extracted.socials.join(', '));
    if (extracted.notes) lines.push('Notes: ' + extracted.notes);

    const existingNote = cell.getNote();
    const newNote = (existingNote ? existingNote + '\n\n' : '') + lines.join('\n');
    cell.setNote(newNote);

    const fileUrl = saveBrandKitFile_(base64Data, mimeType, fileName, extracted.brandName || String(sheet.getRange(row, brandCol).getValue()));

    return { ok: true, fileUrl: fileUrl, extracted: extracted };
  } catch (e) {
    return { ok: false, error: errMsg_(e) };
  }
}

function saveBrandKitFile_(base64Data, mimeType, fileName, brandLabel) {
  const folderId = getOrCreateBrandKitsFolder_();
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName || (brandLabel + ' brand kit'));
  const file = Drive.Files.create({ name: (brandLabel || 'Brand') + ' - ' + (fileName || 'brand kit'), parents: [folderId] }, blob);
  return 'https://drive.google.com/file/d/' + file.id + '/view';
}

function getOrCreateBrandKitsFolder_() {
  const storedId = getProp_(PROP_KEYS.BRAND_KITS_FOLDER_ID, '');
  if (storedId) {
    try {
      const existing = Drive.Files.get(storedId, { fields: 'id, trashed' });
      if (!existing.trashed) return existing.id;
    } catch (e) { /* stored folder no longer reachable: fall through and recreate */ }
  }
  const folder = Drive.Files.create({ name: 'Koli Brand Kits', mimeType: 'application/vnd.google-apps.folder' });
  PropertiesService.getDocumentProperties().setProperty(PROP_KEYS.BRAND_KITS_FOLDER_ID, folder.id);
  return folder.id;
}
