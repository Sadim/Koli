/**
 * sheetWriter.gs
 * The only file that touches SpreadsheetApp for writing rows. Keeps
 * formatting, headers, hidden ID columns, and notes consistent regardless
 * of which service produced the data.
 */

const HIDDEN_COLS = {};
HIDDEN_COLS[SHEET_NAMES.CHANNELS] = [3];
HIDDEN_COLS[SHEET_NAMES.VIDEOS] = [3];
HIDDEN_COLS[SHEET_NAMES.SPONSORS] = [2];
HIDDEN_COLS[SHEET_NAMES.PROFILE] = [3, 4];
HIDDEN_COLS[SHEET_NAMES.CAMPAIGNS] = [2];
HIDDEN_COLS[SHEET_NAMES.OUTREACH_DRAFTS] = [2];
HIDDEN_COLS[SHEET_NAMES.BRAND_FIT_SCORES] = [2];

// Koli's own default look, applied to every sheet it creates (and
// re-appliable on demand to sheets that predate this via Koli > Run
// Diagnostics-adjacent menu item runKoliDefaultFormatting). Abel/10pt,
// vertical-top, wrap: matches what was previously being set by hand on
// every sheet after the fact.
const KOLI_DEFAULT_FONT_FAMILY = 'Abel';
const KOLI_DEFAULT_FONT_SIZE = 10;

function applyKoliDefaultFormat_(sheet, numCols) {
  const cols = Math.max(numCols || 1, sheet.getMaxColumns());
  const range = sheet.getRange(1, 1, sheet.getMaxRows(), cols);
  range.setFontFamily(KOLI_DEFAULT_FONT_FAMILY).setFontSize(KOLI_DEFAULT_FONT_SIZE)
    .setVerticalAlignment('top').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
}

/** Retroactively applies applyKoliDefaultFormat_ to every sheet Koli manages -- for sheets that existed before this default was introduced. */
function runKoliDefaultFormatting() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const names = [
    SHEET_NAMES.CHANNELS, SHEET_NAMES.VIDEOS, SHEET_NAMES.PROFILE, SHEET_NAMES.DISCOVER,
    SHEET_NAMES.SPONSORS, SHEET_NAMES.CAMPAIGNS, SHEET_NAMES.OUTREACH_DRAFTS,
    SHEET_NAMES.BRAND_TARGETS, SHEET_NAMES.BRAND_DISCOVERY, SHEET_NAMES.BRAND_FIT_SCORES, SHEET_NAMES.BRAND_VIEW,
    SHEET_NAMES.PROFILE_VIEW, SHEET_NAMES.ATTENTION, SHEET_NAMES.INBOX
  ];
  let touched = 0;
  names.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    applyKoliDefaultFormat_(sheet, sheet.getLastColumn() || 1);
    touched++;
  });
  SpreadsheetApp.getUi().alert('Applied Koli\'s default formatting (Abel, 10pt, top-aligned, wrapped) to ' + touched + ' sheet(s).');
}

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    formatHeaderRow_(sheet, headers.length);
    applyKoliDefaultFormat_(sheet, headers.length);
    if (name === SHEET_NAMES.SNAPSHOTS || name === SHEET_NAMES.TRACKED_PROFILES || name === SHEET_NAMES.PUBLISHED_PAGES || name === SHEET_NAMES.EMAIL_OPENS) sheet.hideSheet();
    (HIDDEN_COLS[name] || []).forEach(function (col) { sheet.hideColumns(col); });
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    formatHeaderRow_(sheet, headers.length);
  } else if (name === SHEET_NAMES.CHANNELS && needsChannelsV2Migration_(sheet)) {
    // The v2 layout reordered columns (not just appended new trailing
    // ones): naive header-append would silently misalign every existing
    // row against the wrong header. Leave the sheet untouched here;
    // Koli > Migrate Channels Sheet (v2) handles this safely and once.
  } else {
    migrateHeaders_(sheet, headers);
  }
  if (name === SHEET_NAMES.CHANNELS && !needsChannelsV2Migration_(sheet)) ensureOutreachColumn_(sheet);
  return sheet;
}

/** True if this Channels sheet still has the pre-v2 layout (Email at col 6, not Contact). */
function needsChannelsV2Migration_(sheet) {
  if (sheet.getLastColumn() < 6) return false;
  const col6Header = sheet.getRange(1, 6).getValue();
  return col6Header === 'Email';
}

/**
 * A sheet built before new trailing columns existed (e.g. Channels before
 * Outreach/Last Contact/Notes/Report) only has the old header row. This
 * appends whatever's missing at the end: never touches existing columns
 * or data: so upgrading Koli doesn't require rebuilding any sheet.
 */
function migrateHeaders_(sheet, expectedHeaders) {
  const currentWidth = sheet.getLastColumn();
  if (expectedHeaders.length <= currentWidth) return;
  const missing = expectedHeaders.slice(currentWidth);
  const startCol = currentWidth + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  sheet.getRange(1, startCol, 1, missing.length).setFontWeight('bold').setBackground('#f1f3f4').setFontColor('#202124');
}

/**
 * Applies the Outreach dropdown (native data validation, same UI pattern
 * as the original Data Validation reference) to the whole column, and
 * backfills "Not Contacted" only into currently-blank cells: never
 * overwrites a status you've already set.
 */
