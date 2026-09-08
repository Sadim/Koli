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
  const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: relPath });
  return sandbox;
}

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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
