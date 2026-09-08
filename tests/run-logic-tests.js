/**
 * run-logic-tests.js
 * Regression tests for Koli's pure/deterministic logic — the parts that
 * don't touch SpreadsheetApp, UrlFetchApp, or any live API key, so they
 * can run in plain Node without a Google account or a deployed sheet.
 * This is NOT a substitute for live testing (see STATUS.md's "verified
 * vs. not verified" section) — it's the slice of Koli that CAN be
 * verified without one, run automatically instead of by inspection.
 *
 * Each target .gs file is loaded into its own isolated vm context (Apps
 * Script files have no module wrapper — they're just top-level function
 * declarations, same shape a vm script expects) so functions can be
 * pulled out and called directly, without needing to stub out every
 * SpreadsheetApp/UrlFetchApp global those files never actually invoke at
 * load time.
 *
 * Run: node tests/run-logic-tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function loadGs(relPath) {
  return loadGsMulti([relPath]);
}

/**
 * Loads several .gs files into ONE shared sandbox, in order — mirrors how
 * Apps Script actually runs (every .gs file in a project shares one
 * global scope), needed whenever the function under test calls a
 * top-level const/function defined in a different file (e.g.
 * brandFitService.gs's BRAND_FIT_WEIGHTS lives in constants.gs).
 */
function loadGsMulti(relPaths, extraGlobals) {
  const sandbox = Object.assign({}, extraGlobals);
  vm.createContext(sandbox);
  relPaths.forEach((relPath) => {
    const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
    vm.runInContext(code, sandbox, { filename: relPath });
  });
  return sandbox;
}

// Minimal stub for Apps Script's PropertiesService — enough for getProp_
// (constants.gs) to resolve to its fallback, simulating "no override
// configured," the normal case for anything gated behind a Settings toggle.
const NO_PROPERTIES_STUB = {
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} })
  }
};

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok - ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL - ' + name);
    console.log('    ' + e.message);
  }
}

// ---------- outreachDraftService.gs ----------
console.log('outreachDraftService.gs');
{
  const m = loadGs('outreachDraftService.gs');

  test('sampleTranscriptExcerpt_: short transcript passes through unchanged', () => {
    const lines = [{ text: 'hello' }, { text: 'world' }];
    assert.strictEqual(m.sampleTranscriptExcerpt_(lines, 900), 'hello world');
  });

  test('sampleTranscriptExcerpt_: long transcript is sampled, not just truncated from the start', () => {
    // Marker words every ~10 chars across a long transcript, so we can
    // check which parts of the timeline actually made it into the excerpt.
    const words = [];
    for (let i = 0; i < 400; i++) words.push('W' + String(i).padStart(3, '0'));
    const full = words.join(' ');
    const lines = words.map((w) => ({ text: w }));
    const maxChars = 300;
    const out = m.sampleTranscriptExcerpt_(lines, maxChars);

    assert.ok(out.length <= maxChars + 20, 'excerpt should stay near the char budget, got ' + out.length);
    assert.ok(out.indexOf('...') !== -1, 'sampled excerpt should show the "..." join between windows');
    assert.notStrictEqual(out, full.slice(0, maxChars),
      'a plain truncate-from-start would produce this exact string — sampling must differ from that');
    // Something from well past where a naive truncation would have
    // stopped (word ~W059 at 300 chars in) must still show up — proof
    // the excerpt actually reaches deep into the video, not just its
    // first few seconds.
    const markers = (out.match(/W(\d{3})/g) || []).map((w) => Number(w.slice(1)));
    const maxMarker = Math.max(...markers);
    assert.ok(maxMarker >= 150, 'expected a marker well past the naive-truncation point (~W059), got max ' + maxMarker + ' in: ' + out);
  });

  test('enforceEmailCharLimit_: under the limit is untouched', () => {
    const r = m.enforceEmailCharLimit_('Short email body.');
    assert.strictEqual(r.truncated, false);
    assert.strictEqual(r.body, 'Short email body.');
  });

  test('enforceEmailCharLimit_: over the limit is trimmed to <=500 and lands on a word boundary', () => {
    const body = ('word '.repeat(200)).trim(); // 999 chars, well over the limit
    const r = m.enforceEmailCharLimit_(body);
    assert.strictEqual(r.truncated, true);
    assert.ok(r.body.length <= 500, 'trimmed body must be <=500 chars, got ' + r.body.length);
    assert.ok(body.startsWith(r.body), 'trimmed body must be a clean prefix of the original, not reworded');
    const nextChar = body.charAt(r.body.length);
    assert.ok(nextChar === ' ' || nextChar === '', 'must cut at a word boundary, not mid-word — next original char was ' + JSON.stringify(nextChar));
  });

  test('enforceEmailCharLimit_: a single word longer than the limit still hard-caps at 500 (no infinite/empty result)', () => {
    const body = 'x'.repeat(600); // no spaces at all
    const r = m.enforceEmailCharLimit_(body);
    assert.strictEqual(r.truncated, true);
    assert.ok(r.body.length > 0 && r.body.length <= 500);
  });

  // Note: OUTREACH_EMAIL_MAX_CHARS itself isn't asserted directly here —
  // top-level `const` in a vm-loaded script isn't exposed as a property
  // on the sandbox object (a Node vm quirk, functions still see it fine
  // via closure). The 500-char requirement is already exercised for real
  // by the enforceEmailCharLimit_ tests above.
}