function ensureOutreachColumn_(sheet) {
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const outreachCol = actualHeaders.indexOf('Outreach') + 1;
  if (!outreachCol) return;
  const bufferRows = 1000;
  const range = sheet.getRange(2, outreachCol, bufferRows, 1);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(OUTREACH_STATUSES, true).setAllowInvalid(false).build();
  range.setDataValidation(rule);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, outreachCol, lastRow - 1, 1).getValues();
  const toBackfill = [];
  values.forEach(function (r, i) { if (!r[0]) toBackfill.push(i); });
  if (toBackfill.length) {
    toBackfill.forEach(function (i) { sheet.getRange(2 + i, outreachCol).setValue('Not Contacted'); });
  }
}

function formatHeaderRow_(sheet, numCols) {
  const range = sheet.getRange(1, 1, 1, numCols);
  range.setFontWeight('bold').setBackground('#f1f3f4').setFontColor('#202124');
  sheet.setFrozenRows(1);
}

/**
 * Non-destructive backfill for headers added to CHANNEL_HEADERS after a
 * sheet was already created (e.g. an existing customer's copy): appends
 * any of the given names missing from the sheet's ACTUAL header row as
 * new columns at the end. Unlike migrateChannelsSheetV2, this never
 * rebuilds or reorders anything already there -- safe to call on every
 * write, a no-op once the columns already exist.
 */
function ensureExtraColumns_(sheet, names) {
  const lastCol = sheet.getLastColumn();
  const actualHeaders = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  let nextCol = lastCol;
  names.forEach(function (name) {
    if (actualHeaders.indexOf(name) !== -1) return;
    nextCol++;
    sheet.getRange(1, nextCol).setValue(name);
    formatHeaderRow_(sheet, nextCol);
  });
}

function findRowByKey_(sheet, keyCol, keyValue) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === keyValue) return i + 2;
  }
  return -1;
}

