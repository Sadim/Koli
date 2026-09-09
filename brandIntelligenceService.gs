/**
 * brandIntelligenceService.gs
 * Three coupled pieces: normalize sponsor names so "Nike" and "Nike Inc"
 * collapse into one row, a Brand Targets sheet so you can flag which
 * brands actually matter, and the Gap Analysis Engine: which brands
 * sponsor multiple channels similar to a given one, but haven't
 * sponsored that one yet. Pure synthesis over data Koli already
 * collects: no new API calls, no new Gemini calls, no waiting on
 * anything external.
 */

/**
 * Deterministic normalization: strips common suffixes, punctuation,
 * and casing differences. Deliberately not Gemini-based: this needs to
 * run on every sponsor write, for free, not add an API call per
 * detection. Catches the large majority of real-world duplicates
 * ("Nike Inc", "Nike, Inc.", "NIKE") without needing a model call.
 */
function normalizeBrandName_(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  // Strip common corporate suffixes (word-boundary, case-insensitive).
  s = s.replace(/[,.]?\s*\b(inc|incorporated|llc|ltd|limited|co|corp|corporation|company|plc|gmbh)\b\.?\s*$/i, '');
  s = s.replace(/[,.]?\s*\b(inc|incorporated|llc|ltd|limited|co|corp|corporation|company|plc|gmbh)\b\.?\s*$/i, ''); // catch "X Inc Co": two suffixes
  s = s.replace(/^\s*the\s+/i, ''); // leading "The "
  s = s.replace(/[.,]+$/, '').trim();
  return s;
}

/** The canonical *display* form: normalized, but Title Case rather than whatever casing was detected. */
function canonicalBrandName_(raw) {
  const normalized = normalizeBrandName_(raw);
  if (!normalized) return '';
  // Only reshape casing if the original was ALL CAPS: an all-lowercase
  // name is left as-is, since that's frequently intentional branding
  // ("adidas", "e.l.f.") rather than someone just typing carelessly, and
  // guessing wrong here would be worse than leaving it alone. Mixed case
  // (e.g. "iRobot") was never touched either way.
  if (normalized === normalized.toUpperCase()) {
    return normalized.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return normalized;
}

/**
 * One-time cleanup for brand names already sitting in the Sponsors tab
 * from before normalization existed. Merges rows that normalize to the
 * same brand for the same channel (sums Mentions, keeps the earliest
 * First Seen / latest Last Seen, keeps one Sample Video).
 */
function normalizeExistingSponsors() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SPONSORS);
  if (!sheet || sheet.getLastRow() < 2) { ui.alert('No Sponsors data to normalize yet.'); return; }

  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(2, 1, lastRow - 1, SPONSOR_HEADERS.length).getValues();
  // Sample Video (col 7) is a =HYPERLINK() formula: getValues() would
  // flatten it to display text, losing the link. Read formulas
  // separately so the merge can preserve one intact.
  const sampleVideoFormulas = sheet.getRange(2, 7, lastRow - 1, 1).getFormulas().map((r) => r[0]);
  const col = (name) => SPONSOR_HEADERS.indexOf(name);

  const merged = {}; // key: channelId + '|' + normalizedBrand
  data.forEach((row, i) => {
    const channelId = row[col('Channel ID')];
    const normalized = normalizeBrandName_(row[col('Brand')]);
    if (!normalized) return;
    const key = channelId + '|' + normalized.toLowerCase();
    if (!merged[key]) {
      merged[key] = {
        channel: row[col('Channel')], channelId: channelId, brand: canonicalBrandName_(row[col('Brand')]),
        firstSeen: row[col('First Seen')], lastSeen: row[col('Last Seen')],
        mentions: Number(row[col('Mentions')]) || 0,
        sampleVideoFormula: sampleVideoFormulas[i] || '', sampleVideoText: row[col('Sample Video')],
        // Posted/Timestamp/Evidence track whichever source row has the
        // latest Last Seen: same "latest mention wins" rule
        // upsertAggregateSponsors_ uses, so merging duplicates never
        // regresses to older evidence.
        lastPosted: row[col('Posted')], lastTimestamp: row[col('Timestamp')], lastEvidence: row[col('Evidence')]
      };
    } else {
      const m = merged[key];
      m.mentions += Number(row[col('Mentions')]) || 0;
      if (new Date(row[col('First Seen')]) < new Date(m.firstSeen)) m.firstSeen = row[col('First Seen')];
      if (new Date(row[col('Last Seen')]) > new Date(m.lastSeen)) {
        m.lastSeen = row[col('Last Seen')];
        m.lastPosted = row[col('Posted')]; m.lastTimestamp = row[col('Timestamp')]; m.lastEvidence = row[col('Evidence')];
      }
      if (!m.sampleVideoFormula && sampleVideoFormulas[i]) m.sampleVideoFormula = sampleVideoFormulas[i];
    }
  });

  const before = data.length;
  const after = Object.keys(merged).length;
  if (before === after) { ui.alert('Nothing to merge: every brand name is already unique per channel.'); return; }

  sheet.getRange(2, 1, before, SPONSOR_HEADERS.length).clearContent();
  Object.values(merged).forEach((m, i) => {
    const row = 2 + i;
    sheet.getRange(row, 1, 1, 6).setValues([[
      sanitizeCellText_(m.channel), m.channelId, sanitizeCellText_(m.brand), m.firstSeen, m.lastSeen, m.mentions
    ]]);
    const sampleCell = sheet.getRange(row, 7);
    if (m.sampleVideoFormula) sampleCell.setFormula(m.sampleVideoFormula);
    else if (m.sampleVideoText) sampleCell.setValue(m.sampleVideoText);
    sheet.getRange(row, 8, 1, 3).setValues([[m.lastPosted || '', m.lastTimestamp || '', sanitizeCellText_(m.lastEvidence || '')]]);
  });

  ui.alert('Sponsors normalized', (before - after) + ' duplicate row(s) merged: ' + before + ' rows became ' + after + '.', ui.ButtonSet.OK);
}

