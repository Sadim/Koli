/**
 * discoverService.gs
 * "Find channels/videos like this one." No official similarity API exists,
 * so this derives search keywords from the seed via Gemini, pulls a
 * candidate pool via search.list, scores each candidate against whichever
 * filters are enabled (with a tolerance margin — matches don't need to be
 * exact), and keeps the top N. This is the most expensive-per-run feature
 * in Koli by design (search.list plus per-candidate stat fetches) — that's
 * why the result count is hard-capped.
 */

function runDiscover(seedInput, searchType, resultCount, filters) {
  const cappedCount = Math.min(Number(resultCount) || DEFAULTS.DISCOVER_MAX_RESULTS, DEFAULTS.DISCOVER_MAX_RESULTS);

  const seed = loadSeed_(seedInput);
  const kw = deriveSearchKeywords_(seed.description, seed.titles);
  const excluded = getExcludedChannelIds_();

  let candidateIds = searchByKeywords_(kw.searchKeywords.length ? kw.searchKeywords : [seed.name || seedInput],
    searchType, DEFAULTS.DISCOVER_CANDIDATE_POOL)
    .filter(function (id) { return id !== seed.id; });

  if (searchType === 'channel') candidateIds = candidateIds.filter(function (id) { return !excluded.has(id); });

  if (!candidateIds.length) {
    return { count: 0, message: 'No candidates found for the derived keywords: ' + kw.searchKeywords.join(', ') };
  }

  const candidates = searchType === 'channel'
    ? scoreChannelCandidates_(candidateIds, seed, filters)
    : scoreVideoCandidates_(candidateIds, seed, filters, excluded);

  candidates.sort(function (a, b) { return b.score - a.score; });
  const top = candidates.slice(0, cappedCount);

  writeDiscoverResults(top, kw.searchKeywords.join(', '));
  const excludedNote = excluded.size ? ' (' + excluded.size + ' channel(s) on your do-not-contact list were skipped)' : '';
  return { count: top.length, message: top.length + ' result(s) written to Discover Results.' + excludedNote };
}

/** Channel IDs currently marked Passed or Do Not Contact on the Channels sheet. */
function getExcludedChannelIds_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const excluded = new Set();
  if (!sheet || sheet.getLastRow() < 2) return excluded;
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = actualHeaders.indexOf('ID') + 1;
  const outreachCol = actualHeaders.indexOf('Outreach') + 1;
  if (!idCol || !outreachCol) return excluded; // this layout has no ID or Outreach column — nothing to exclude by
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  data.forEach(function (row) {
    if (OUTREACH_EXCLUDE_FROM_DISCOVER.indexOf(row[outreachCol - 1]) !== -1) excluded.add(row[idCol - 1]);
  });
  return excluded;
}

function loadSeed_(seedInput) {
  const asChannel = parseChannelInput_(seedInput);
  const looksLikeVideo = /watch\?v=|youtu\.be\/|shorts\//.test(seedInput) || /^[\w-]{11}$/.test(seedInput.trim());

  if (looksLikeVideo && !/youtube\.com\/(channel|@|c\/|user\/)/.test(seedInput)) {
    const videoId = parseVideoInput_(seedInput);
    if (videoId) {
      const v = getVideoData(videoId, 20);
      return { id: v.channelId, name: v.channelTitle, description: v.description, titles: [v.title], video: v };
    }
  }
  const channelId = resolveChannelId(seedInput);
  const c = getChannelData(channelId);
  return { id: channelId, name: c.name, description: c.description, titles: c.recentVideos.map(function (v) { return v.title; }), channel: c };
}

/** Parses Settings' comma-joined region-code string into an array, e.g. "US,GB,CA,AU" -> ['US','GB','CA','AU']. Empty/unset returns []. */
function getDefaultTargetRegions_() {
  const raw = getProp_(PROP_KEYS.DEFAULT_TARGET_REGIONS, '');
  return raw.split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
}