function hyperlinkFormula_(url, label) {
  return '=HYPERLINK("' + url + '","' + String(label || url).replace(/"/g, "'") + '")';
}

/** Inverse of hyperlinkFormula_: pulls {url,label} back out of a cell's =HYPERLINK(...) formula string, for read-only "link"-type fields in recordService.gs. Returns null if the formula doesn't match that exact shape. */
function parseHyperlinkFormula_(formula) {
  const m = /^=HYPERLINK\("([^"]*)"\s*,\s*"([^"]*)"\)$/.exec(String(formula || ''));
  return m ? { url: m[1], label: m[2] } : null;
}

/**
 * Status cells get a glyph + color instead of plain text: "☑ Done" in
 * green, "✗ Error: ..." in red, "○ New" in gray: same icon language
 * already used in the sidebar's result rows. Easier to scan a column of
 * these at a glance than a column of plain words.
 */
function formatStatusCell_(cell, rawStatus) {
  const s = String(rawStatus || '');
  let text = s, color = '#5f6368';
  if (s === 'Done') { text = '☑ Done'; color = '#188038'; }
  else if (s === 'New') { text = '○ New'; color = '#1a73e8'; }
  else if (s.indexOf('Error') === 0) { text = '✗ ' + s; color = '#d93025'; }
  else if (s.indexOf('Skipped') === 0) { text = '⤳ ' + s; color = '#b06000'; }
  cell.setValue(text);
  cell.setFontColor(color);
}

/**
 * Formula/CSV-injection guard. Any text derived from Gemini output or an
 * external source (video descriptions, comments, channel names: all
 * writable by anyone on the public internet) could contain a string
 * starting with =, +, -, or @, which Google Sheets treats as a live
 * formula on render regardless of how the cell was written. A leading
 * apostrophe forces it to render as literal text instead. Applied to
 * every cell that holds AI-derived or externally-sourced free text:
 * not to values Koli computed itself (CPM strings, dates, counts).
 */
function sanitizeCellText_(text) {
  const s = String(text === null || text === undefined ? '' : text);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/**
 * Appends to a cell's existing note rather than overwriting it. Needed
 * because more than one part of the write pipeline can set a note on the
 * same cell (Contact gets both writeEmailPreservingManual_'s "kept your
 * entry" conflict warning AND the About/socials block below) -- a plain
 * setNote() from the second writer used to silently destroy whatever the
 * first one had just written.
 */
function appendNote_(cell, text) {
  if (!text) return;
  const existing = cell.getNote();
  cell.setNote(existing ? existing + '\n\n' + text : text);
}

/**
 * Manual email entry: type an address directly into the Email cell (col 6
 * on Channels) any time: including right over "Not found." Re-running
 * Channel analysis for that channel will NOT overwrite it. Only a cell
 * that's currently blank or still says "Not found" gets written with
 * whatever auto-detection just found. If auto-detection now finds a
 * different email than what's manually sitting there, it doesn't fight
 * you for the cell: it notes the discrepancy instead, so you can decide.
 */
function writeEmailPreservingManual_(sheet, row, currentEmail, autoFoundEmail, contactCol) {
  if (!contactCol) return; // Contact column doesn't exist in this layout: nothing to write
  const cell = sheet.getRange(row, contactCol);
  const isManualOrConfirmed = currentEmail && currentEmail !== 'Not found';

  if (!isManualOrConfirmed) {
    cell.setValue(autoFoundEmail);
    cell.setNote('');
    return;
  }

  if (autoFoundEmail && autoFoundEmail !== 'Not found' && autoFoundEmail !== currentEmail) {
    cell.setNote('Kept your entry. Auto-detection on the latest run found a different address: ' + autoFoundEmail);
  }
  // Otherwise: manual/confirmed value stands, no note needed.
}

// ---------- Channels ----------

function writeChannelRow(channel) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.CHANNELS, CHANNEL_HEADERS);
  if (needsChannelsV2Migration_(sheet)) {
    throw new Error('Channels sheet needs a one-time migration to the new layout first: run Koli > Migrate Channels Sheet (v2) from the menu, then try again.');
  }
  ensureExtraColumns_(sheet, ['Engagement %', 'Suggested Rate']);
  if (sheet.getLastColumn() > CHANNEL_HEADERS.length && sheet.getRange(1, CHANNEL_HEADERS.length + 1).getValue()) {
    throw new Error('This Channels sheet still has extra columns from an older layout. Rename this tab (e.g. "Channels (old)") so Koli creates a fresh one, or manually delete the columns after ' + CHANNEL_HEADERS[CHANNEL_HEADERS.length - 1] + ' before continuing.');
  }

  // Every column below is looked up against the sheet's ACTUAL current
  // header row: never assumed to match CHANNEL_HEADERS' declared order.
  // Someone may have manually reordered columns in Sheets, or applied a
  // reordered layout from the extension: either way, a value must land
  // in the right column by name, not by position. If a column has been
  // removed entirely, colOf returns null and that field is silently
  // skipped rather than erroring or misplacing data into the wrong spot.
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = function (name) {
    const idx = actualHeaders.indexOf(name);
    return idx === -1 ? null : idx + 1;
  };

  const idCol = colOf('ID');
  if (!idCol) throw new Error('This Channels sheet has no "ID" column: Koli needs it to identify rows. Restore it or start a fresh Channels tab.');
  const existingRow = findRowByKey_(sheet, idCol, channel.channelId);
  const row = existingRow === -1 ? sheet.getLastRow() + 1 : existingRow;

  const contactCol = colOf('Contact');
  const currentEmail = (existingRow === -1 || !contactCol) ? '' : String(sheet.getRange(row, contactCol).getValue() || '').trim();

  const nicheText = sanitizeCellText_(channel.mainNiche +
    (channel.subNiches && channel.subNiches.length ? ' (' + channel.subNiches.join(', ') + ')' : ''));
  const grade = computeGrade_(channel.channelId, channel.growthScore, channel.authenticity,
    channel.engagementRatio, channel.audience.location, channel.recentVideos || []);

  const fieldValues = {
    'Status': '', 'Channel': '', 'ID': channel.channelId, 'Niche': nicheText,
    'Posts/Mo': channel.avgPostsPerMonth, 'Contact': currentEmail,
    'Subs': channel.subCount === null ? 'Hidden' : formatCount_(channel.subCount),
    'Avg Views': channel.avgViews, 'Post Times': channel.postingPattern,
    'Grade': grade.letter,
    // A raw number + an explicit literal-suffix number format (below),
    // never a "3.9%"-style string: Sheets silently auto-converts a string
    // shaped like a percentage into a fraction (0.039) with its OWN
    // percentage formatting applied, which every plain-value reader
    // (getValues()) then sees as 0.039, not the "3.90%" the cell displays
    // -- confirmed directly as the cause of the Sidebar/report engagement
    // mismatch. writeVideoRow already used this correct pattern; this
    // brings Channels in line with it instead of leaving the two
    // inconsistent.
    'Engagement %': typeof channel.engagementRatio === 'number' ? channel.engagementRatio : '',
    'Suggested Rate': (typeof channel.suggestedRateLow === 'number' && typeof channel.suggestedRateHigh === 'number')
      ? '$' + channel.suggestedRateLow.toLocaleString() + ' - $' + channel.suggestedRateHigh.toLocaleString()
      : ''
  };
  Object.keys(fieldValues).forEach(function (name) {
    const col = colOf(name);
    if (col) sheet.getRange(row, col).setValue(fieldValues[name]);
  });

  if (colOf('Status')) formatStatusCell_(sheet.getRange(row, colOf('Status')), STATUS.DONE);
  if (colOf('Channel')) sheet.getRange(row, colOf('Channel')).setFormula(hyperlinkFormula_(channelUrl_(channel.channelId), channel.name));

  writeEmailPreservingManual_(sheet, row, currentEmail, channel.contact.email, contactCol);

  if (existingRow === -1 && colOf('Outreach')) {
    sheet.getRange(row, colOf('Outreach')).setValue('Not Contacted');
  }

  if (colOf('Posts/Mo')) sheet.getRange(row, colOf('Posts/Mo')).setNumberFormat('0.0');
  if (colOf('Engagement %') && typeof channel.engagementRatio === 'number') sheet.getRange(row, colOf('Engagement %')).setNumberFormat('0.0"%"');
  const c = grade.components;
  if (colOf('Grade')) {
    sheet.getRange(row, colOf('Grade')).setNote(
      'Confidence: ' + grade.confidence.toUpperCase() + ' (' + Math.round(grade.evidenceCoverage * 100) + '% of this score is real measured signal, not a placeholder/neutral fallback)\n\n' +
      'Composite score: ' + grade.score + '/100\n' +
      'Momentum ' + Math.round(c.momentum) + ' (25%) · Engagement quality ' + Math.round(c.engagementQuality) + ' (20%) · ' +
      'Commercial fit ' + Math.round(c.commercialFit) + ' (15%) · Reliability ' + Math.round(c.reliability) + ' (15%) · ' +
      'Risk ' + Math.round(c.risk) + ' (10%, higher = lower risk) · Audience fit ' + Math.round(c.audienceFit) + ' (10%) · ' +
      'Content fit ' + Math.round(c.contentFit) + ' (5%, placeholder: needs a target niche input, not built yet)\n' +
      'Not a standard external metric: Koli\'s own formula, tunable in constants.gs.'
    );
  }

  // About summary + social links live on Contact, not Channel: this is
  // genuinely where someone looking to reach out would think to check
  // first. appendNote_ (not setNote) because writeEmailPreservingManual_
  // above may have already put a real warning on this same cell (a kept
  // manual entry that disagrees with what auto-detection just found) --
  // overwriting it here used to silently destroy that warning every time.
  const socialsText = channel.contact.socials.length
    ? channel.contact.socials.map(function (s) { return s.platform + ': ' + s.url; }).join('\n')
    : 'None found';
  const aboutText = channel.aboutSummary ? channel.aboutSummary : '';
  if (contactCol) {
    appendNote_(sheet.getRange(row, contactCol),
      (aboutText ? 'About:\n' + aboutText + '\n\n' : '') + 'Other ways to reach them:\n' + socialsText);
  }

  recordSubscriberSnapshot_(channel.channelId, channel.subCount, channel.avgViews, channel.avgLikes, channel.avgComments);
  return row;
}