// ---------------- Brand Targets ----------------

function showBrandTargets() {
  const sheet = getOrCreateSheet_(SHEET_NAMES.BRAND_TARGETS, BRAND_TARGET_HEADERS);
  ensureBrandTargetPriorityColumn_(sheet);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}

function ensureBrandTargetPriorityColumn_(sheet) {
  const col = BRAND_TARGET_HEADERS.indexOf('Priority') + 1;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(BRAND_TARGET_PRIORITIES, true).setAllowInvalid(false).build();
  sheet.getRange(2, col, 1000, 1).setDataValidation(rule);
}

function addBrandTarget(brand, niche, priority, notes) {
  if (!brand) throw new Error('Brand name is required.');
  const sheet = getOrCreateSheet_(SHEET_NAMES.BRAND_TARGETS, BRAND_TARGET_HEADERS);
  ensureBrandTargetPriorityColumn_(sheet);
  sheet.appendRow([
    sanitizeCellText_(canonicalBrandName_(brand)), sanitizeCellText_(niche || ''),
    priority || 'Medium', sanitizeCellText_(notes || ''), new Date()
  ]);
  return { ok: true };
}

function getBrandTargetSet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BRAND_TARGETS);
  if (!sheet || sheet.getLastRow() < 2) return new Set();
  const brands = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map((r) => normalizeBrandName_(r[0]).toLowerCase());
  return new Set(brands.filter(Boolean));
}

// ---------------- Gap Analysis Engine ----------------

/**
 * For a given channel: finds brands sponsoring 2+ *other* channels with
 * the same main niche, that have never sponsored this one. Pure lookup
 * over Channels + Sponsors data already collected: no new API calls.
 * Brands on the Brand Targets list are called out separately and
 * ranked first, since those are the ones you've said matter most.
 */
