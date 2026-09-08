/**
 * brandFitService.gs
 * Brand Fit Score — channel(s) scored against one specific campaign brief
 * (brand, target niche, target audience, budget per video). See
 * constants.gs's BRAND_FIT_WEIGHTS for the full reasoning on why these 7
 * components and not Grade's 7. Supports multiple selected Channels rows
 * in one run so a brief can be scored against several creators at once —
 * the natural setup for "which of these should we pick" comparison.
 */

function showBrandFitScoreDialog() {
  const rows = getActiveChannelRows_();
  if (!rows.length) {
    SpreadsheetApp.getUi().alert('Select one or more rows on the Channels sheet first (click a cell, or drag/ctrl-click across several rows), then run this again.');
    return;
  }
  const t = HtmlService.createTemplateFromFile('BrandFitScoreDialog');
  t.rows = rows;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(440).setHeight(600), 'Brand Fit Score');
}

/**
 * rowsCsv: comma-joined row numbers (see BrandFitScoreDialog.html — kept
 * as a plain string across the template boundary rather than JSON, same
 * "no need for more than this" reasoning as everywhere else in Koli).
 * brief: { brand, targetNiche, targetAudience, budgetPerVideo, includeSafetyCheck }
 */
function runBrandFitScores(rowsCsv, brief) {
  try {
    if (!brief || !String(brief.brand || '').trim()) throw new Error('Brand/campaign name is required.');
    const rows = String(rowsCsv).split(',').map(Number).filter(function (n) { return !isNaN(n) && n >= 2; });
    if (!rows.length) throw new Error('No valid rows selected.');

    const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
    const sheet = getOrCreateSheet_(SHEET_NAMES.BRAND_FIT_SCORES, BRAND_FIT_HEADERS);

    const results = rows.map(function (row) {
      const rowData = getChannelRowData_(channelsSheet, row);
      if (!rowData.channelId) return { name: rowData.name || ('Row ' + row), ok: false, message: 'No Channel ID — run Channel Analysis on this row first.' };
      try {
        const scored = computeBrandFitForChannel_(rowData, brief);
        writeBrandFitRow_(sheet, rowData, brief, scored);
        return { name: scored.channelName, ok: true, score: Math.round(scored.composite), letter: scored.letter };
      } catch (e) {
        return { name: rowData.name, ok: false, message: e.message };
      }
    });

    const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sheet.getSheetId();
    return { ok: true, results: results, link: link };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function computeBrandFitForChannel_(rowData, brief) {
  const data = getChannelData(rowData.channelId); // cache-first, cheap if already analyzed
  const commentSample = getChannelCommentSample_(data.recentVideos);
  // Same cache key analyzeChannelOne uses — hits cache instead of a fresh
  // Gemini call for any channel already run through Channel Analysis
  // within the last 6h, which is the normal case for a channel you're now
  // scoring against a brief.
  const enrichment = withCache_(cacheKey_('enrichment', rowData.channelId), function () {
    return enrichChannel_(data.description, data.recentVideos, commentSample);
  }, DEFAULTS.CACHE_TTL_SECONDS);
  // Not cached today (same as Channel analysis's own aggregates step) — a
  // real, bounded extra API cost per channel scored, stated plainly rather
  // than hidden, same as every other speed tradeoff documented in Koli.
  const aggregates = computeChannelAggregates_(data.recentVideos);

  const briefFit = scoreBriefFit_(rowData.name, enrichment, brief);
  const engagementQuality = computeEngagementQualityScore_(enrichment.authenticity, aggregates.engagementRatio);
  const reliability = computeReliabilityScore_(data.recentVideos);
  const momentum = aggregates.growthScore;
  const cpm = estimateCPMRaw_(enrichment.mainNiche, data.subCount, aggregates.engagementRatio);
  const budgetFit = computeBudgetFitScore_(cpm.high, aggregates.avgViews, Number(brief.budgetPerVideo) || 0);
  const risk = brief.includeSafetyCheck
    ? computeBrandSafetyRiskScore_(rowData.channelId, data.name)
    : (enrichment.authenticity === null || enrichment.authenticity === undefined ? 50 : enrichment.authenticity * 10);

  const components = {
    contentFit: briefFit.contentFit, audienceFit: briefFit.audienceFit, engagementQuality: engagementQuality,
    momentum: momentum, budgetFit: budgetFit, reliability: reliability, risk: risk
  };
  const composite = computeBrandFitComposite_(components);
  const band = GRADE_BANDS.find(function (b) { return composite >= b.min; }) || GRADE_BANDS[GRADE_BANDS.length - 1];

  return {
    channelName: data.name, composite: composite, letter: band.letter, components: components,
    notes: briefFit.notes, estimatedCPM: cpm
  };
}

/**
 * ONE Gemini call for both brief-relative components — same "merge it
 * into one call" rule used everywhere else in Koli (see geminiService.gs).
 */
function scoreBriefFit_(channelName, enrichment, brief) {
  const nicheText = enrichment.mainNiche + (enrichment.subNiches.length ? ' (' + enrichment.subNiches.join(', ') + ')' : '');
  const audienceText = 'Location: ' + enrichment.audience.location + '; Gender: ' + enrichment.audience.gender + '; Age: ' + enrichment.audience.age;

  const prompt =
    'You are scoring how well a YouTube creator fits ONE specific brand campaign brief — not a general ' +
    'quality score, purely a fit-to-this-brief score. Return two scores, 0-100 each:\n' +
    '1. "contentFit": how well the creator\'s niche/content matches the brief\'s target niche.\n' +
    '2. "audienceFit": how well the creator\'s estimated audience matches the brief\'s target audience.\n' +
    'If the brief leaves a field blank, treat that dimension as automatically satisfied (score high on it) ' +
    'rather than penalizing for missing brief detail.\n\n' +
    'Creator: ' + channelName + '\nCreator niche: ' + nicheText + '\nCreator estimated audience: ' + audienceText + '\n\n' +
    'Campaign brief — target niche: ' + (brief.targetNiche || '(not specified)') +
    '\nCampaign brief — target audience: ' + (brief.targetAudience || '(not specified)') + '\n\n' +
    'Respond as JSON: {"contentFit": <0-100>, "audienceFit": <0-100>, "notes": "<one sentence on the weaker of the two, or empty string if both are strong>"}';

  const result = geminiCallJson_(prompt);
  return {
    contentFit: clampScore0to100_(result.contentFit),
    audienceFit: clampScore0to100_(result.audienceFit),
    notes: String(result.notes || '').trim()
  };
}

/** Same "never trust an LLM's stated range without checking it" rule as clampAuthenticityScore_ in geminiService.gs, just on a 0-100 scale instead of 1-10. Missing/non-numeric defaults to a neutral 50 rather than null, since every Brand Fit component must contribute a real number to the weighted composite. */
function clampScore0to100_(raw) {
  const n = Number(raw);
  if (isNaN(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Budget vs. estimated cost, using the high end of the CPM range (the
 * conservative side — better to undersell fit than oversell it against a
 * real spend decision). No budget entered = neutral, not a penalty, same
 * pattern as computeCommercialFitScore_ treating zero sponsor history as
 * neutral-low rather than a hard fail.
 */
function computeBudgetFitScore_(estimatedCPMHigh, avgViews, budgetPerVideo) {
  if (!budgetPerVideo || budgetPerVideo <= 0) return 50;
  const estimatedCostHigh = (estimatedCPMHigh * avgViews) / 1000;
  if (estimatedCostHigh <= 0) return 50;
  const ratio = budgetPerVideo / estimatedCostHigh;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

function computeBrandFitComposite_(components) {
  return Object.keys(BRAND_FIT_WEIGHTS).reduce(function (sum, key) {
    return sum + (components[key] || 0) * BRAND_FIT_WEIGHTS[key];
  }, 0);
}

/**
 * Live brand-safety check as a risk score — deliberately not run on every
 * bulk Channel analysis pass (too slow/costly at scale), but worth it here
 * where you're evaluating one specific creator against a real spend
 * decision. Fails soft to neutral: an unrelated Reddit/network hiccup
 * shouldn't tank an otherwise-good fit score.
 */
function computeBrandSafetyRiskScore_(channelId, channelName) {
  try {
    const result = checkBrandSafety(channelUrl_(channelId));
    return result.flagged ? 20 : 90;
  } catch (e) {
    return 50;
  }
}

function writeBrandFitRow_(sheet, rowData, brief, scored) {
  const newRow = sheet.getLastRow() + 1;
  const values = [
    '', rowData.channelId, sanitizeCellText_(brief.brand), Math.round(scored.composite), scored.letter,
    sanitizeCellText_(scored.notes || ''), new Date()
  ];
  sheet.getRange(newRow, 1, 1, values.length).setValues([values]);
  sheet.getRange(newRow, 1).setFormula(hyperlinkFormula_(channelUrl_(rowData.channelId), rowData.name));
  sheet.getRange(newRow, 7).setNumberFormat('yyyy-mm-dd hh:mm');

  const c = scored.components;
  sheet.getRange(newRow, 4).setNote(
    'Composite: ' + Math.round(scored.composite) + '/100 vs. "' + brief.brand + '"\n' +
    'Content fit ' + Math.round(c.contentFit) + ' (20%) · Audience fit ' + Math.round(c.audienceFit) + ' (20%) · ' +
    'Engagement quality ' + Math.round(c.engagementQuality) + ' (15%) · Momentum ' + Math.round(c.momentum) + ' (15%) · ' +
    'Budget fit ' + Math.round(c.budgetFit) + ' (15%) · Reliability ' + Math.round(c.reliability) + ' (10%) · ' +
    'Risk ' + Math.round(c.risk) + ' (5%, higher = lower risk)\n' +
    'Estimated CPM: $' + scored.estimatedCPM.low + '-$' + scored.estimatedCPM.high + '\n' +
    'Not a standard external metric — Koli\'s own formula, tunable in constants.gs (BRAND_FIT_WEIGHTS).'
  );
}