function writeChannelError_(channelInput, errorMessage) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.CHANNELS, CHANNEL_HEADERS);
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 3).setValues([['', channelInput, errorMessage]]);
  formatStatusCell_(sheet.getRange(row, 1), STATUS.ERROR);
}

/**
 * One-time, safe migration from the pre-v2 Channels layout (13 columns)
 * to the new one (24 columns, several new metrics inserted mid-sheet,
 * not just appended). The old sheet is renamed as a backup, never
 * deleted: copyTo preserves formulas (hyperlinks survive) and notes.
 * New columns are left blank; they backfill the next time each channel
 * is re-analyzed, not automatically here (avoids a surprise API-quota
 * burn re-analyzing everything at once).
 */
function migrateChannelsSheetV2() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSheet = ss.getSheetByName(SHEET_NAMES.CHANNELS);
  if (!oldSheet) { ui.alert('No Channels sheet found: nothing to migrate.'); return; }
  if (!needsChannelsV2Migration_(oldSheet)) {
    ui.alert('Channels sheet is already on the new layout: nothing to migrate.');
    return;
  }

  const lastRow = oldSheet.getLastRow();
  const numDataRows = lastRow - 1;
  if (numDataRows < 1) {
    oldSheet.clear();
    oldSheet.appendRow(CHANNEL_HEADERS);
    formatHeaderRow_(oldSheet, CHANNEL_HEADERS.length);
    applyKoliDefaultFormat_(oldSheet, CHANNEL_HEADERS.length);
    (HIDDEN_COLS[SHEET_NAMES.CHANNELS] || []).forEach(function (col) { oldSheet.hideColumns(col); });
    ensureOutreachColumn_(oldSheet);
    ui.alert('Channels sheet had no data: rebuilt with the new layout.');
    return;
  }

  let backupName = 'Channels (pre-v2 backup)';
  let suffix = 2;
  while (ss.getSheetByName(backupName)) { backupName = 'Channels (pre-v2 backup ' + suffix + ')'; suffix++; }
  oldSheet.setName(backupName);

  const newSheet = ss.insertSheet(SHEET_NAMES.CHANNELS, ss.getSheetIndex(oldSheet));
  newSheet.appendRow(CHANNEL_HEADERS);
  formatHeaderRow_(newSheet, CHANNEL_HEADERS.length);
  applyKoliDefaultFormat_(newSheet, CHANNEL_HEADERS.length);

  const copyBlock = function (oldStartCol, width, newStartCol) {
    oldSheet.getRange(2, oldStartCol, numDataRows, width)
      .copyTo(newSheet.getRange(2, newStartCol, numDataRows, width));
  };
  copyBlock(1, 7, 1);   // Status..Subs (old Email is now Contact, same position, content unchanged)
  copyBlock(8, 1, 14);  // CPM -> new CPM position
  copyBlock(9, 5, 20);  // Updated, Outreach, Last Contact, Notes, Report -> new positions

  (HIDDEN_COLS[SHEET_NAMES.CHANNELS] || []).forEach(function (col) { newSheet.hideColumns(col); });
  ensureOutreachColumn_(newSheet);

  ui.alert(
    'Migration complete',
    numDataRows + ' channel(s) moved to the new layout. New columns (Avg Views, Post Times, Likes, ' +
    'Comments, Auth, Eng %, Location, Gender, Age, Grade, Rank) are blank until each channel is ' +
    're-analyzed: re-run Channel analysis on rows you want backfilled. Your original data is untouched ' +
    'in the "' + backupName + '" tab.',
    ui.ButtonSet.OK
  );
}

/**
 * writeChannelRow used to set this cell's value to a plain "3.9%"-style
 * STRING, but Google Sheets silently reinterprets any string shaped like
 * a percentage: it auto-converts to the underlying fraction (0.039) and
 * applies its OWN native percentage number format (e.g. "0.00%") so the
 * cell still DISPLAYS "3.90%". getValues() always returns that raw
 * stored fraction, never the formatted display text -- every reader of
 * this column was showing the unformatted 0.039 as a result (confirmed
 * directly: the Sidebar card showed "0.039" against the sheet cell's own
 * "3.90%" for the same row). writeChannelRow now writes a raw number plus
 * an explicit literal-suffix format (0.0"%") instead, the same pattern
 * writeVideoRow already used correctly -- but existing rows written
 * before this fix are still sitting there as auto-converted fractions.
 *
 * Rather than guess which shape a given row is by the number's magnitude
 * (a real channel really can have sub-1% engagement, so "value < 1 means
 * it's a fraction" isn't safe), this checks the cell's ACTUAL number
 * format: Sheets' own native percent formats always contain an
 * un-quoted "%" (e.g. "0.00%"); the literal-suffix format this code
 * writes now quotes it ("0.0\"%\""). That distinction is unambiguous,
 * not a heuristic.
 */
