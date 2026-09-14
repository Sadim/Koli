/**
 * campaignService.gs
 * "Manage": tracking a deal from signed through complete. Stage is a
 * dropdown column (same pattern already proven on Outreach), plus a real
 * drag-and-drop Kanban board (showCampaignsKanban, below) at parity with
 * the Outreach board in kanbanService.gs.
 */

function showCreateCampaignDialog() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Campaigns'); return; }
  const row = getActiveChannelRow_();
  if (!row) {
    SpreadsheetApp.getUi().alert('Select a row on the Channels sheet first, then run this again.');
    return;
  }
  const t = HtmlService.createTemplateFromFile('CreateCampaignDialog');
  t.row = row;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(420).setHeight(440), 'New Campaign');
}

/** `opportunityId` is optional (CRM data model, 2026-09-14): blank for a Campaign created directly, as every Campaign has always been created -- set only when this call came from convertOpportunityToCampaign_ (opportunityService.gs). Either way, a fresh Campaign Tasks checklist gets seeded (seedCampaignTasks_). */
function createCampaign(row, brand, deliverables, value, deadline, notes, opportunityId) {
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const rowData = getChannelRowData_(channelsSheet, row);
  if (!rowData.channelId) throw new Error('This row has no Channel ID: analyze it with Channel Analysis first.');
  if (!brand) throw new Error('Brand/sponsor name is required.');

  const sheet = getOrCreateSheet_(SHEET_NAMES.CAMPAIGNS, CAMPAIGN_HEADERS);
  ensureCampaignColumns_(sheet);

  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = function (name) { const idx = actualHeaders.indexOf(name); return idx === -1 ? null : idx + 1; };
  const newRow = sheet.getLastRow() + 1;
  const campaignId = Utilities.getUuid();

  const fieldValues = {
    'Channel ID': rowData.channelId, 'Brand': sanitizeCellText_(brand), 'Stage': 'Briefed',
    'Deliverables': sanitizeCellText_(deliverables || ''), 'Value': value || '', 'Deadline': deadline || '',
    'Notes': sanitizeCellText_(notes || ''), 'Created': new Date(), 'Updated': new Date(),
    'Campaign ID': campaignId, 'Opportunity ID': opportunityId || ''
  };
  Object.keys(fieldValues).forEach(function (name) {
    const col = colOf(name);
    if (col) sheet.getRange(newRow, col).setValue(fieldValues[name]);
  });
  if (colOf('Channel')) sheet.getRange(newRow, colOf('Channel')).setFormula(hyperlinkFormula_(channelUrl_(rowData.channelId), rowData.name));
  if (colOf('Deadline')) sheet.getRange(newRow, colOf('Deadline')).setNumberFormat('yyyy-mm-dd');
  if (colOf('Created')) sheet.getRange(newRow, colOf('Created')).setNumberFormat('yyyy-mm-dd hh:mm');
  if (colOf('Updated')) sheet.getRange(newRow, colOf('Updated')).setNumberFormat('yyyy-mm-dd hh:mm');

  seedCampaignTasks_(campaignId);

  return { ok: true, channelName: rowData.name, brand: brand, campaignId: campaignId };
}

// ---------- Campaign Tasks (CRM data model, 2026-09-14) -- the per-brand
// checklist, keyed on Campaign ID; see DEFAULT_CAMPAIGN_CHECKLIST/
// CAMPAIGN_TASK_HEADERS in constants.gs for the shape and reasoning. ----------

/** Seeds a fresh checklist for a new Campaign from DEFAULT_CAMPAIGN_CHECKLIST. Called once, from createCampaign -- not idempotent by design (re-running it would duplicate the list), same as Snapshots' appendRow-only convention. */
function seedCampaignTasks_(campaignId) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.CAMPAIGN_TASKS, CAMPAIGN_TASK_HEADERS);
  DEFAULT_CAMPAIGN_CHECKLIST.forEach(function (label, i) {
    sheet.appendRow([Utilities.getUuid(), campaignId, label, i + 1, false, '', '']);
  });
}

function getCampaignTasks_(campaignId) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.CAMPAIGN_TASKS, CAMPAIGN_TASK_HEADERS);
  const data = sheet.getDataRange().getValues().slice(1);
  return data
    .filter(function (r) { return r[1] === campaignId; })
    .map(function (r) {
      return {
        taskId: r[0], campaignId: r[1], label: r[2], order: r[3], done: !!r[4],
        doneDate: r[5] instanceof Date ? Utilities.formatDate(r[5], getTimezone_(), 'yyyy-MM-dd') : r[5], notes: r[6]
      };
    })
    .sort(function (a, b) { return a.order - b.order; });
}

function toggleCampaignTask(taskId, done) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAMPAIGN_TASKS);
  if (!sheet) return { ok: false, error: 'Campaign Tasks sheet not found.' };
  const row = findRowByKey_(sheet, 1, taskId); // Task ID is col 1
  if (row === -1) return { ok: false, error: 'Task not found.' };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const doneCol = headers.indexOf('Done') + 1, doneDateCol = headers.indexOf('Done Date') + 1;
  sheet.getRange(row, doneCol).setValue(!!done);
  if (doneDateCol) sheet.getRange(row, doneDateCol).setValue(done ? new Date() : '');
  return { ok: true };
}