function runGapAnalysis(channelId) {
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const sponsorsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SPONSORS);
  if (!channelsSheet || channelsSheet.getLastRow() < 2) throw new Error('No Channels data yet: analyze some channels first.');
  if (!sponsorsSheet || sponsorsSheet.getLastRow() < 2) throw new Error('No Sponsors data yet: sponsor detection needs to run on some channels first.');

  const actualHeaders = channelsSheet.getRange(1, 1, 1, channelsSheet.getLastColumn()).getValues()[0];
  const chCol = (name) => actualHeaders.indexOf(name);
  const channelRows = channelsSheet.getRange(2, 1, channelsSheet.getLastRow() - 1, channelsSheet.getLastColumn()).getValues();
  const targetRow = channelRows.find((r) => r[chCol('ID')] === channelId);
  if (!targetRow) throw new Error('That channel hasn\'t been analyzed yet: run Channel analysis on it first.');

  const targetName = targetRow[chCol('Channel')];
  const targetNicheRaw = String(targetRow[chCol('Niche')] || '');
  const targetMainNiche = targetNicheRaw.split('(')[0].trim().toLowerCase();
  if (!targetMainNiche) throw new Error('This channel has no niche recorded yet: re-run Channel analysis on it.');

  // Every OTHER channel sharing the same main niche.
  const similarChannelIds = new Set();
  channelRows.forEach((r) => {
    const id = r[chCol('ID')];
    if (id === channelId) return;
    const niche = String(r[chCol('Niche')] || '').split('(')[0].trim().toLowerCase();
    if (niche && niche === targetMainNiche) similarChannelIds.add(id);
  });
  if (!similarChannelIds.size) throw new Error('No other analyzed channels share this channel\'s main niche yet: Gap Analysis needs at least one other similar channel to compare against.');

  const spCol = (name) => SPONSOR_HEADERS.indexOf(name);
  const sponsorRows = sponsorsSheet.getRange(2, 1, sponsorsSheet.getLastRow() - 1, SPONSOR_HEADERS.length).getValues();

  const alreadyOnTarget = new Set();
  const brandChannelCount = {}; // normalizedBrand -> Set of channelIds sponsoring it (excluding target)
  const brandDisplay = {};

  sponsorRows.forEach((r) => {
    const cid = r[spCol('Channel ID')];
    const normalized = normalizeBrandName_(r[spCol('Brand')]).toLowerCase();
    if (!normalized || normalized.indexOf('unknown (sponsorblock') === 0) return;
    brandDisplay[normalized] = canonicalBrandName_(r[spCol('Brand')]);
    if (cid === channelId) { alreadyOnTarget.add(normalized); return; }
    if (!similarChannelIds.has(cid)) return;
    if (!brandChannelCount[normalized]) brandChannelCount[normalized] = new Set();
    brandChannelCount[normalized].add(cid);
  });

  const targetBrandSet = getBrandTargetSet_();
  const gaps = Object.keys(brandChannelCount)
    .filter((b) => brandChannelCount[b].size >= 2 && !alreadyOnTarget.has(b))
    .map((b) => ({
      brand: brandDisplay[b], channelCount: brandChannelCount[b].size, isTarget: targetBrandSet.has(b)
    }))
    .sort((a, b) => (b.isTarget - a.isTarget) || (b.channelCount - a.channelCount));

  return { channelName: targetName, channelId: channelId, similarChannelCount: similarChannelIds.size, gaps: gaps };
}

function runGapAnalysisForActiveRow() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Gap Analysis'); return; }
  const ui = SpreadsheetApp.getUi();
  const row = getActiveChannelRow_();
  if (!row) { ui.alert('Select a row on the Channels sheet first, then run this again.'); return; }
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const actualHeaders = channelsSheet.getRange(1, 1, 1, channelsSheet.getLastColumn()).getValues()[0];
  const channelId = channelsSheet.getRange(row, actualHeaders.indexOf('ID') + 1).getValue();

  try {
    const result = runGapAnalysis(channelId);
    writeGapAnalysisResults_(result);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GAP_ANALYSIS);
    SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
    ui.alert(
      'Gap analysis complete',
      result.gaps.length
        ? result.gaps.length + ' brand(s) sponsor similar channels but not this one yet: see the Gap Analysis tab.'
        : 'No gaps found: every brand sponsoring similar channels already sponsors this one, or there\'s not enough comparison data yet.',
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('Could not run gap analysis: ' + e.message);
  }
}

function writeGapAnalysisResults_(result) {
  const headers = ['Channel', 'Brand', 'Sponsors N Similar Channels', 'On Your Target List', 'Run Date'];
  const sheet = getOrCreateSheet_(SHEET_NAMES.GAP_ANALYSIS, headers);
  result.gaps.forEach((g) => {
    sheet.appendRow([
      sanitizeCellText_(result.channelName), sanitizeCellText_(g.brand), g.channelCount,
      g.isTarget ? 'Yes' : '', new Date()
    ]);
  });
}