function formatEngagementPct_(value, numberFormat) {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value !== 'number') return String(value); // some older row stored before percentages were used here at all
  const isNativeSheetsPercent = /(?:^|[^"])%/.test(numberFormat || '') && (numberFormat || '').indexOf('"%"') === -1;
  return (isNativeSheetsPercent ? value * 100 : value).toFixed(1) + '%';
}

/** Reads one Channels row by sheet row number into a plain object, for exports. */
function getChannelRowData_(sheet, row) {
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const formats = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getNumberFormats()[0];
  const get = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? undefined : values[idx]; };
  const engagementCol = actualHeaders.indexOf('Engagement %');
  return {
    channelId: get('ID'), name: get('Channel'), niche: get('Niche'),
    postsPerMonth: get('Posts/Mo'), email: get('Contact'), subs: get('Subs'),
    avgViews: get('Avg Views'), grade: get('Grade'),
    engagementPct: formatEngagementPct_(get('Engagement %'), engagementCol === -1 ? '' : formats[engagementCol]),
    suggestedRate: get('Suggested Rate'),
    outreach: get('Outreach'), lastContact: get('Last Contact'), notes: get('Notes')
  };
}

/**
 * Best-effort Grade lookup by channel display NAME, not ID -- Videos rows
 * only ever stored the channel's display name (see writeVideoRow), never
 * its ID, so this is a real, accepted limitation: two channels sharing the
 * exact same name would collide. Used only to decorate the sidebar's
 * generic-preview badge for Videos; returns null (never throws) on any
 * miss so the caller can fall back to a plain badge instead of an error.
 */
function findChannelGradeByName_(channelName) {
  if (!channelName) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nameCol = headers.indexOf('Channel');
  const gradeCol = headers.indexOf('Grade');
  if (nameCol === -1 || gradeCol === -1) return null;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const match = data.find(function (r) { return r[nameCol] === channelName; });
  return (match && match[gradeCol]) ? match[gradeCol] : null;
}

/** Finds the sheet row for a given active cell/range, if it's on the Channels sheet. */
function getActiveChannelRow_() {
  const range = SpreadsheetApp.getActiveRange();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!range || sheet.getName() !== SHEET_NAMES.CHANNELS) return null;
  const row = range.getRow();
  if (row < 2) return null;
  return row;
}

/**
 * Multi-row variant of getActiveChannelRow_: every distinct data row
 * (row >= 2) touched by the current selection on the Channels sheet, in
 * sheet order. Selecting several rows (e.g. for a multi-creator Brand Fit
 * Score comparison) works the same way selecting one row always has;
 * a single-cell selection just returns that one row, same as before.
 */
function getActiveChannelRows_() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.CHANNELS) return [];
  const ranges = getActiveRangesSafe_();
  const rows = new Set();
  ranges.forEach(function (range) {
    if (!range) return;
    const startRow = range.getRow();
    for (let r = startRow; r < startRow + range.getNumRows(); r++) {
      if (r >= 2) rows.add(r);
    }
  });
  return [...rows].sort(function (a, b) { return a - b; });
}

/**
 * Reorders a sheet's actual columns to match orderedNames, and hides
 * (never deletes) any existing column not in that list: reversible,
 * since a browser-extension click shouldn't be able to permanently
 * destroy real data. Columns not present at all are silently skipped
 * rather than erroring, so a slightly-out-of-date requested layout
 * doesn't block the ones that do still apply. Shared by the "Send to
 * Koli" extension's Channels and Videos column editors: same operation,
 * different target sheet and header set (they're not interchangeable:
 * Videos' real headers are Status/Video/ID/Channel/Views/Likes/Comments/
 * Auth/Eng %/Posted/Day/New Subs/Location/Age/Gender/Updated, distinct
 * from Channels' own set).
 */
function applyColumnLayout_(sheetName, orderedNames) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('No ' + sheetName + ' sheet exists yet: analyze one first, then try again.');

  // Create any requested column that doesn't exist yet: appended at the
  // end for now; the reorder pass right after puts it wherever it
  // actually belongs. New columns are blank going forward (nothing
  // retroactively fills historical rows) since Koli has no data source
  // for a column it didn't define.
  orderedNames.forEach(function (name) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf(name) !== -1) return;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, sheet.getLastColumn()).setValue(name);
  });

  // Move each requested column into position, left to right. Every move
  // shifts other columns, so headers are re-read after each one rather
  // than computed once up front.
  orderedNames.forEach(function (name, targetIndex) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const currentIndex = headers.indexOf(name);
    if (currentIndex === -1) return; // shouldn't happen after the create pass above, but never crash on it
    const currentCol = currentIndex + 1;
    const destinationCol = targetIndex + 1;
    if (currentCol === destinationCol) return;
    sheet.moveColumns(sheet.getRange(1, currentCol, sheet.getMaxRows(), 1), destinationCol);
  });

  // Hide anything not requested, unhide anything that is: re-read once
  // more since the moves above changed positions.
  const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  finalHeaders.forEach(function (name, i) {
    const col = i + 1;
    if (orderedNames.indexOf(name) === -1) sheet.hideColumns(col);
    else sheet.showColumns(col);
  });

  return { ok: true };
}

function writeReportLink_(row, url) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.CHANNELS, CHANNEL_HEADERS);
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = actualHeaders.indexOf('Report') + 1;
  if (!col) return; // Report column doesn't exist in this layout
  sheet.getRange(row, col).setFormula(hyperlinkFormula_(url, 'View PDF'));
}

// ---------- Videos ----------

