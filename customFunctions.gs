/**
 * customFunctions.gs
 * =KOLI_* formulas usable directly in any cell. Deliberately limited to
 * pure computation on values you type or reference — Google Sheets
 * custom functions run in a restricted sandbox that disallows
 * UrlFetchApp and most other authorized services (confirmed directly,
 * not assumed), so nothing here can call YouTube/Gemini live. Each
 * function reuses logic that already exists elsewhere in Koli rather
 * than reimplementing it — one source of truth either way.
 */

/**
 * Normalizes a brand/sponsor name the same way the Sponsors tab does —
 * strips corporate suffixes (Inc, LLC, Ltd...), fixes casing. Useful
 * for previewing what a messy pasted brand name will collapse to
 * before it ever reaches the Sponsors tab.
 * @param {string} rawName The brand name to normalize.
 * @return The canonical form of the name.
 * @customfunction
 */
function KOLI_NORMALIZE_BRAND(rawName) {
  return canonicalBrandName_(rawName) || '';
}

/**
 * Estimates CPM using Koli's own industry-benchmark tiers — the same
 * math Channel analysis uses, usable here for quick scenario math
 * without running a full analysis. Always a range, never a single
 * number — same "estimate, not a real ad-market feed" honesty as the
 * built-in version. Deliberately does not read the optional Settings
 * CPM-table override (that depends on Document Properties, which
 * custom functions may not reliably have access to) — always uses the
 * default benchmark table.
 * @param {number} subCount Subscriber count.
 * @param {number} engagementPct Engagement rate as a percentage, e.g. 4 for 4%.
 * @param {string} niche Niche/category text — matched loosely, same as the built-in estimator.
 * @return The estimated CPM range.
 * @customfunction
 */
function KOLI_CPM(subCount, engagementPct, niche) {
  const nicheLower = String(niche || '').toLowerCase();
  const matchKey = Object.keys(CPM_NICHE_TABLE).find(function (k) {
    return k !== 'default' && nicheLower.indexOf(k) !== -1;
  });
  const range = CPM_NICHE_TABLE[matchKey] || CPM_NICHE_TABLE['default'];

  const subMult = subCountMultiplier_(subCount);
  const engMult = engagementMultiplier_(engagementPct);
  const low = Math.round(range[0] * subMult * engMult * 10) / 10;
  const high = Math.round(range[1] * subMult * engMult * 10) / 10;
  return '$' + low + '-$' + high + ' CPM (est.)';
}

/**
 * Engagement ratio the same way Koli computes it internally —
 * (likes + comments) / views, as a percentage.
 * @param {number} likes
 * @param {number} comments
 * @param {number} views
 * @return Engagement percentage.
 * @customfunction
 */
function KOLI_ENGAGEMENT(likes, comments, views) {
  const v = Number(views) || 0;
  if (!v) return 0;
  return Math.round(((Number(likes) || 0) + (Number(comments) || 0)) / v * 1000) / 10;
}

/**
 * Formats a large number the way Koli does throughout the sheet — e.g.
 * 1234567 becomes "1.2M", 45000 becomes "45K".
 * @param {number} count
 * @return The formatted count.
 * @customfunction
 */
function KOLI_FORMAT_COUNT(count) {
  const n = Number(count);
  if (isNaN(n)) return '';
  return formatCount_(n);
}
