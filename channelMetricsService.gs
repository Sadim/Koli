/**
 * channelMetricsService.gs
 * Channel-level aggregates computed from a sample of recent videos —
 * separate from per-video Channel/Video/Profile analysis, since these
 * numbers only make sense averaged across a channel's recent output.
 *
 * Grade formula (documented plainly since it's a judgment call, not a
 * standard metric): growth momentum matters most — a small channel with
 * real upward momentum should outscore a large stagnant one — quality
 * (comment authenticity) second, Tier-1 English-market audience a
 * smaller bonus on top. Weights live in constants.gs (GRADE_WEIGHTS),
 * tune there if the balance feels wrong once there's real data to judge it against.
 */

/** Batch-fetches views/likes/commentCount (+ publishedAt, carried through for date-windowed growth) for up to RECENT_VIDEOS_FOR_METRICS recent video IDs. */
function fetchRecentVideoStats_(recentVideos) {
  const sample = recentVideos.slice(0, RECENT_VIDEOS_FOR_METRICS);
  const ids = sample.map(function (v) { return v.videoId; });
  if (!ids.length) return [];
  const key = ytApiKey_();
  const url = YT_API_BASE + '/videos?part=statistics&id=' + ids.join(',') + '&key=' + key;
  let data;
  try { data = ytFetch_(url); } catch (e) { return []; }
  if (!data.items) return [];
  const statsById = {};
  data.items.forEach(function (item) {
    statsById[item.id] = {
      views: Number(item.statistics.viewCount || 0),
      likes: Number(item.statistics.likeCount || 0),
      comments: Number(item.statistics.commentCount || 0)
    };
  });
  // Preserve recentVideos' newest-first order, dropping any video stats didn't return (private/deleted).
  return sample
    .filter(function (v) { return statsById[v.videoId]; })
    .map(function (v) {
      const s = statsById[v.videoId];
      return { views: s.views, likes: s.likes, comments: s.comments, publishedAt: v.publishedAt };
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
 * rather than a raw count split — a count split means a daily poster's
 * "recent momentum" spans 2 weeks while a monthly poster's spans nearly
 * 2 years, which aren't measuring the same thing. Falls back to a
 * straight count-based half/half split when a channel posts too rarely
 * for either date window to have enough videos to compare — a fixed
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
  const stats = fetchRecentVideoStats_(recentVideos);
  if (!stats.length) {
    return { avgViews: 0, avgLikes: 0, avgComments: 0, engagementRatio: 0, postingPattern: computePostingTimePattern_(recentVideos), growthScore: 50 };
  }
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
 * uploads — a channel posting every 7 days like clockwork scores higher
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
 * have, from Koli's own Sponsors tab — a real, if indirect, signal of
 * monetization appeal. Zero deals isn't scored as "bad" (a new or
 * under-the-radar channel may just be undiscovered, not unsponsorable) —
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
 * component). Honestly a placeholder right now — comment authenticity is
 * the only risk-adjacent signal Koli currently has. This gets meaningfully
 * better once the dedicated brand-safety/compliance scan (Batch 3) exists
 * and can feed in real content-risk signals instead of just authenticity.
 */
function computeRiskScore_(authenticityScore) {
  return (authenticityScore === null || authenticityScore === undefined) ? 50 : authenticityScore * 10;
}

/** Engagement quality: blends comment authenticity with the actual engagement ratio — previously engagementRatio was computed but never fed into Grade at all. */
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
 * Composite Grade v2 — 7 components (see constants.gs for weights).
 * Content fit is a flat neutral 50 right now: it's inherently relative to
 * a specific target niche/campaign ("fit for what?"), and Grade today is
 * computed once per channel with no target input — genuinely meaningless
 * to fake a real number here rather than admit that's unbuilt. Every
 * component's actual value is kept in the returned breakdown so the note
 * on the Grade cell shows real numbers, not just the final letter.
 */
function computeGrade_(channelId, growthScore, authenticityScore, engagementRatio, audienceLocation, recentVideos) {
  const components = {
    momentum: growthScore,
    engagementQuality: computeEngagementQualityScore_(authenticityScore, engagementRatio),
    commercialFit: computeCommercialFitScore_(channelId),
    reliability: computeReliabilityScore_(recentVideos),
    risk: computeRiskScore_(authenticityScore),
    audienceFit: isTier1Audience_(audienceLocation) ? 100 : 40,
    contentFit: 50 // placeholder — see comment above
  };
  const composite = Object.keys(components).reduce(function (sum, key) {
    return sum + components[key] * GRADE_WEIGHTS[key];
  }, 0);
  const band = GRADE_BANDS.find(function (b) { return composite >= b.min; }) || GRADE_BANDS[GRADE_BANDS.length - 1];
  return { letter: band.letter, score: Math.round(composite), components: components };
}