function writeVideoRow(video) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.VIDEOS, VIDEO_HEADERS);
  const existingRow = findRowByKey_(sheet, 3, video.videoId);
  const row = existingRow === -1 ? sheet.getLastRow() + 1 : existingRow;

  const published = new Date(video.publishedAt);
  const engagementRatio = video.views > 0 ? Math.round(((video.likes + video.commentCount) / video.views) * 1000) / 10 : 0;
  const authDisplay = (video.authenticity.score === null || video.authenticity.score === undefined)
    ? 'n/a' : video.authenticity.score + '/10';

  const values = [
    '', '', video.videoId, sanitizeCellText_(video.channelTitle), video.views, video.likes, video.commentCount,
    authDisplay, engagementRatio,
    Utilities.formatDate(published, getTimezone_(), 'yyyy-MM-dd HH:mm zzz'),
    Utilities.formatDate(published, getTimezone_(), 'EEEE'),
    video.newSubscribers, sanitizeCellText_(video.audience.location),
    sanitizeCellText_(video.audience.age), sanitizeCellText_(video.audience.gender), new Date()
  ];
  // Real bug, same root cause as the Engagement % one fixed earlier this
  // project's life: authDisplay is a plain string like "9/10", and Sheets
  // silently reinterprets ANY "N/10" shaped string as a date (month/day)
  // the instant it's written -- "9/10" becomes September 10 -- unless the
  // cell is ALREADY formatted as plain text before the value lands. Setting
  // the format on setValues's own target range AFTER the write is too late:
  // by then the value has already been coerced into a date serial, and
  // reformatting only changes how that wrong value displays. This format
  // call must run on column 8 BEFORE the row-wide setValues below.
  sheet.getRange(row, 8).setNumberFormat('@');
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
  formatStatusCell_(sheet.getRange(row, 1), STATUS.DONE);
  sheet.getRange(row, 2).setFormula(hyperlinkFormula_(videoUrl_(video.videoId), video.title));

  sheet.getRange(row, 9).setNumberFormat('0.0"%"');
  sheet.getRange(row, 16).setNumberFormat('yyyy-mm-dd hh:mm');

  sheet.getRange(row, 8).setNote('Comment authenticity justification:\n' + (video.authenticity.justification || 'n/a'));
  sheet.getRange(row, 13).setNote('Estimate only: inferred from title, description, niche, and comment sample. Not YouTube Studio data.');
  if (video.channelAboutSummary) {
    sheet.getRange(row, 4).setNote('About ' + video.channelTitle + ':\n' + video.channelAboutSummary);
  }
  if (video.description) {
    const links = extractAllUrls_(video.description);
    sheet.getRange(row, 5).setNote(
      'Description:\n' + video.description + '\n\n' +
      'Links found:\n' + (links.length ? links.join('\n') : 'None found in the description.')
    );
  }

  return row;
}

/**
 * Recovers the original 1-10 authenticity score from a cell Sheets already
 * mangled into a date -- "N/10" is a valid month/day (or day/month) pair
 * for every N from 1-10, so this bug was 100% reproducible, not an edge
 * case, and it happened regardless of the spreadsheet's date-order locale.
 * Whichever of month/day equals exactly 10 is the literal "/10" suffix;
 * the OTHER component is the real score, which recovers it correctly
 * whether Sheets parsed "9/10" as Sep-10 (month/day locale) or Oct-9
 * (day/month locale). "10/10" is unambiguous either way. Returns null
 * (never guesses) for a date that doesn't fit that exact shape.
 *
 * Real bug fixed here: this used to read `d.getMonth()`/`d.getDate()`
 * directly, which resolve in the Apps Script RUNTIME's own default
 * timezone -- not necessarily the same zone the spreadsheet itself used
 * when it originally mis-parsed "9/10" into a date. A one-hour offset near
 * midnight shifts the calendar day, so neither component lands on exactly
 * 10 anymore and this silently returned null (the symptom: the field just
 * vanished from the sidebar instead of showing a wrong value). Reading the
 * components through the SPREADSHEET's own timezone -- the zone that
 * actually did the original mis-parsing -- removes that mismatch instead
 * of guessing which runtime default might happen to agree with it.
 */
function recoverAuthScoreFromDate_(d) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const month = Number(Utilities.formatDate(d, tz, 'M'));
  const day = Number(Utilities.formatDate(d, tz, 'd'));
  if (month === 10 && day === 10) return 10;
  if (day === 10 && month !== 10) return month;
  if (month === 10 && day !== 10) return day;
  return null;
}

/**
 * One-time repair for rows written before writeVideoRow_/writeProfileRow's
 * Auth column got an explicit plain-text format: Sheets had already
 * auto-parsed every "N/10" string into a real date by the time those rows
 * were written (see recoverAuthScoreFromDate_'s doc comment -- guaranteed,
 * not occasional), so the go-forward fix alone doesn't touch what's
 * already sitting in the sheet. Menu-triggered, not automatic: this
 * rewrites cells, worth a confirmation rather than running silently.
 */