/** Native dropdown for Stage, same UX as Outreach's: applied once per sheet, not per row. */
function ensureCampaignStageColumn_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const stageCol = headers.indexOf('Stage') + 1;
  if (!stageCol) return;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(CAMPAIGN_STAGES, true).setAllowInvalid(false).build();
  sheet.getRange(2, stageCol, 1000, 1).setDataValidation(rule);
}

/**
 * Campaigns had no unique per-row key at all before this -- Channel ID
 * alone repeats across multiple deals with the same channel, so keying a
 * Kanban drag/click target on it (or on array position) breaks the moment a
 * row above is deleted. Backfills a stable UUID into any row missing one,
 * same "only touch blanks" shape as ensureOutreachColumn_'s status backfill.
 */
function ensureCampaignIdColumn_(sheet) {
  ensureExtraColumns_(sheet, ['Campaign ID', 'Documents', 'Opportunity ID']);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf('Campaign ID') + 1;
  if (!idCol) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  ids.forEach(function (r, i) { if (!r[0]) sheet.getRange(2 + i, idCol).setValue(Utilities.getUuid()); });
}

/** Runs both one-time/per-call migrations together: every Campaigns entry point calls this once instead of remembering both separately. */
function ensureCampaignColumns_(sheet) {
  ensureCampaignStageColumn_(sheet);
  ensureCampaignIdColumn_(sheet);
}

/** Menu entry point for a selected Campaigns row: the same expanded record the Kanban's card click opens, reachable without the board -- rounds out parity with how a Channel's record is reachable from both the Sidebar and Outreach Kanban. */
function showCampaignRecordDialogForSelection() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.CAMPAIGNS) {
    ui.alert('Select a row on the Campaigns sheet first, then run this again.');
    return;
  }
  const range = SpreadsheetApp.getActiveRange();
  if (!range || range.getRow() < 2) {
    ui.alert('Select a single data row on Campaigns first, then run this again.');
    return;
  }
  ensureCampaignColumns_(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf('Campaign ID');
  const campaignId = idCol === -1 ? '' : sheet.getRange(range.getRow(), idCol + 1).getValue();
  if (!campaignId) { ui.alert('This row has no Campaign ID (unexpected -- try again, or open it from the Campaigns Kanban instead).'); return; }
  showCampaignRecordDialog(campaignId);
}

function showCampaigns() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Campaigns'); return; }
  const sheet = getOrCreateSheet_(SHEET_NAMES.CAMPAIGNS, CAMPAIGN_HEADERS);
  ensureCampaignColumns_(sheet);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}

// ---------- Campaigns Kanban: full parity with Outreach's board (kanbanService.gs) ----------

function showCampaignsKanban() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Campaigns Kanban'); return; }
  // Evaluated as a template (see showOutreachKanban's comment in
  // kanbanService.gs) so <?!= include_('RecordModal'); ?> actually runs.
  const html = HtmlService.createTemplateFromFile('CampaignsKanban').evaluate().setWidth(1180).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Campaigns Pipeline');
}

function getCampaignsKanbanData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAMPAIGNS);
  if (!sheet || sheet.getLastRow() < 2) return { statuses: CAMPAIGN_STAGES, cards: [] };
  ensureCampaignColumns_(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = function (name) { return headers.indexOf(name); };
  const idCol = col('Campaign ID'), brandCol = col('Brand'), channelCol = col('Channel'),
    stageCol = col('Stage'), valueCol = col('Value'), deadlineCol = col('Deadline');
  if (idCol === -1 || stageCol === -1) return { statuses: CAMPAIGN_STAGES, cards: [] };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const formulas = channelCol === -1 ? null : sheet.getRange(2, channelCol + 1, sheet.getLastRow() - 1, 1).getFormulas();
  const cards = data
    .map(function (row, i) {
      const deadline = deadlineCol === -1 ? '' : row[deadlineCol];
      const linked = formulas ? parseHyperlinkFormula_(formulas[i][0]) : null;
      return {
        id: row[idCol],
        brand: row[brandCol],
        channel: linked ? linked.label : (channelCol === -1 ? '' : row[channelCol]),
        value: valueCol === -1 ? '' : row[valueCol],
        deadline: deadline instanceof Date ? Utilities.formatDate(deadline, getTimezone_(), 'yyyy-MM-dd') : deadline,
        status: row[stageCol]
      };
    })
    .filter(function (c) { return c.id; });

  return { statuses: CAMPAIGN_STAGES, cards: cards };
}

function updateCampaignStage(campaignId, newStage) {
  if (CAMPAIGN_STAGES.indexOf(newStage) === -1) return { ok: false, error: 'Not a valid stage.' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CAMPAIGNS);
  if (!sheet) return { ok: false, error: 'Campaigns sheet not found.' };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf('Campaign ID') + 1, stageCol = headers.indexOf('Stage') + 1, updatedCol = headers.indexOf('Updated') + 1;
  if (!idCol || !stageCol) return { ok: false, error: 'This Campaigns sheet has no Campaign ID/Stage column.' };
  const row = findRowByKey_(sheet, idCol, campaignId);
  if (row === -1) return { ok: false, error: 'Campaign not found (was the row deleted since the board loaded?).' };
  sheet.getRange(row, stageCol).setValue(newStage);
  if (updatedCol) sheet.getRange(row, updatedCol).setValue(new Date());
  return { ok: true };
}
