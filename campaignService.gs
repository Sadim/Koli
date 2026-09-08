/**
 * campaignService.gs
 * "Manage" — tracking a deal from signed through complete. Stage is a
 * dropdown column (same pattern already proven on Outreach), not a
 * visual drag-and-drop board — Sheets has no native Kanban view. A real
 * board is a natural fit for the extension sidebar once that exists;
 * not attempted here.
 */

function showCreateCampaignDialog() {
  const row = getActiveChannelRow_();
  if (!row) {
    SpreadsheetApp.getUi().alert('Select a row on the Channels sheet first, then run this again.');
    return;
  }
  const t = HtmlService.createTemplateFromFile('CreateCampaignDialog');
  t.row = row;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(420).setHeight(440), 'New Campaign');
}

function createCampaign(row, brand, deliverables, value, deadline, notes) {
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const rowData = getChannelRowData_(channelsSheet, row);
  if (!rowData.channelId) throw new Error('This row has no Channel ID — analyze it with Channel Analysis first.');
  if (!brand) throw new Error('Brand/sponsor name is required.');

  const sheet = getOrCreateSheet_(SHEET_NAMES.CAMPAIGNS, CAMPAIGN_HEADERS);
  ensureCampaignStageColumn_(sheet);

  const newRow = sheet.getLastRow() + 1;
  const values = [
    '', rowData.channelId, sanitizeCellText_(brand), 'Briefed',
    sanitizeCellText_(deliverables || ''), value || '', deadline || '',
    sanitizeCellText_(notes || ''), new Date(), new Date()
  ];
  sheet.getRange(newRow, 1, 1, values.length).setValues([values]);
  sheet.getRange(newRow, 1).setFormula(hyperlinkFormula_(channelUrl_(rowData.channelId), rowData.name));
  sheet.getRange(newRow, 9).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(newRow, 10).setNumberFormat('yyyy-mm-dd hh:mm');

  return { ok: true, channelName: rowData.name, brand: brand };
}

/** Native dropdown for Stage, same UX as Outreach's — applied once per sheet, not per row. */
function ensureCampaignStageColumn_(sheet) {
  const stageCol = CAMPAIGN_HEADERS.indexOf('Stage') + 1;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(CAMPAIGN_STAGES, true).setAllowInvalid(false).build();
  sheet.getRange(2, stageCol, 1000, 1).setDataValidation(rule);
}

function showCampaigns() {
  const sheet = getOrCreateSheet_(SHEET_NAMES.CAMPAIGNS, CAMPAIGN_HEADERS);
  ensureCampaignStageColumn_(sheet);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}
