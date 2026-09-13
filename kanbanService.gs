/**
 * kanbanService.gs
 * Koli's own Outreach pipeline board -- the non-Pro alternative to
 * Sheets Canvas's native Kanban mini-app (Insert > Create a canvas),
 * which is paywalled to Business Standard+/Enterprise/AI Pro-Ultra plans
 * and has no Apps Script hook to build against anyway. Same idea (drag a
 * card between status columns, it writes straight back to the real
 * sheet), built as a real HtmlService dialog instead of relying on a
 * plan tier some users don't have.
 */

function showOutreachKanban() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Outreach Kanban'); return; }
  const html = HtmlService.createHtmlOutputFromFile('OutreachKanban').setWidth(1180).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Outreach Pipeline');
}

function getKanbanData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  if (!sheet || sheet.getLastRow() < 2) return { statuses: OUTREACH_STATUSES, cards: [] };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = function (name) { return headers.indexOf(name); };
  const idCol = col('ID'), nameCol = col('Channel'), nicheCol = col('Niche'),
    gradeCol = col('Grade'), outreachCol = col('Outreach'), subsCol = col('Subs');
  if (idCol === -1 || outreachCol === -1) return { statuses: OUTREACH_STATUSES, cards: [] };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const cards = data
    .map(function (row, i) { return { row: i + 2, id: row[idCol], name: row[nameCol], niche: row[nicheCol], grade: row[gradeCol], subs: row[subsCol], status: row[outreachCol] }; })
    .filter(function (c) { return c.id; });

  return { statuses: OUTREACH_STATUSES, cards: cards };
}

function updateChannelOutreachStatus(channelId, newStatus) {
  if (OUTREACH_STATUSES.indexOf(newStatus) === -1) return { ok: false, error: 'Not a valid status.' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf('ID') + 1, outreachCol = headers.indexOf('Outreach') + 1;
  if (!idCol || !outreachCol) return { ok: false, error: 'This Channels sheet has no ID/Outreach column.' };
  const row = findRowByKey_(sheet, idCol, channelId);
  if (row === -1) return { ok: false, error: 'Channel not found (was the row deleted since the board loaded?).' };
  sheet.getRange(row, outreachCol).setValue(newStatus);
  return { ok: true };
}