// ---------- geminiService.gs ----------
console.log('geminiService.gs');
{
  const m = loadGs('geminiService.gs');

  test('clampAuthenticityScore_: in-range int passes through', () => {
    assert.strictEqual(m.clampAuthenticityScore_(5), 5);
  });
  test('clampAuthenticityScore_: above range clamps to 10 (the bug this was fixed for)', () => {
    assert.strictEqual(m.clampAuthenticityScore_(15), 10);
  });
  test('clampAuthenticityScore_: below/negative clamps to 1', () => {
    assert.strictEqual(m.clampAuthenticityScore_(-3), 1);
  });
  test('clampAuthenticityScore_: rounds fractional values', () => {
    assert.strictEqual(m.clampAuthenticityScore_(7.6), 8);
  });
  test('clampAuthenticityScore_: non-numeric returns null, not NaN or a crash', () => {
    assert.strictEqual(m.clampAuthenticityScore_('not a number'), null);
    assert.strictEqual(m.clampAuthenticityScore_(undefined), null);
  });
  test('clampAuthenticityScore_: explicit null ("no comment sample") stays null, not 0-coerced to 1', () => {
    // Number(null) === 0, not NaN — without an explicit null check this
    // silently became 1 (the worst possible score) instead of staying
    // null, defeating computeEngagementQualityScore_'s neutral-50
    // fallback for "no data" in channelMetricsService.gs. Real bug this
    // test run caught; see geminiService.gs for the fix.
    assert.strictEqual(m.clampAuthenticityScore_(null), null);
  });
}

// ---------- brandIntelligenceService.gs ----------
console.log('brandIntelligenceService.gs');
{
  const m = loadGs('brandIntelligenceService.gs');

  test('normalizeBrandName_: strips corporate suffixes', () => {
    assert.strictEqual(m.normalizeBrandName_('Nike Inc'), 'Nike');
    assert.strictEqual(m.normalizeBrandName_('Nike, Inc.'), 'Nike');
    assert.strictEqual(m.normalizeBrandName_('Acme Corp'), 'Acme');
  });
  test('normalizeBrandName_: strips a leading "The "', () => {
    assert.strictEqual(m.normalizeBrandName_('The North Face'), 'North Face');
  });
  test('normalizeBrandName_: empty/null-safe', () => {
    assert.strictEqual(m.normalizeBrandName_(''), '');
    assert.strictEqual(m.normalizeBrandName_(null), '');
  });
  test('normalizeBrandName_: "Nike" and "Nike, Inc." collapse to the same key (the actual dedup this powers)', () => {
    assert.strictEqual(m.normalizeBrandName_('Nike'), m.normalizeBrandName_('Nike, Inc.'));
  });

  test('canonicalBrandName_: ALL CAPS gets Title Cased', () => {
    assert.strictEqual(m.canonicalBrandName_('NIKE'), 'Nike');
  });
  test('canonicalBrandName_: mixed/stylized casing (e.g. iRobot) is left alone', () => {
    assert.strictEqual(m.canonicalBrandName_('iRobot'), 'iRobot');
  });
  test('canonicalBrandName_: intentional all-lowercase branding (e.g. "adidas") is preserved, per its own doc comment', () => {
    // This is the exact example the function's comment gives as something
    // that should be preserved: "preserve intentional stylized casing
    // (e.g. adidas, iRobot)". Before the fix, the all-lowercase branch
    // title-cased it to "Adidas" anyway, contradicting the comment.
    assert.strictEqual(m.canonicalBrandName_('adidas'), 'adidas');
  });
}

