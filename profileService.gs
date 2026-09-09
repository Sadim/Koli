/**
 * profileService.gs
 * One row per video, for one channel, across a date range. Shared build
 * logic between a manual Profile run and "Refresh Tracked Profiles."
 */

// Apps Script hard-caps any single execution at 6 minutes. Stopping well
// before that leaves room for the rest of the function (writing the
// result, updating tracking) to finish cleanly instead of hard-crashing
// mid-loop with "Exceeded maximum execution time": which also meant
// updateTrackedLastRun_ never ran, so a naive re-run reprocessed
// everything from scratch and hit the same wall again.
const PROFILE_TIME_BUDGET_MS = 4.5 * 60 * 1000;

function runProfile(rawInput, startDate, endDate, mode, track) {
  const channelId = resolveChannelId(rawInput);
  const channel = getChannelData(channelId);

  if (mode === 'replace') clearProfileRowsForChannel_(channelId);

  const videos = getVideosInDateRange(channelId, startDate, endDate);
  const profileSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PROFILE);
  const videoIdCol = PROFILE_HEADERS.indexOf('Video ID') + 1;
  const alreadyDone = profileSheet ? new Set(
    profileSheet.getRange(2, videoIdCol, Math.max(profileSheet.getLastRow() - 1, 0), 1).getValues()
      .map(function (r) { return r[0]; }).filter(function (id) { return id; })
  ) : new Set();

  let written = 0, errors = 0, skippedAlreadyDone = 0, stoppedEarly = false;
  const startTime = Date.now();

  for (let i = 0; i < videos.length; i++) {
    if (Date.now() - startTime > PROFILE_TIME_BUDGET_MS) { stoppedEarly = true; break; }
    const v = videos[i];
    if (mode !== 'replace' && alreadyDone.has(v.videoId)) { skippedAlreadyDone++; continue; }
    try {
      buildAndWriteProfileEntry_(channelId, channel, v.videoId);
      written++;
    } catch (e) {
      errors++;
    }
  }

  if (track) setChannelTracked_(channelId, channel.name, new Date(startDate));
  if (!stoppedEarly) updateTrackedLastRun_(channelId, new Date(endDate));

  return {
    ok: true, channelName: channel.name, written: written, errors: errors, total: videos.length,
    skippedAlreadyDone: skippedAlreadyDone, stoppedEarly: stoppedEarly
  };
}

function refreshTrackedProfiles() {
  const tracked = getTrackedProfiles_();
  const results = [];
  tracked.forEach(function (t) {
    try {
      const channel = getChannelData(t.channelId);
      const since = t.lastRun ? new Date(t.lastRun) : new Date(t.startDate);
      const videos = getVideosInDateRange(t.channelId, since, new Date());
      let written = 0;
      videos.forEach(function (v) {
        try { buildAndWriteProfileEntry_(t.channelId, channel, v.videoId); written++; } catch (e) { /* skip row */ }
      });
      updateTrackedLastRun_(t.channelId, new Date());
      results.push({ channel: channel.name, newVideos: written });
    } catch (e) {
      results.push({ channel: t.channelName, error: e.message });
    }
  });
  return results;
}

function buildAndWriteProfileEntry_(channelId, channel, videoId) {
  const sampleSize = Number(getProp_(PROP_KEYS.COMMENT_SAMPLE_SIZE, DEFAULTS.COMMENT_SAMPLE_SIZE));
  const video = getVideoData(videoId, sampleSize);
  const enrichment = enrichVideo_(video);
  const engagementRatio = video.views > 0 ? Math.round(((video.likes + video.commentCount) / video.views) * 1000) / 10 : 0;
  // Approximation: matches niche keywords against the raw channel description
  // rather than a Gemini-derived niche label, to avoid one more call per video.
  const cpm = estimateCPM(channel.description, channel.subCount, engagementRatio);
  const aboutSummary = getChannelAboutSummaryCached_(channelId, channel.description, channel.recentVideos);

  recordSubscriberSnapshot_(channelId, channel.subCount);
  const subDelta = getNewSubscribersSince_(channelId, channel.subCount);

  let sponsorBrand = '', sponsorMentionTs = '';
  const sbSegments = getSponsorBlockSegments_(videoId);
  if (enrichment.sponsors.length || sbSegments.length) {
    recordSponsorMentions(channelId, channel.name, video, enrichment.sponsors);
    sponsorBrand = enrichment.sponsors.length
      ? enrichment.sponsors.map(function (s) { return s.brand; }).join(', ')
      : 'Unknown (SponsorBlock-confirmed)';

    if (sbSegments.length) {
      sponsorMentionTs = formatSeconds_(sbSegments[0].start) + ' (verified)';
    } else if (getBoolProp_(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, false) && enrichment.sponsors.length) {
      const ts = findSponsorTimestamp_(videoId, enrichment.sponsors[0].evidence || enrichment.sponsors[0].brand);
      sponsorMentionTs = ts ? (ts + ' (estimated)') : '';
    }
  }

  writeProfileRow({
    videoId: videoId, videoTitle: video.title, channelId: channelId, channelName: channel.name,
    channelAboutSummary: aboutSummary, publishedAt: video.publishedAt,
    views: video.views, likes: video.likes, commentCount: video.commentCount,
    authenticity: enrichment.authenticity, engagementRatio: engagementRatio, cpm: cpm,
    sponsorBrand: sponsorBrand, sponsorMentionTs: sponsorMentionTs,
    audience: enrichment.audience, subDelta: subDelta
  });
}