function scoreChannelCandidates_(channelIds, seed, filters) {
  const seedChannel = seed.channel || getChannelData(seed.id);
  const seedAvgPosts = computeAvgPostsPerMonth_(seedChannel.recentVideos, Number(getProp_(PROP_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS)));

  // Default target regions (Settings) steer results toward those countries
  // whenever set — on by default, not a per-run toggle yet, so filters
  // doesn't need its own matchRegion flag; pass filters.matchRegion:false
  // to opt out of even the configured default for one run.
  const targetRegions = getDefaultTargetRegions_();
  const regionCheckActive = targetRegions.length && filters.matchRegion !== false;

  const candidates = channelIds.map(function (id) {
    try { return getChannelData(id); } catch (e) { return null; }
  }).filter(Boolean);

  // Batch-fetch stats for up to 5 recent videos per candidate to get avg views/engagement.
  const videoIdBatches = {};
  candidates.forEach(function (c) { videoIdBatches[c.channelId] = c.recentVideos.slice(0, 5).map(function (v) { return v.videoId; }); });
  const allVideoIds = Object.keys(videoIdBatches).reduce(function (acc, k) { return acc.concat(videoIdBatches[k]); }, []);
  const statsById = batchVideoStats_(allVideoIds);

  const seedEngagement = estimateSeedEngagement_(seed);

  return candidates.map(function (c) {
    const vids = videoIdBatches[c.channelId].map(function (id) { return statsById[id]; }).filter(Boolean);
    const avgViews = vids.length ? vids.reduce(function (s, v) { return s + v.views; }, 0) / vids.length : 0;
    const avgEngagement = vids.length
      ? vids.reduce(function (s, v) { return s + (v.views > 0 ? ((v.likes + v.comments) / v.views) * 100 : 0); }, 0) / vids.length
      : 0;
    const postsPerMonth = computeAvgPostsPerMonth_(c.recentVideos, Number(getProp_(PROP_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS)));

    const score = scoreCandidate_({
      textToMatch: c.name + ' ' + c.description,
      seedKeywordsText: seed.description,
      numericChecks: [
        filters.matchEngagement ? { value: avgEngagement, target: seedEngagement } : null,
        filters.matchPostsPerMonth ? { value: postsPerMonth, target: seedAvgPosts } : null,
        filters.matchViews && (filters.viewsMin || filters.viewsMax)
          ? { value: avgViews, min: filters.viewsMin, max: filters.viewsMax } : null
      ].filter(Boolean),
      categoricalChecks: regionCheckActive ? [{ value: c.country, allowedValues: targetRegions }] : [],
      matchKeywords: filters.matchKeywords, matchNiche: filters.matchNiche
    });

    return {
      type: 'Channel', name: c.name, url: channelUrl_(c.channelId), channel: '',
      subsOrViews: c.subCount, postsPerMonth: postsPerMonth,
      engagement: Math.round(avgEngagement * 10) / 10, score: score
    };
  });
}

/**
 * No default-region steering here (unlike scoreChannelCandidates_) — a
 * video candidate's channel country isn't in the data this already
 * fetches (getVideoData's snippet has no country field, only the channel
 * resource does), and fetching it would mean one more API call per
 * candidate. Stated plainly rather than silently skipped.
 */