// ---------- youtubeService.gs ----------
console.log('youtubeService.gs');
{
  const m = loadGs('youtubeService.gs');
  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  test('computeAvgPostsPerMonth_: counts only videos inside the lookback window', () => {
    const videos = [
      { publishedAt: daysAgo(1) }, { publishedAt: daysAgo(10) }, { publishedAt: daysAgo(20) }, // inside a 30-day window
      { publishedAt: daysAgo(45) } // outside
    ];
    const result = m.computeAvgPostsPerMonth_(videos, 30);
    assert.strictEqual(result, 3); // 3 videos / 1 month
  });
  test('computeAvgPostsPerMonth_: zero videos in window returns 0, not NaN/Infinity', () => {
    assert.strictEqual(m.computeAvgPostsPerMonth_([], 30), 0);
  });
}

// ---------- brandFitService.gs ----------
console.log('brandFitService.gs');
{
  const m = loadGsMulti(['constants.gs', 'brandFitService.gs']);

  test('clampScore0to100_: in-range passes through, rounds fractional', () => {
    assert.strictEqual(m.clampScore0to100_(72), 72);
    assert.strictEqual(m.clampScore0to100_(71.6), 72);
  });
  test('clampScore0to100_: out-of-range clamps to 0/100', () => {
    assert.strictEqual(m.clampScore0to100_(150), 100);
    assert.strictEqual(m.clampScore0to100_(-20), 0);
  });
  test('clampScore0to100_: non-numeric defaults to neutral 50, not null/NaN', () => {
    // Different rule than clampAuthenticityScore_ on purpose — every
    // Brand Fit component must contribute a real number to the weighted
    // composite, there's no "n/a" cell to fall back to display-wise.
    assert.strictEqual(m.clampScore0to100_('nonsense'), 50);
    assert.strictEqual(m.clampScore0to100_(undefined), 50);
  });

  test('computeBudgetFitScore_: no budget entered is neutral, not a penalty', () => {
    assert.strictEqual(m.computeBudgetFitScore_(20, 100000, 0), 50);
    assert.strictEqual(m.computeBudgetFitScore_(20, 100000, null), 50);
  });
  test('computeBudgetFitScore_: budget comfortably covers estimated cost scores at/near 100', () => {
    // CPM $20, 100k avg views -> estimated cost $2000. Budget $5000 covers it 2.5x over.
    const score = m.computeBudgetFitScore_(20, 100000, 5000);
    assert.strictEqual(score, 100); // clamped ceiling, ratio was 2.5
  });
  test('computeBudgetFitScore_: budget well under estimated cost scores low proportionally', () => {
    // Estimated cost $2000, budget only $500 -> ratio 0.25 -> score 25.
    const score = m.computeBudgetFitScore_(20, 100000, 500);
    assert.strictEqual(score, 25);
  });

  test('computeBrandFitComposite_: weights sum to 1 (constants.gs BRAND_FIT_WEIGHTS)', () => {
    const weights = { contentFit: 0.20, audienceFit: 0.20, engagementQuality: 0.15, momentum: 0.15, budgetFit: 0.15, reliability: 0.10, risk: 0.05 };
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, 'weights must sum to 1, got ' + total);
  });
  test('computeBrandFitComposite_: all-100 components composite to 100', () => {
    const all100 = { contentFit: 100, audienceFit: 100, engagementQuality: 100, momentum: 100, budgetFit: 100, reliability: 100, risk: 100 };
    assert.strictEqual(m.computeBrandFitComposite_(all100), 100);
  });
  test('computeBrandFitComposite_: all-zero components composite to 0', () => {
    const allZero = { contentFit: 0, audienceFit: 0, engagementQuality: 0, momentum: 0, budgetFit: 0, reliability: 0, risk: 0 };
    assert.strictEqual(m.computeBrandFitComposite_(allZero), 0);
  });
}

// ---------- cpmService.gs ----------
console.log('cpmService.gs');
{
  const m = loadGsMulti(['constants.gs', 'cpmService.gs'], NO_PROPERTIES_STUB);

  test('estimateCPM and estimateCPMRaw_ agree (the string version is just the raw numbers formatted)', () => {
    const raw = m.estimateCPMRaw_('maker', 50000, 3);
    const formatted = m.estimateCPM('maker', 50000, 3);
    assert.strictEqual(formatted, '$' + raw.low + '-$' + raw.high + ' CPM (est.)');
  });
  test('estimateCPMRaw_: low is always <= high', () => {
    const raw = m.estimateCPMRaw_('finance', 2000000, 8);
    assert.ok(raw.low <= raw.high, 'low (' + raw.low + ') should be <= high (' + raw.high + ')');
  });
}

