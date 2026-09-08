/**
 * brandViewService.gs
 * "Brand View" — a live, brand-safe QUERY() view of the Channels sheet,
 * meant as the data source for an external presentation layer (Looker
 * Studio, formerly Data Studio) shared with a brand via a view-only
 * link. This is the free alternative to Sheets Canvas: no Workspace paid
 * tier needed on either side, and the brand never needs access to the
 * real spreadsheet — Looker Studio's Google Sheets connector reads this
 * tab, and only this tab.
 *
 * Deliberately excludes the same internal-only fields Creator One-Pager
 * already excludes (Outreach status, Last Contact, Notes) plus Status/
 * ID/Post Times/Report, which have no value to a brand and would just be
 * noise in a comparison view. Contact IS included — matching Creator
 * One-Pager's own precedent of sharing it with a brand, not a stricter
 * policy invented just for this view.
 *
 * Built as a single QUERY() formula, not a script-generated snapshot —
 * it stays live automatically as Channels changes, no "refresh" menu
 * click to remember, and no extra Drive/Gemini/YouTube cost. Column
 * letters are resolved from Channels' actual current header row rather
 * than hardcoded, so this survives a future Channels column reorder the
 * same way everything else in Koli does (see needsChannelsV2Migration_
 * in sheetWriter.gs for why that matters here).
 */

const BRAND_VIEW_FIELDS = ['Channel', 'Niche', 'Subs', 'Avg Views', 'Posts/Mo', 'Grade', 'Contact'];

function showBrandView() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const channelsSheet = ss.getSheetByName(SHEET_NAMES.CHANNELS);
  if (!channelsSheet || channelsSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No Channels data yet — analyze some channels first, then set up Brand View.');
    return;
  }

  const headers = channelsSheet.getRange(1, 1, 1, channelsSheet.getLastColumn()).getValues()[0];
  const missing = BRAND_VIEW_FIELDS.filter(function (name) { return headers.indexOf(name) === -1; });
  if (missing.length) {
    SpreadsheetApp.getUi().alert(
      'Brand View needs these Channels columns, not found: ' + missing.join(', ') + '. ' +
      'Re-run Channel Analysis, or check your Channels sheet layout (Koli > Migrate Channels Sheet (v2) if it\'s an old layout).'
    );
    return;
  }

  const colLetters = BRAND_VIEW_FIELDS.map(function (name) { return columnToLetter_(headers.indexOf(name) + 1); });
  const lastColLetter = columnToLetter_(channelsSheet.getLastColumn());
  const gradeCol = colLetters[BRAND_VIEW_FIELDS.indexOf('Grade')];
  const channelCol = colLetters[BRAND_VIEW_FIELDS.indexOf('Channel')];
  const query = 'SELECT ' + colLetters.join(', ') + ' WHERE ' + channelCol + ' IS NOT NULL ORDER BY ' + gradeCol + ' ASC';

  let sheet = ss.getSheetByName(SHEET_NAMES.BRAND_VIEW);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.BRAND_VIEW);
  sheet.clear();
  sheet.getRange(1, 1).setFormula('=QUERY(Channels!A1:' + lastColLetter + ', "' + query + '", 1)');
  formatHeaderRow_(sheet, BRAND_VIEW_FIELDS.length);

  ss.setActiveSheet(sheet);
  SpreadsheetApp.getUi().alert(
    'Brand View ready',
    'A live, brand-safe view of your Channels data is in the "Brand View" tab — Channel, Niche, Subs, Avg ' +
    'Views, Posts/Mo, Grade, and Contact only (no Outreach status, internal Notes, or IDs). Connect Looker ' +
    'Studio\'s Google Sheets connector to this tab, then share the Looker Studio report\'s own link with a ' +
    'brand — they never need access to this spreadsheet itself.\n\n' +
    'If Channels\' columns ever change, re-run Koli > Export > Set Up Brand View to rebuild this formula ' +
    'against the new layout.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/** 1 -> 'A', 27 -> 'AA', etc. Spreadsheet column index to A1-notation letters. */
function columnToLetter_(col) {
  let letter = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
