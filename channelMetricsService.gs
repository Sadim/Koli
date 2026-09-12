/**
 * channelMetricsService.gs
 * Channel-level aggregates computed from a sample of recent videos:
 * separate from per-video Channel/Video/Profile analysis, since these
 * numbers only make sense averaged across a channel's recent output.
 *
 * Grade formula (documented plainly since it's a judgment call, not a
 * standard metric): growth momentum matters most: a small channel with
 * real upward momentum should outscore a large stagnant one: quality
 * (comment authenticity) second, Tier-1 English-market audience a
 * smaller bonus on top. Weights live in constants.gs (GRADE_WEIGHTS),
 * tune there if the balance feels wrong once there's real data to judge it against.
 */

// YouTube's own Shorts length cap (as of the 2024 extension from 60s to
// 3 minutes), plus a small buffer for rounding. Used to separate Shorts
// from full-length videos in the metrics sample below: a sponsor rate is
// for a full-video integration, and Shorts have a completely different
// view/engagement profile (often much higher raw view counts, but not
// comparable ad inventory), so mixing them into "average views" distorts
// the estimate hard for any channel that posts both, in either direction.
const SHORT_MAX_DURATION_SECONDS = 183;

/** "PT4M13S" / "PT45S" / "PT1H2M3S" -> seconds. Returns 0 if unparseable (treated as "not a Short" by isLikelyShort_ below, the safer default). */
function parseIso8601DurationSeconds_(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ''));
  if (!m) return 0;
  const hours = Number(m[1] || 0), minutes = Number(m[2] || 0), seconds = Number(m[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function isLikelyShort_(durationSeconds) {
  return durationSeconds > 0 && durationSeconds <= SHORT_MAX_DURATION_SECONDS;
}

/** Batch-fetches views/likes/commentCount/duration (+ publishedAt, carried through for date-windowed growth) for up to RECENT_VIDEOS_FOR_METRICS recent video IDs. */
function fetchRecentVideoStats_(recentVideos) {
  const sample = recentVideos.slice(0, RECENT_VIDEOS_FOR_METRICS);
  const ids = sample.map(function (v) { return v.videoId; });
  if (!ids.length) return [];
  const key = ytApiKey_();
  const url = YT_API_BASE + '/videos?part=statistics,contentDetails&id=' + ids.join(',') + '&key=' + key;
  let data;
  try { data = ytFetch_(url); } catch (e) { return []; }
  if (!data.items) return [];
  const statsById = {};
  data.items.forEach(function (item) {
    statsById[item.id] = {
      views: Number(item.statistics.viewCount || 0),
      likes: Number(item.statistics.likeCount || 0),
      comments: Number(item.statistics.commentCount || 0),
      durationSeconds: parseIso8601DurationSeconds_(item.contentDetails && item.contentDetails.duration)
    };
  });
  // Preserve recentVideos' newest-first order, dropping any video stats didn't return (private/deleted).
  // videoId/title carried through (not just the raw numbers) so callers that
  // need to identify WHICH video: e.g. outreachDraftService.gs picking a
  // creator's best-performing recent upload to hook an email on: don't
  // need a second lookup.
  return sample
    .filter(function (v) { return statsById[v.videoId]; })
    .map(function (v) {
      const s = statsById[v.videoId];
      return {
        videoId: v.videoId, title: v.title, description: v.description, views: s.views, likes: s.likes,
        comments: s.comments, publishedAt: v.publishedAt, durationSeconds: s.durationSeconds,
        isShort: isLikelyShort_(s.durationSeconds)
      };
    });
}

/** Most common day-of-week + rough time-of-day from a channel's recent uploads. */
function computePostingTimePattern_(recentVideos) {
  if (!recentVideos.length) return 'n/a';
  const dayCounts = {}, bucketCounts = {};
  recentVideos.forEach(function (v) {
    const d = new Date(v.publishedAt);
    const day = Utilities.formatDate(d, getTimezone_(), 'EEE');
    const hour = Number(Utilities.formatDate(d, getTimezone_(), 'H'));
    const bucket = hour < 6 ? 'late night' : hour < 12 ? 'mornings' : hour < 18 ? 'afternoons' : 'evenings';
    dayCounts[day] = (dayCounts[day] || 0) + 1;
    bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
  });
  const topDay = Object.keys(dayCounts).sort(function (a, b) { return dayCounts[b] - dayCounts[a]; })[0];
  const topBucket = Object.keys(bucketCounts).sort(function (a, b) { return bucketCounts[b] - bucketCounts[a]; })[0];
  return 'Mostly ' + topDay + ', ' + topBucket;
}

/**
 * Growth momentum: videos published in the last GROWTH_RECENT_WINDOW_DAYS
 * vs. the GROWTH_RECENT_WINDOW_DAYS before that, by views. Date-windowed
 * rather than a raw count split: a count split means a daily poster's
 * "recent momentum" spans 2 weeks while a monthly poster's spans nearly
 * 2 years, which aren't measuring the same thing. Falls back to a
 * straight count-based half/half split when a channel posts too rarely
 * for either date window to have enough videos to compare: a fixed
 * window with an empty side isn't a comparison, it's noise. Returns a
 * 0-100 score, 50 = flat/no signal.
 */
function computeGrowthScore_(stats) {
  if (stats.length < 4) return 50; // not enough sample to say anything meaningful

  const now = Date.now();
  const recentCutoff = now - GROWTH_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const comparisonCutoff = now - (GROWTH_RECENT_WINDOW_DAYS * 2) * 24 * 60 * 60 * 1000;

  const newerByDate = stats.filter(function (s) { return new Date(s.publishedAt).getTime() >= recentCutoff; });
  const olderByDate = stats.filter(function (s) {
    const t = new Date(s.publishedAt).getTime();
    return t < recentCutoff && t >= comparisonCutoff;
  });

  const useDateWindows = newerByDate.length >= 2 && olderByDate.length >= 2;
  const mid = Math.floor(stats.length / 2);
  const newer = useDateWindows ? newerByDate : stats.slice(0, mid);
  const older = useDateWindows ? olderByDate : stats.slice(mid);

  const avg = function (arr) { return arr.reduce(function (s, v) { return s + v.views; }, 0) / arr.length; };
  const newerAvg = avg(newer), olderAvg = avg(older);
  if (olderAvg === 0) return newerAvg > 0 ? 100 : 50;
  const pctChange = ((newerAvg - olderAvg) / olderAvg) * 100;
  // Map -100%..+200% change onto a 0..100 score, clamped, centered at 50 for flat.
  return Math.max(0, Math.min(100, 50 + pctChange / 3));
}

function computeChannelAggregates_(recentVideos) {
  const allStats = fetchRecentVideoStats_(recentVideos);
  if (!allStats.length) {
    return { avgViews: 0, avgLikes: 0, avgComments: 0, engagementRatio: 0, postingPattern: computePostingTimePattern_(recentVideos), growthScore: 50 };
  }
  // Suggested rate and engagement are meant to describe a full-length
  // video (what a sponsor integration actually buys); Shorts get folded
  // back in only if a channel posts nothing else, so a Shorts-only
  // channel still gets real numbers instead of an empty result.
  const longFormStats = allStats.filter(function (v) { return !v.isShort; });
  const stats = longFormStats.length ? longFormStats : allStats;
  const sum = function (key) { return stats.reduce(function (s, v) { return s + v[key]; }, 0); };
  const n = stats.length;
  const avgViews = Math.round(sum('views') / n);
  const avgLikes = Math.round(sum('likes') / n);
  const avgComments = Math.round(sum('comments') / n);
  const engagementRatio = avgViews > 0 ? Math.round(((avgLikes + avgComments) / avgViews) * 1000) / 10 : 0;
  return {
    avgViews: avgViews, avgLikes: avgLikes, avgComments: avgComments, engagementRatio: engagementRatio,
    postingPattern: computePostingTimePattern_(recentVideos), growthScore: computeGrowthScore_(stats)
  };
}

/**
 * Reliability: how consistent is posting cadence, not just how often.
 * Coefficient of variation (stdDev / mean) of the gaps between consecutive
 * uploads: a channel posting every 7 days like clockwork scores higher
 * than one that posts 3 times in a week then goes dark for two months,
 * even if their average cadence is similar. 0-100, 50 = insufficient data.
 */
function computeReliabilityScore_(recentVideos) {
  if (recentVideos.length < 4) return 50;
  const dates = recentVideos.map(function (v) { return new Date(v.publishedAt).getTime(); }).sort(function (a, b) { return b - a; });
  const gaps = [];
  for (let i = 0; i < dates.length - 1; i++) gaps.push((dates[i] - dates[i + 1]) / (24 * 60 * 60 * 1000));
  const meanGap = gaps.reduce(function (s, g) { return s + g; }, 0) / gaps.length;
  if (meanGap === 0) return 100;
  const variance = gaps.reduce(function (s, g) { return s + Math.pow(g - meanGap, 2); }, 0) / gaps.length;
  const coefficientOfVariation = Math.sqrt(variance) / meanGap;
  return Math.max(0, Math.min(100, 100 - (coefficientOfVariation / 1.5) * 100));
}

/**
 * Commercial fit: how much confirmed sponsor history does this channel
 * have, from Koli's own Sponsors tab: a real, if indirect, signal of
 * monetization appeal. Zero deals isn't scored as "bad" (a new or
 * under-the-radar channel may just be undiscovered, not unsponsorable):
 * it's scored as neutral-low, not a penalty.
 */
function computeCommercialFitScore_(channelId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SPONSORS);
  if (!sheet || sheet.getLastRow() < 2) return 30;
  const ids = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  const dealCount = ids.filter(function (r) { return r[0] === channelId; }).length;
  if (dealCount === 0) return 30;
  if (dealCount <= 2) return 55;
  if (dealCount <= 5) return 75;
  return 95;
}

/**
 * Risk (higher score = LOWER risk, consistent with every other
 * component). Honestly a placeholder right now: comment authenticity is
 * the only risk-adjacent signal Koli currently has. This gets meaningfully
 * better once the dedicated brand-safety/compliance scan (Batch 3) exists
 * and can feed in real content-risk signals instead of just authenticity.
 */
function computeRiskScore_(authenticityScore) {
  return (authenticityScore === null || authenticityScore === undefined) ? 50 : authenticityScore * 10;
}

/** Engagement quality: blends comment authenticity with the actual engagement ratio: previously engagementRatio was computed but never fed into Grade at all. */
function computeEngagementQualityScore_(authenticityScore, engagementRatio) {
  const authPart = (authenticityScore === null || authenticityScore === undefined) ? 50 : authenticityScore * 10;
  const engPart = Math.max(0, Math.min(100, (engagementRatio / 6) * 100)); // benchmark: ~1% weak, ~3% good, ~6%+ excellent
  return (authPart + engPart) / 2;
}

function isTier1Audience_(locationString) {
  const lower = (locationString || '').toLowerCase();
  return TIER1_COUNTRY_HINTS.some(function (hint) { return lower.indexOf(hint) !== -1; });
}

/**
 * Weighted fraction of a composite's components backed by real, measured
 * signal rather than a neutral/placeholder fallback: e.g. Grade's
 * contentFit is always a flat 50 (nothing to measure it against yet), or
 * momentum/reliability fall back to neutral when there's too little
 * upload history to say anything. `realSignal` is {componentKey: boolean},
 * `weights` is the same weights object the composite itself was built
 * from (GRADE_WEIGHTS or BRAND_FIT_WEIGHTS): components not present in
 * realSignal count as not-real, so a caller can't silently under-report.
 */
function computeEvidenceCoverage_(realSignal, weights) {
  return Object.keys(weights).reduce(function (sum, key) {
    return sum + (realSignal[key] ? weights[key] : 0);
  }, 0);
}

/** coverageFraction: 0-1. See constants.gs's EVIDENCE_COVERAGE_BANDS for the thresholds. */
function classifyEvidenceCoverage_(coverageFraction) {
  const band = EVIDENCE_COVERAGE_BANDS.find(function (b) { return coverageFraction >= b.min; });
  return band ? band.label : EVIDENCE_COVERAGE_BANDS[EVIDENCE_COVERAGE_BANDS.length - 1].label;
}

/**
 * Composite Grade v2: 7 components (see constants.gs for weights).
 * Content fit is a flat neutral 50 right now: it's inherently relative to
 * a specific target niche/campaign ("fit for what?"), and Grade today is
 * computed once per channel with no target input: genuinely meaningless
 * to fake a real number here rather than admit that's unbuilt. Every
 * component's actual value is kept in the returned breakdown so the note
 * on the Grade cell shows real numbers, not just the final letter: and
 * now also an evidenceCoverage/confidence pair, so a grade built mostly
 * on fallbacks doesn't read as equally trustworthy as one that isn't.
 */
function computeGrade_(channelId, growthScore, authenticityScore, engagementRatio, audienceLocation, recentVideos) {
  const hasVideoSample = recentVideos.length >= 4; // mirrors computeGrowthScore_/computeReliabilityScore_'s own "not enough sample" threshold: approximated here since only the already-derived growthScore, not its raw stats count, reaches this function
  const hasAuthenticity = authenticityScore !== null && authenticityScore !== undefined;

  const components = {
    momentum: growthScore,
    engagementQuality: computeEngagementQualityScore_(authenticityScore, engagementRatio),
    commercialFit: computeCommercialFitScore_(channelId),
    reliability: computeReliabilityScore_(recentVideos),
    risk: computeRiskScore_(authenticityScore),
    audienceFit: isTier1Audience_(audienceLocation) ? 100 : 40,
    contentFit: 50 // placeholder: see comment above
  };
  const realSignal = {
    momentum: hasVideoSample,
    engagementQuality: hasAuthenticity,
    commercialFit: true, // always real Sponsors-sheet data, even when the honest answer is "zero deals found"
    reliability: hasVideoSample,
    risk: hasAuthenticity,
    audienceFit: false, // a binary Tier-1-country check is a crude proxy, not real audience data: see isTier1Audience_
    contentFit: false // always a flat neutral placeholder: see comment above
  };
  const composite = Object.keys(components).reduce(function (sum, key) {
    return sum + components[key] * GRADE_WEIGHTS[key];
  }, 0);
  const band = GRADE_BANDS.find(function (b) { return composite >= b.min; }) || GRADE_BANDS[GRADE_BANDS.length - 1];
  const evidenceCoverage = computeEvidenceCoverage_(realSignal, GRADE_WEIGHTS);
  return {
    letter: band.letter, score: Math.round(composite), components: components,
    evidenceCoverage: evidenceCoverage, confidence: classifyEvidenceCoverage_(evidenceCoverage)
  };
}