function repairAuthColumnDates() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targets = [
    { sheet: ss.getSheetByName(SHEET_NAMES.VIDEOS), col: 8, name: 'Videos' },
    { sheet: ss.getSheetByName(SHEET_NAMES.PROFILE), col: 10, name: 'Profile' }
  ];

  let fixed = 0, skipped = 0;
  targets.forEach(function (t) {
    if (!t.sheet || t.sheet.getLastRow() < 2) return;
    const range = t.sheet.getRange(2, t.col, t.sheet.getLastRow() - 1, 1);
    const values = range.getValues();
    values.forEach(function (r, i) {
      const v = r[0];
      if (!(v instanceof Date)) return;
      const score = recoverAuthScoreFromDate_(v);
      const cell = t.sheet.getRange(2 + i, t.col);
      if (score === null) { skipped++; return; }
      cell.setNumberFormat('@'); // must precede setValue, same ordering reason as the write-path fix
      cell.setValue(score + '/10');
      fixed++;
    });
  });

  ui.alert(
    'Auth column repair',
    fixed + ' cell(s) fixed across Videos/Profile.' +
    (skipped ? ' ' + skipped + ' skipped (didn\'t fit the expected "N/10" date shape -- check manually).' : ''),
    ui.ButtonSet.OK
  );
}

/** Every http(s) URL in a block of free text, deduped, in first-seen order. Generalizes contactService.gs's social-domain matching (extractSocials_) to "any link at all" -- a video description can point anywhere (merch, a landing page, an unrelated channel), not just a known social platform. */
function extractAllUrls_(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s)]+/g) || [];
  const seen = {};
  const result = [];
  matches.forEach(function (url) {
    if (!seen[url]) { seen[url] = true; result.push(url); }
  });
  return result;
}

function writeVideoError_(videoInput, errorMessage) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.VIDEOS, VIDEO_HEADERS);
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 3).setValues([['', videoInput, errorMessage]]);
  formatStatusCell_(sheet.getRange(row, 1), STATUS.ERROR);
}

function formatCount_(n) {
  if (n >= 1000000) return (Math.round(n / 100000) / 10) + 'M';
  if (n >= 1000) return (Math.round(n / 100) / 10) + 'K';
  return String(n);
}

/** Cached per channel: see deriveAboutSummary_() in geminiService.gs. */
function getChannelAboutSummaryCached_(channelId, description, recentVideos) {
  const cacheK = cacheKey_('aboutSummary', channelId);
  return withCache_(cacheK, function () {
    return deriveAboutSummary_(description, (recentVideos || []).map(function (v) { return v.title; }));
  }, DEFAULTS.CACHE_TTL_SECONDS);
}

// ---------- Subscriber snapshots ("New Subscribers") ----------

/**
 * avgViews/avgLikes/avgComments are optional: callers that only have a
 * subscriber count (e.g. a Profile pull) still log a real data point,
 * just with those three cells blank rather than blocking the snapshot
 * entirely on data this particular caller doesn't have.
 */
function recordSubscriberSnapshot_(channelId, currentSubCount, avgViews, avgLikes, avgComments) {
  if (currentSubCount === null) return;
  const sheet = getOrCreateSheet_(SHEET_NAMES.SNAPSHOTS, SNAPSHOT_HEADERS);
  ensureExtraColumns_(sheet, ['Avg Views', 'Avg Likes', 'Avg Comments']);
  sheet.appendRow([
    channelId, new Date(), currentSubCount,
    typeof avgViews === 'number' ? avgViews : '',
    typeof avgLikes === 'number' ? avgLikes : '',
    typeof avgComments === 'number' ? avgComments : ''
  ]);
}

/**
 * Chronological history for the selected-channel performance chart:
 * whatever real snapshot rows exist for this channel, oldest first.
 * Sparse by design -- Koli has no scheduled polling, so a point only
 * exists for each time this channel was actually analyzed or refreshed.
 */
function getChannelSnapshotHistory_(channelId) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.SNAPSHOTS, SNAPSHOT_HEADERS);
  const data = sheet.getDataRange().getValues().slice(1);
  return data
    .filter(function (r) { return r[0] === channelId; })
    .map(function (r) {
      return {
        date: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
        subs: typeof r[2] === 'number' ? r[2] : null,
        avgViews: typeof r[3] === 'number' ? r[3] : null,
        avgLikes: typeof r[4] === 'number' ? r[4] : null,
        avgComments: typeof r[5] === 'number' ? r[5] : null
      };
    })
    .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
}

function getNewSubscribersSince_(channelId, currentSubCount) {
  if (currentSubCount === null) return 'Hidden by channel';
  const sheet = getOrCreateSheet_(SHEET_NAMES.SNAPSHOTS, SNAPSHOT_HEADERS);
  const data = sheet.getDataRange().getValues().slice(1);
  const priorRows = data.filter(function (r) { return r[0] === channelId; })
    .sort(function (a, b) { return new Date(b[1]) - new Date(a[1]); });
  if (priorRows.length < 2) return 'Baseline set (check again next run)';
  const previous = priorRows[1][2];
  const diff = currentSubCount - previous;
  return (diff >= 0 ? '+' : '') + diff + ' since last run';
}

// ---------- Dashboard ----------

function ensureDashboardSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (sheet) return sheet;

  getOrCreateSheet_(SHEET_NAMES.CHANNELS, CHANNEL_HEADERS);
  getOrCreateSheet_(SHEET_NAMES.VIDEOS, VIDEO_HEADERS);

  sheet = ss.insertSheet(SHEET_NAMES.DASHBOARD);
  sheet.getRange('A1').setValue('Koli Dashboard').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A3').setValue('Channels tracked');
  sheet.getRange('A4').setValue('Videos tracked');
  sheet.getRange('A5').setValue('Avg engagement ratio');
  sheet.getRange('A6').setValue('Avg comment authenticity');
  sheet.getRange('B3').setFormula('=COUNTA(' + SHEET_NAMES.CHANNELS + '!C2:C)-COUNTIF(' + SHEET_NAMES.CHANNELS + '!C2:C,"")');
  sheet.getRange('B4').setFormula('=COUNTA(' + SHEET_NAMES.VIDEOS + '!C2:C)-COUNTIF(' + SHEET_NAMES.VIDEOS + '!C2:C,"")');
  sheet.getRange('B5').setFormula('=IFERROR(AVERAGE(' + SHEET_NAMES.VIDEOS + '!I2:I),"n/a")');
  sheet.getRange('A3:A6').setFontWeight('bold');
  sheet.setColumnWidth(1, 200);
  refreshAuthenticityAverage_(sheet);
  return sheet;
}

