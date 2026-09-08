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

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    formatHeaderRow_(sheet, headers.length);
    if (name === SHEET_NAMES.SNAPSHOTS || name === SHEET_NAMES.TRACKED_PROFILES) sheet.hideSheet();
    (HIDDEN_COLS[name] || []).forEach(function (col) { sheet.hideColumns(col); });
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    formatHeaderRow_(sheet, headers.length);
  } else if (name === SHEET_NAMES.CHANNELS && needsChannelsV2Migration_(sheet)) {
    // The v2 layout reordered columns (not just appended new trailing
    // ones) — naive header-append would silently misalign every existing
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
 * appends whatever's missing at the end — never touches existing columns
 * or data — so upgrading Koli doesn't require rebuilding any sheet.
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
 * backfills "Not Contacted" only into currently-blank cells — never
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

/**
 * Status cells get a glyph + color instead of plain text — "☑ Done" in
 * green, "✗ Error: ..." in red, "○ New" in gray — same icon language
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
 * external source (video descriptions, comments, channel names — all
 * writable by anyone on the public internet) could contain a string
 * starting with =, +, -, or @, which Google Sheets treats as a live
 * formula on render regardless of how the cell was written. A leading
 * apostrophe forces it to render as literal text instead. Applied to
 * every cell that holds AI-derived or externally-sourced free text —
 * not to values Koli computed itself (CPM strings, dates, counts).
 */
function sanitizeCellText_(text) {
  const s = String(text === null || text === undefined ? '' : text);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/**
 * Manual email entry: type an address directly into the Email cell (col 6
 * on Channels) any time — including right over "Not found." Re-running
 * Channel analysis for that channel will NOT overwrite it. Only a cell
 * that's currently blank or still says "Not found" gets written with
 * whatever auto-detection just found. If auto-detection now finds a
 * different email than what's manually sitting there, it doesn't fight
 * you for the cell — it notes the discrepancy instead, so you can decide.
 */
function writeEmailPreservingManual_(sheet, row, currentEmail, autoFoundEmail, contactCol) {
  if (!contactCol) return; // Contact column doesn't exist in this layout — nothing to write
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
    throw new Error('Channels sheet needs a one-time migration to the new layout first — run Koli > Migrate Channels Sheet (v2) from the menu, then try again.');
  }
  if (sheet.getLastColumn() > CHANNEL_HEADERS.length && sheet.getRange(1, CHANNEL_HEADERS.length + 1).getValue()) {
    throw new Error('This Channels sheet still has extra columns from an older layout. Rename this tab (e.g. "Channels (old)") so Koli creates a fresh one, or manually delete the columns after ' + CHANNEL_HEADERS[CHANNEL_HEADERS.length - 1] + ' before continuing.');
  }

  // Every column below is looked up against the sheet's ACTUAL current
  // header row — never assumed to match CHANNEL_HEADERS' declared order.
  // Someone may have manually reordered columns in Sheets, or applied a
  // reordered layout from the extension — either way, a value must land
  // in the right column by name, not by position. If a column has been
  // removed entirely, colOf returns null and that field is silently
  // skipped rather than erroring or misplacing data into the wrong spot.
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = function (name) {
    const idx = actualHeaders.indexOf(name);
    return idx === -1 ? null : idx + 1;
  };

  const idCol = colOf('ID');
  if (!idCol) throw new Error('This Channels sheet has no "ID" column — Koli needs it to identify rows. Restore it or start a fresh Channels tab.');
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
    'Grade': grade.letter
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
  const c = grade.components;
  if (colOf('Grade')) {
    sheet.getRange(row, colOf('Grade')).setNote(
      'Composite score: ' + grade.score + '/100\n' +
      'Momentum ' + Math.round(c.momentum) + ' (25%) · Engagement quality ' + Math.round(c.engagementQuality) + ' (20%) · ' +
      'Commercial fit ' + Math.round(c.commercialFit) + ' (15%) · Reliability ' + Math.round(c.reliability) + ' (15%) · ' +
      'Risk ' + Math.round(c.risk) + ' (10%, higher = lower risk) · Audience fit ' + Math.round(c.audienceFit) + ' (10%) · ' +
      'Content fit ' + Math.round(c.contentFit) + ' (5%, placeholder — needs a target niche input, not built yet)\n' +
      'Not a standard external metric — Koli\'s own formula, tunable in constants.gs.'
    );
  }

  const socialsText = channel.contact.socials.length
    ? channel.contact.socials.map(function (s) { return s.platform + ': ' + s.url; }).join('\n')
    : 'None found';
  const aboutText = channel.aboutSummary ? channel.aboutSummary : '';
  if (colOf('Channel')) {
    sheet.getRange(row, colOf('Channel')).setNote(
      (aboutText ? 'About:\n' + aboutText + '\n\n' : '') + 'Other socials:\n' + socialsText
    );
  }

  recordSubscriberSnapshot_(channel.channelId, channel.subCount);
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
 * deleted — copyTo preserves formulas (hyperlinks survive) and notes.
 * New columns are left blank; they backfill the next time each channel
 * is re-analyzed, not automatically here (avoids a surprise API-quota
 * burn re-analyzing everything at once).
 */
function migrateChannelsSheetV2() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSheet = ss.getSheetByName(SHEET_NAMES.CHANNELS);
  if (!oldSheet) { ui.alert('No Channels sheet found — nothing to migrate.'); return; }
  if (!needsChannelsV2Migration_(oldSheet)) {
    ui.alert('Channels sheet is already on the new layout — nothing to migrate.');
    return;
  }

  const lastRow = oldSheet.getLastRow();
  const numDataRows = lastRow - 1;
  if (numDataRows < 1) {
    oldSheet.clear();
    oldSheet.appendRow(CHANNEL_HEADERS);
    formatHeaderRow_(oldSheet, CHANNEL_HEADERS.length);
    (HIDDEN_COLS[SHEET_NAMES.CHANNELS] || []).forEach(function (col) { oldSheet.hideColumns(col); });
    ensureOutreachColumn_(oldSheet);
    ui.alert('Channels sheet had no data — rebuilt with the new layout.');
    return;
  }

  let backupName = 'Channels (pre-v2 backup)';
  let suffix = 2;
  while (ss.getSheetByName(backupName)) { backupName = 'Channels (pre-v2 backup ' + suffix + ')'; suffix++; }
  oldSheet.setName(backupName);

  const newSheet = ss.insertSheet(SHEET_NAMES.CHANNELS, ss.getSheetIndex(oldSheet));
  newSheet.appendRow(CHANNEL_HEADERS);
  formatHeaderRow_(newSheet, CHANNEL_HEADERS.length);

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
    're-analyzed — re-run Channel analysis on rows you want backfilled. Your original data is untouched ' +
    'in the "' + backupName + '" tab.',
    ui.ButtonSet.OK
  );
}

