/**
 * opportunityService.gs
 * Opportunity: the brand-side deal pipeline the CRM data-model pass added
 * -- distinct from Channels' Outreach column (already a creator-side
 * pipeline) and Campaigns' Stage (already post-close execution). Fills the
 * one pipeline stage that had nothing before this: pitching a brand,
 * independent of any one creator, from first contact through won/lost.
 * Every stage change is logged to the Activity Log (activityLogService.gs)
 * as its own row rather than just overwriting Stage in place -- the same
 * "keep a real history, don't just mutate the current state" call
 * checkitout-backend's AppliedOpportunityStatusHistory makes for the same
 * reason (checked as a reference during scoping: same problem domain, MIT).
 */

function createOpportunity(brandName, primaryContactId, estValue, compensationType, source, notes) {
  if (!brandName) throw new Error('Brand is required.');
  if (compensationType && COMPENSATION_TYPES.indexOf(compensationType) === -1) {
    throw new Error('"' + compensationType + '" isn\'t a valid compensation type.');
  }
  const sheet = getOrCreateSheet_(SHEET_NAMES.OPPORTUNITIES, OPPORTUNITY_HEADERS);
  const brand = resolveBrandId_(brandName);
  const opportunityId = Utilities.getUuid();
  const now = new Date();
  const newRow = sheet.getLastRow() + 1;

  sheet.appendRow([
    opportunityId, brand.name, brand.id, 'New', primaryContactId || '',
    estValue || '', compensationType || '', sanitizeCellText_(source || ''),
    sanitizeCellText_(notes || ''), now, now
  ]);
  sheet.getRange(newRow, OPPORTUNITY_HEADERS.indexOf('Created') + 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(newRow, OPPORTUNITY_HEADERS.indexOf('Updated') + 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(newRow, OPPORTUNITY_HEADERS.indexOf('Est. Value') + 1).setNumberFormat('$#,##0.00');

  recordActivity_('Opportunity', opportunityId, 'Status Change', 'Opportunity created', 'Stage set to New.', '');
  return { ok: true, opportunityId: opportunityId, brand: brand.name };
}

function updateOpportunityStage(opportunityId, newStage) {
  if (OPPORTUNITY_STAGES.indexOf(newStage) === -1) return { ok: false, error: 'Not a valid stage.' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.OPPORTUNITIES);
  if (!sheet) return { ok: false, error: 'Opportunities sheet not found.' };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf('Opportunity ID') + 1, stageCol = headers.indexOf('Stage') + 1, updatedCol = headers.indexOf('Updated') + 1;
  if (!idCol || !stageCol) return { ok: false, error: 'This Opportunities sheet has no Opportunity ID/Stage column.' };
  const row = findRowByKey_(sheet, idCol, opportunityId);
  if (row === -1) return { ok: false, error: 'Opportunity not found (was the row deleted since it loaded?).' };

  const previousStage = sheet.getRange(row, stageCol).getValue();
  sheet.getRange(row, stageCol).setValue(newStage);
  if (updatedCol) sheet.getRange(row, updatedCol).setValue(new Date());
  recordActivity_('Opportunity', opportunityId, 'Status Change', previousStage + ' → ' + newStage, '', '');
  return { ok: true };
}

/**
 * Converts a Won Opportunity into a real Campaign -- the recommended path
 * (a brand-side deal should generally close through Won before execution
 * starts tracking), but not the ONLY path: createCampaign (campaignService.gs)
 * still works standalone with no Opportunity at all, since not every deal
 * gets formally pitched through the pipeline first (e.g. a brand that
 * clicks "I'm Interested" on a published page and is fast-tracked straight
 * to a signed deal). Throws rather than silently proceeding on a non-Won
 * stage -- the founder's explicit preference was "won opportunity is
 * better," not a hard requirement, so a later UI is expected to offer
 * converting a not-yet-won Opportunity anyway if asked (a prompt, not a
 * wall), but this helper itself only performs the recommended, validated
 * path; callers wanting the override should call createCampaign directly.
 */
function convertOpportunityToCampaign_(opportunityId, row, deliverables, deadline, notes) {
  const opp = getOpportunityRecord(opportunityId);
  const stageField = opp.fields.filter(function (f) { return f.header === 'Stage'; })[0];
  if (!stageField || stageField.value !== 'Won') {
    throw new Error('Only a Won opportunity can convert to a Campaign directly (found stage: ' + (stageField && stageField.value) + '). Create the Campaign manually if you want to proceed anyway.');
  }
  const brandField = opp.fields.filter(function (f) { return f.header === 'Brand'; })[0];
  const valueField = opp.fields.filter(function (f) { return f.header === 'Est. Value'; })[0];
  const result = createCampaign(row, brandField ? brandField.value : '', deliverables, valueField ? valueField.value : '', deadline, notes, opportunityId);
  recordActivity_('Opportunity', opportunityId, 'Status Change', 'Converted to Campaign', 'Campaign created from this opportunity.', '');
  return result;
}