/**
 * Auth column stores text like "7/10" (or "n/a"), not a plain number, so a
 * spreadsheet AVERAGE() formula can't read it directly: computed here in
 * script instead and written as a static value. Called on every Dashboard
 * open (see showDashboard() in uiHandlers.gs) rather than kept "live":
 * simpler and more robust for a non-dev-maintained sheet than a fragile
 * nested regex formula.
 */
function refreshAuthenticityAverage_(dashboardSheet) {
  const videosSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.VIDEOS);
  if (!videosSheet || videosSheet.getLastRow() < 2) {
    dashboardSheet.getRange('B6').setValue('n/a');
    return;
  }
  const values = videosSheet.getRange(2, 8, videosSheet.getLastRow() - 1, 1).getValues();
  const scores = values.map(function (r) {
    const m = String(r[0]).match(/^(\d+(\.\d+)?)\/10$/);
    return m ? Number(m[1]) : null;
  }).filter(function (v) { return v !== null; });
  dashboardSheet.getRange('B6').setValue(scores.length ? Math.round((scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) * 10) / 10 : 'n/a');
}

// ---------- Profile ----------

/**
 * keyCol=3 (Video ID). Mode 'replace' clears this channel's existing rows
 * first: call clearProfileRowsForChannel_ once before the write loop, not
 * per row.
 */
function writeProfileRow(entry) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.PROFILE, PROFILE_HEADERS);
  const existingRow = findRowByKey_(sheet, 3, entry.videoId);
  const row = existingRow === -1 ? sheet.getLastRow() + 1 : existingRow;
  const published = new Date(entry.publishedAt);
  const authDisplay = (entry.authenticity.score === null || entry.authenticity.score === undefined)
    ? 'n/a' : entry.authenticity.score + '/10';

  const values = [
    '', '', entry.videoId, entry.channelId, '',
    Utilities.formatDate(published, getTimezone_(), 'yyyy-MM-dd'),
    entry.views, entry.likes, entry.commentCount, authDisplay, entry.engagementRatio, entry.cpm,
    sanitizeCellText_(entry.sponsorBrand || ''), entry.sponsorMentionTs || '',
    sanitizeCellText_(entry.audience.location), sanitizeCellText_(entry.audience.age),
    sanitizeCellText_(entry.audience.gender), entry.subDelta, new Date()
  ];
  // Same "N/10" -> auto-parsed-as-a-date bug as writeVideoRow, same fix:
  // format column 10 (Auth) as plain text BEFORE the value lands, not after.
  sheet.getRange(row, 10).setNumberFormat('@');
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
  formatStatusCell_(sheet.getRange(row, 1), STATUS.DONE);
  sheet.getRange(row, 2).setFormula(hyperlinkFormula_(channelUrl_(entry.channelId), entry.channelName));
  sheet.getRange(row, 5).setFormula(hyperlinkFormula_(videoUrl_(entry.videoId), entry.videoTitle));

  if (entry.channelAboutSummary) {
    sheet.getRange(row, 2).setNote('About ' + entry.channelName + ':\n' + entry.channelAboutSummary);
  }
  sheet.getRange(row, 11).setNumberFormat('0.0"%"');
  sheet.getRange(row, 19).setNumberFormat('yyyy-mm-dd hh:mm');
  return row;
}

function clearProfileRowsForChannel_(channelId) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.PROFILE, PROFILE_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 4, lastRow - 1, 1).getValues(); // col 4 = Channel ID
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === channelId) sheet.deleteRow(i + 2);
  }
}

// ---------- Tracked profiles (control sheet for "Refresh Tracked Profiles") ----------

function setChannelTracked_(channelId, channelName, startDate) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.TRACKED_PROFILES, TRACKED_PROFILE_HEADERS);
  const row = findRowByKey_(sheet, 1, channelId);
  if (row === -1) {
    sheet.appendRow([channelId, channelName, true, startDate, new Date()]);
  } else {
    sheet.getRange(row, 3).setValue(true);
  }
}

function getTrackedProfiles_() {
  const sheet = getOrCreateSheet_(SHEET_NAMES.TRACKED_PROFILES, TRACKED_PROFILE_HEADERS);
  const data = sheet.getDataRange().getValues().slice(1);
  return data.filter(function (r) { return r[2] === true; })
    .map(function (r) { return { channelId: r[0], channelName: r[1], startDate: r[3], lastRun: r[4] }; });
}

function updateTrackedLastRun_(channelId, date) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.TRACKED_PROFILES, TRACKED_PROFILE_HEADERS);
  const row = findRowByKey_(sheet, 1, channelId);
  if (row !== -1) sheet.getRange(row, 5).setValue(date);
}

// ---------- Discover ----------

function writeDiscoverResults(results, foundVia) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.DISCOVER, DISCOVER_HEADERS);
  results.forEach(function (r) {
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, 8).setValues([[
      r.type, '', sanitizeCellText_(r.channel), r.subsOrViews, r.postsPerMonth, r.engagement,
      Math.round(r.score * 100) + '%', foundVia
    ]]);
    sheet.getRange(row, 2).setFormula(hyperlinkFormula_(r.url, r.name));
  });
}