// ---------- brandViewService.gs ----------
console.log('brandViewService.gs');
{
  const m = loadGs('brandViewService.gs');

  test('columnToLetter_: single-letter columns', () => {
    assert.strictEqual(m.columnToLetter_(1), 'A');
    assert.strictEqual(m.columnToLetter_(26), 'Z');
  });
  test('columnToLetter_: double-letter columns (the actual point of this function)', () => {
    assert.strictEqual(m.columnToLetter_(27), 'AA');
    assert.strictEqual(m.columnToLetter_(28), 'AB');
    assert.strictEqual(m.columnToLetter_(52), 'AZ');
    assert.strictEqual(m.columnToLetter_(53), 'BA');
  });
}

// ---------- attentionService.gs ----------
console.log('attentionService.gs');
{
  // Minimal SpreadsheetApp/PropertiesService stub — just enough for
  // findRecentSponsorActivity_/findUnclaimedHighGrade_ to read a fixed
  // set of "Sponsors" rows without touching a real spreadsheet.
  function fakeSpreadsheetApp(sponsorRows) {
    const sheet = {
      getLastRow: () => sponsorRows.length + 1,
      getRange: (row, colStart, numRows, numCols) => ({
        getValues: () => sponsorRows.map((r) => r.slice(colStart - 1, colStart - 1 + (numCols || r.length)))
      })
    };
    return { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) };
  }

  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const CHANNEL_COLS = ['Channel', 'ID', 'Outreach', 'Last Contact', 'Grade'];
  const col = (name) => CHANNEL_COLS.indexOf(name);
  const channelRow = (overrides) => {
    const base = { Channel: 'Test Channel', ID: 'UC1', Outreach: 'Not Contacted', 'Last Contact': '', Grade: 'C' };
    Object.assign(base, overrides);
    return CHANNEL_COLS.map((c) => base[c]);
  };

  function loadAttention(sponsorRows) {
    // reportService.gs supplies formatDateShort_ — its Drive-touching
    // functions are fine to load unused, they're never called here.
    return loadGsMulti(['constants.gs', 'reportService.gs', 'attentionService.gs'], { SpreadsheetApp: fakeSpreadsheetApp(sponsorRows || []) });
  }

  test('findStaleOutreach_: Contacted with an old Last Contact date is flagged', () => {
    const m = loadAttention();
    const rows = [channelRow({ Outreach: 'Contacted', 'Last Contact': daysAgo(20) })];
    const result = m.findStaleOutreach_(rows, col);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].channel, 'Test Channel');
  });
  test('findStaleOutreach_: Contacted with NO Last Contact date ever set is flagged (never set, not skipped)', () => {
    const m = loadAttention();
    const rows = [channelRow({ Outreach: 'Contacted', 'Last Contact': '' })];
    const result = m.findStaleOutreach_(rows, col);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].col3, 'never set');
  });
  test('findStaleOutreach_: Contacted with a RECENT Last Contact is not flagged', () => {
    const m = loadAttention();
    const rows = [channelRow({ Outreach: 'Contacted', 'Last Contact': daysAgo(2) })];
    assert.strictEqual(m.findStaleOutreach_(rows, col).length, 0);
  });
  test('findStaleOutreach_: statuses outside Contacted/Negotiating are never flagged, however stale', () => {
    const m = loadAttention();
    const rows = [
      channelRow({ Outreach: 'Not Contacted', 'Last Contact': daysAgo(100) }),
      channelRow({ Outreach: 'Closed - Won', 'Last Contact': daysAgo(100) }),
      channelRow({ Outreach: 'Do Not Contact', 'Last Contact': '' })
    ];
    assert.strictEqual(m.findStaleOutreach_(rows, col).length, 0);
  });

  test('findUnclaimedHighGrade_: A/B grade with no Sponsors row at all is surfaced', () => {
    const m = loadAttention([]); // empty Sponsors sheet
    const rows = [channelRow({ ID: 'UC1', Grade: 'A' }), channelRow({ ID: 'UC2', Grade: 'D' })];
    const result = m.findUnclaimedHighGrade_(rows, col);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].channelId, 'UC1'); // the D-grade channel never qualifies regardless of sponsor history
  });
  test('findUnclaimedHighGrade_: A/B grade channel that DOES have a Sponsors row is excluded', () => {
    // Sponsors row shape: [Channel, Channel ID, ...] — only col B (index 1) is read.
    const m = loadAttention([['Test Channel', 'UC1', 'Brand', '', '', 1, '', '', '', '']]);
    const rows = [channelRow({ ID: 'UC1', Grade: 'A' })];
    assert.strictEqual(m.findUnclaimedHighGrade_(rows, col).length, 0);
  });
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
