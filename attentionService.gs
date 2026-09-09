/**
 * attentionService.gs
 * "Attention": the thing to open before Channels/Videos/Sponsors, not
 * another data table to skim. Answers "what actually needs me today"
 * instead of requiring you to remember to go check three different
 * sheets and a stale-looking dropdown column.
 *
 * Three sections, each a pure lookup over data Koli already has: no new
 * API calls, no new Gemini cost, same "pure synthesis" rule Gap Analysis
 * already follows:
 * 1. Stale Outreach follow-ups: Contacted/Negotiating rows whose Last
 *    Contact hasn't moved in a while (or was never set). The Outreach
 *    column is otherwise write-only: you set it once and nothing ever
 *    looks back at it.
 * 2. Recent sponsor activity: Sponsors rows whose Last Seen landed
 *    since your own configurable window, so a real change surfaces
 *    instead of sitting quietly in a rollup nobody reopens.
 * 3. High-grade, unclaimed channels: Grade A/B channels with zero
 *    recorded sponsor history yet. A cheap proxy for "promising and
 *    worth pursuing," not a full Gap Analysis run against every channel.
 *
 * Rebuilt fresh every time you open it (not a live formula): "stale"
 * and "recent" are relative to right now, which a formula can't express
 * as cleanly as a script-computed snapshot.
 */

const ATTENTION_STALE_OUTREACH_DAYS = 14;
const ATTENTION_RECENT_SPONSOR_DAYS = 7;
const ATTENTION_ACTIVE_OUTREACH_STATUSES = ['Contacted', 'Negotiating'];

function showAttentionView() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const channelsSheet = ss.getSheetByName(SHEET_NAMES.CHANNELS);
  if (!channelsSheet || channelsSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No Channels data yet: analyze some channels first, then check back here.');
    return;
  }

  const headers = channelsSheet.getRange(1, 1, 1, channelsSheet.getLastColumn()).getValues()[0];
  const col = function (name) { return headers.indexOf(name); };
  const channelRows = channelsSheet.getRange(2, 1, channelsSheet.getLastRow() - 1, channelsSheet.getLastColumn()).getValues();

  let sheet = ss.getSheetByName(SHEET_NAMES.ATTENTION);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.ATTENTION);
  sheet.clear();

  let row = 1;
  row = writeAttentionSection_(
    sheet, row, 'Stale Outreach Follow-Ups (' + ATTENTION_STALE_OUTREACH_DAYS + '+ days)',
    'No one\'s marked "Contacted" or "Negotiating" this long without a follow-up.',
    ['Channel', 'Status', 'Last Contact'], findStaleOutreach_(channelRows, col)
  );
  row = writeAttentionSection_(
    sheet, row, 'Recent Sponsor Activity (last ' + ATTENTION_RECENT_SPONSOR_DAYS + ' days)',
    'No new sponsor detections in the last ' + ATTENTION_RECENT_SPONSOR_DAYS + ' days.',
    ['Channel', 'Brand', 'Last Seen'], findRecentSponsorActivity_()
  );
  writeAttentionSection_(
    sheet, row, 'High-Grade Channels, No Sponsor History Yet',
    'Every A/B-grade channel already has recorded sponsor activity.',
    ['Channel', 'Grade', ''], findUnclaimedHighGrade_(channelRows, col)
  );

  sheet.setColumnWidths(1, 1, 260);
  sheet.setColumnWidths(2, 2, 140);
  ss.setActiveSheet(sheet);
}

function writeAttentionSection_(sheet, startRow, title, emptyMessage, columnHeaders, items) {
  sheet.getRange(startRow, 1).setValue(title).setFontWeight('bold').setFontSize(13);
  startRow += 1;

  if (!items.length) {
    sheet.getRange(startRow, 1).setValue(emptyMessage).setFontColor('#5f6368').setFontStyle('italic');
    return startRow + 2;
  }

  sheet.getRange(startRow, 1, 1, 3).setValues([columnHeaders]).setFontWeight('bold').setBackground('#f1f3f4').setFontColor('#202124');
  startRow += 1;
  items.forEach(function (item) {
    sheet.getRange(startRow, 1).setFormula(hyperlinkFormula_(channelUrl_(item.channelId), item.channel));
    sheet.getRange(startRow, 2).setValue(item.col2);
    sheet.getRange(startRow, 3).setValue(item.col3);
    startRow += 1;
  });
  return startRow + 1; // blank spacer row between sections
}

function findStaleOutreach_(channelRows, col) {
  const cutoff = Date.now() - ATTENTION_STALE_OUTREACH_DAYS * 24 * 60 * 60 * 1000;
  return channelRows
    .filter(function (r) {
      if (ATTENTION_ACTIVE_OUTREACH_STATUSES.indexOf(r[col('Outreach')]) === -1) return false;
      const lastContact = r[col('Last Contact')];
      return !lastContact || new Date(lastContact).getTime() < cutoff;
    })
    .map(function (r) {
      const lastContact = r[col('Last Contact')];
      return {
        channel: r[col('Channel')], channelId: r[col('ID')],
        col2: r[col('Outreach')], col3: lastContact ? formatDateShort_(lastContact) : 'never set'
      };
    });
}

function findRecentSponsorActivity_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SPONSORS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const cutoff = Date.now() - ATTENTION_RECENT_SPONSOR_DAYS * 24 * 60 * 60 * 1000;
  const col = function (name) { return SPONSOR_HEADERS.indexOf(name); };
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, SPONSOR_HEADERS.length).getValues();
  return data
    .filter(function (r) { return r[col('Last Seen')] && new Date(r[col('Last Seen')]).getTime() >= cutoff; })
    .sort(function (a, b) { return new Date(b[col('Last Seen')]) - new Date(a[col('Last Seen')]); })
    .map(function (r) {
      return { channel: r[col('Channel')], channelId: r[col('Channel ID')], col2: r[col('Brand')], col3: formatDateShort_(r[col('Last Seen')]) };
    });
}

function findUnclaimedHighGrade_(channelRows, col) {
  const sponsorsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SPONSORS);
  const sponsoredIds = new Set();
  if (sponsorsSheet && sponsorsSheet.getLastRow() >= 2) {
    sponsorsSheet.getRange(2, 2, sponsorsSheet.getLastRow() - 1, 1).getValues().forEach(function (r) { sponsoredIds.add(r[0]); });
  }
  return channelRows
    .filter(function (r) {
      const grade = r[col('Grade')];
      return (grade === 'A' || grade === 'B') && !sponsoredIds.has(r[col('ID')]);
    })
    .map(function (r) {
      return { channel: r[col('Channel')], channelId: r[col('ID')], col2: r[col('Grade')], col3: '' };
    });
}