function scoreVideoCandidates_(videoIds, seed, filters) {
  const statsById = batchVideoStats_(videoIds);
  const details = {};
  videoIds.forEach(function (id) {
    try { details[id] = getVideoData(id, 5); } catch (e) { /* skip unavailable */ }
  });

  const seedEngagement = estimateSeedEngagement_(seed);

  return videoIds.filter(function (id) { return statsById[id] && details[id]; }).map(function (id) {
    const stat = statsById[id];
    const v = details[id];
    const engagement = v.views > 0 ? ((v.likes + v.commentCount) / v.views) * 100 : 0;

    const score = scoreCandidate_({
      textToMatch: v.title + ' ' + v.description,
      seedKeywordsText: seed.description,
      numericChecks: [
        filters.matchEngagement ? { value: engagement, target: seedEngagement } : null,
        filters.matchViews && (filters.viewsMin || filters.viewsMax)
          ? { value: v.views, min: filters.viewsMin, max: filters.viewsMax } : null
      ].filter(Boolean),
      matchKeywords: filters.matchKeywords, matchNiche: filters.matchNiche
    });

    return {
      type: 'Video', name: v.title, url: videoUrl_(id), channel: v.channelTitle,
      subsOrViews: v.views, postsPerMonth: '', engagement: Math.round(engagement * 10) / 10, score: score
    };
  });
}

function batchVideoStats_(videoIds) {
  const key = ytApiKey_();
  const unique = Array.from(new Set(videoIds));
  const chunks = chunk_(unique, DEFAULTS.MAX_BATCH_ITEMS);
  const urls = chunks.map(function (c) { return YT_API_BASE + '/videos?part=statistics&id=' + c.join(',') + '&key=' + key; });
  const results = ytFetchAll_(urls);
  const byId = {};
  results.forEach(function (data) {
    if (!data || !data.items) return;
    data.items.forEach(function (item) {
      byId[item.id] = {
        views: Number(item.statistics.viewCount || 0),
        likes: Number(item.statistics.likeCount || 0),
        comments: Number(item.statistics.commentCount || 0)
      };
    });
  });
  return byId;
}

function estimateSeedEngagement_(seed) {
  if (seed.video) {
    return seed.video.views > 0 ? ((seed.video.likes + seed.video.commentCount) / seed.video.views) * 100 : 3;
  }
  return 3; // no per-video stats cheaply available for a channel seed — use category baseline
}

/**
 * Combines keyword/niche text overlap with margin-scored numeric checks
 * into one 0-1 score. "Not too strict" = numeric checks score partial
 * credit within DEFAULTS.MATCH_MARGIN rather than pass/fail.
 */
function scoreCandidate_(opts) {
  const parts = [];

  if (opts.matchKeywords || opts.matchNiche) {
    const seedWords = normalizeWords_(opts.seedKeywordsText).slice(0, 30);
    const candidateWords = normalizeWords_(opts.textToMatch);
    const overlap = seedWords.filter(function (w) { return candidateWords.indexOf(w) !== -1; }).length;
    parts.push(seedWords.length ? overlap / seedWords.length : 0.5);
  }

  opts.numericChecks.forEach(function (check) {
    if (check.target !== undefined) {
      const target = check.target || 1;
      const diff = Math.abs(check.value - target) / target;
      parts.push(Math.max(0, 1 - diff / DEFAULTS.MATCH_MARGIN));
    } else {
      const min = check.min || 0, max = check.max || Infinity;
      if (check.value >= min && check.value <= max) parts.push(1);
      else {
        const nearest = check.value < min ? min : max;
        const diff = nearest === 0 ? 1 : Math.abs(check.value - nearest) / nearest;
        parts.push(Math.max(0, 1 - diff / DEFAULTS.MATCH_MARGIN));
      }
    }
  });

  // Categorical (non-numeric) checks — currently just target-region
  // matching. A candidate with no known value for the field is scored
  // neutral, not penalized: most YouTube channels never set their
  // declared country, so "unknown" is the common case, not a red flag.
  // A KNOWN value outside the allowed list scores low — the whole point
  // is to actively steer results toward the configured regions, not just
  // mildly prefer them.
  (opts.categoricalChecks || []).forEach(function (check) {
    if (!check.value) { parts.push(0.5); return; }
    parts.push(check.allowedValues.indexOf(check.value) !== -1 ? 1 : 0.15);
  });

  if (!parts.length) return 1; // no filters enabled — everything found is a "match"
  return Math.round((parts.reduce(function (a, b) { return a + b; }, 0) / parts.length) * 100) / 100;
}