/** Reads one Channels row by sheet row number into a plain object, for exports. */
function getChannelRowData_(sheet, row) {
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const get = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? undefined : values[idx]; };
  return {
    channelId: get('ID'), name: get('Channel'), niche: get('Niche'),
    postsPerMonth: get('Posts/Mo'), email: get('Contact'), subs: get('Subs'),
    grade: get('Grade'),
    outreach: get('Outreach'), lastContact: get('Last Contact'), notes: get('Notes')
  };
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
 * Reorders the Channels sheet's actual columns to match orderedNames,
 * and hides (never deletes) any existing column not in that list —
 * reversible, since a browser-extension click shouldn't be able to
 * permanently destroy real data. Columns not present at all are
 * silently skipped rather than erroring, so a slightly-out-of-date
 * requested layout doesn't block the ones that do still apply.
 */
function applyChannelColumnLayout_(orderedNames) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  if (!sheet) throw new Error('No Channels sheet exists yet — analyze a channel first, then try again.');

  // Create any requested column that doesn't exist yet — appended at the
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

  // Hide anything not requested, unhide anything that is — re-read once
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
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
  formatStatusCell_(sheet.getRange(row, 1), STATUS.DONE);
  sheet.getRange(row, 2).setFormula(hyperlinkFormula_(videoUrl_(video.videoId), video.title));

  sheet.getRange(row, 9).setNumberFormat('0.0"%"');
  sheet.getRange(row, 16).setNumberFormat('yyyy-mm-dd hh:mm');

  sheet.getRange(row, 8).setNote('Comment authenticity justification:\n' + (video.authenticity.justification || 'n/a'));
  sheet.getRange(row, 13).setNote('Estimate only — inferred from title, description, niche, and comment sample. Not YouTube Studio data.');
  if (video.channelAboutSummary) {
    sheet.getRange(row, 4).setNote('About ' + video.channelTitle + ':\n' + video.channelAboutSummary);
  }

  return row;
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

/** Cached per channel — see deriveAboutSummary_() in geminiService.gs. */
function getChannelAboutSummaryCached_(channelId, description, recentVideos) {
  const cacheK = cacheKey_('aboutSummary', channelId);
  return withCache_(cacheK, function () {
    return deriveAboutSummary_(description, (recentVideos || []).map(function (v) { return v.title; }));
  }, DEFAULTS.CACHE_TTL_SECONDS);
}

// ---------- Subscriber snapshots ("New Subscribers") ----------

function recordSubscriberSnapshot_(channelId, currentSubCount) {
  if (currentSubCount === null) return;
  const sheet = getOrCreateSheet_(SHEET_NAMES.SNAPSHOTS, SNAPSHOT_HEADERS);
  sheet.appendRow([channelId, new Date(), currentSubCount]);
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
 * spreadsheet AVERAGE() formula can't read it directly — computed here in
 * script instead and written as a static value. Called on every Dashboard
 * open (see showDashboard() in uiHandlers.gs) rather than kept "live" —
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
 * first — call clearProfileRowsForChannel_ once before the write loop, not
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
