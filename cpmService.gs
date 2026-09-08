/**
 * cpmService.gs
 * Estimates CPM from industry-benchmark ranges, not a real ad-market feed —
 * always returned and displayed as a range, never a single number, per
 * Step 0 answer #1. Optionally overridden per-niche via Script Properties
 * (Settings) if you later plug in your own deal-derived benchmarks.
 */

function estimateCPM(niche, subCount, engagementRatioPct) {
  const range = lookupNicheRange_(niche);
  const subMult = subCountMultiplier_(subCount);
  const engMult = engagementMultiplier_(engagementRatioPct);

  const low = Math.round(range[0] * subMult * engMult * 10) / 10;
  const high = Math.round(range[1] * subMult * engMult * 10) / 10;

  return '$' + low + '-$' + high + ' CPM (est.)';
}

function lookupNicheRange_(niche) {
  const override = getProp_(PROP_KEYS.CPM_NICHE_OVERRIDE, '');
  let table = CPM_NICHE_TABLE;
  if (override) {
    try {
      table = JSON.parse(override);
    } catch (e) {
      // fall through to default table on malformed override
    }
  }
  const nicheLower = (niche || '').toLowerCase();
  const matchKey = Object.keys(table).find(function (k) {
    return k !== 'default' && nicheLower.indexOf(k) !== -1;
  });
  return table[matchKey] || table['default'] || CPM_NICHE_TABLE.default;
}

function subCountMultiplier_(subCount) {
  const n = Number(subCount) || 0;
  const tier = SUBCOUNT_MULTIPLIER_TIERS.find(function (t) { return n <= t.max; });
  return tier ? tier.mult : 1.0;
}

/**
 * Engagement above/below a rough 3% baseline nudges the estimate up or down,
 * capped so a single viral outlier doesn't blow out the range.
 */
function engagementMultiplier_(engagementRatioPct) {
  const e = Number(engagementRatioPct);
  if (!e || isNaN(e)) return 1.0;
  const delta = (e - 3) / 3; // fraction above/below 3% baseline
  const mult = 1.0 + Math.max(-0.3, Math.min(0.3, delta * 0.5));
  return mult;
}
