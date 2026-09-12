/**
 * emailTrackingService.gs
 * "Post service" for outreach: the Magio pattern (a tracking pixel
 * embedded in the sent email, logged when it loads) adapted to Koli's
 * own architecture. Magio's own stack (Next.js/Postgres dashboard) isn't
 * portable here, but the actual mechanism -- an invisible 1x1 image whose
 * request IS the open event -- needs nothing but the Web App Koli already
 * has for the browser extension.
 *
 * Real Apps Script constraint, worth stating plainly: ContentService is a
 * text-based API, not a binary one. Round-tripping real image bytes
 * through it needs the ISO-8859-1 string trick below (each byte value
 * maps to exactly one character, so nothing gets corrupted by a text
 * encoding) -- this is the standard, well-documented way anyone serves a
 * binary blob through Apps Script's Web App, not a workaround unique to
 * Koli.
 *
 * Known, unavoidable limitation of pixel tracking generally (not
 * Apps-Script-specific): most modern email clients block remote images
 * by default until the recipient clicks "show images" or trusts the
 * sender, so this undercounts real opens. Same tradeoff Magio and every
 * other pixel-based open tracker carries -- stated here so "0 opens"
 * doesn't get read as "definitely never opened."
 */

const EMAIL_OPEN_HEADERS = ['Token', 'Outreach Row', 'Channel ID', 'Sent Date', 'First Opened', 'Open Count'];

// A real 1x1 transparent GIF, the same well-known bytes used across
// virtually every pixel-tracking implementation -- not copyrighted
// content, just the smallest possible valid image.
const TRACKING_PIXEL_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function registerEmailTracking_(outreachRow, channelId) {
  const token = Utilities.getUuid().replace(/-/g, '');
  const sheet = getOrCreateSheet_(SHEET_NAMES.EMAIL_OPENS, EMAIL_OPEN_HEADERS);
  sheet.appendRow([token, outreachRow, channelId, new Date(), '', 0]);
  return token;
}

function recordEmailOpen_(token) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.EMAIL_OPENS);
  if (!sheet || sheet.getLastRow() < 2) return;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, EMAIL_OPEN_HEADERS.length).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] !== token) continue;
    const row = i + 2;
    const count = (Number(data[i][5]) || 0) + 1;
    sheet.getRange(row, 6).setValue(count);
    if (!data[i][4]) sheet.getRange(row, 5).setValue(new Date());

    // Mirror onto the Outreach Drafts row itself so opens are visible
    // without ever needing to open this hidden sheet.
    const outreachSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OUTREACH_DRAFTS);
    if (outreachSheet) {
      ensureExtraColumns_(outreachSheet, ['Opened', 'Open Count']);
      const headers = outreachSheet.getRange(1, 1, 1, outreachSheet.getLastColumn()).getValues()[0];
      const openedCol = headers.indexOf('Opened') + 1;
      const openCountCol = headers.indexOf('Open Count') + 1;
      const outreachRow = Number(data[i][1]);
      if (outreachRow) {
        if (openedCol) outreachSheet.getRange(outreachRow, openedCol).setValue('Yes');
        if (openCountCol) outreachSheet.getRange(outreachRow, openCountCol).setValue(count);
      }
    }
    return;
  }
}

/** Returns a ContentService image response -- see the file header comment on why the ISO-8859-1 round-trip is needed. */
function trackingPixelResponse_() {
  const bytes = Utilities.base64Decode(TRACKING_PIXEL_GIF_BASE64);
  const asLatin1 = Utilities.newBlob(bytes, 'image/gif').getDataAsString('ISO-8859-1');
  return ContentService.createTextOutput(asLatin1).setMimeType(ContentService.MimeType.GIF);
}

function buildTrackingPixelTag_(webAppUrl, token) {
  const sep = webAppUrl.indexOf('?') === -1 ? '?' : '&';
  return '<img src="' + webAppUrl + sep + 'track=' + token + '" width="1" height="1" style="display:none" alt="">';
}
