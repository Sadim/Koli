/**
 * sponsorBlockService.gs
 * SponsorBlock (sponsor.ajay.app): free, open-source, crowdsourced
 * database of human-verified sponsor segment timestamps for YouTube
 * videos. When it has data for a video, it's a strictly better signal
 * than Gemini guessing from a description: real viewers marked the exact
 * in/out points, not an LLM inferring from text.
 *
 * Coverage caveat, stated plainly: this only has data for videos real
 * SponsorBlock users have actually watched and submitted. A small niche
 * channel may have zero coverage: that's not a bug, that's why this is
 * "check first, fall back to Gemini," never a full replacement.
 *
 * This is an external, unofficial-for-our-purposes API (not built for
 * server-side bulk lookups, though publicly documented): same honesty
 * rule as the captions endpoint: fails soft, never blocks a row.
 */

const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api/skipSegments';

/** Returns [{start, end, votes}], highest-voted first, or [] if no coverage. */
function getSponsorBlockSegments_(videoId) {
  const cacheK = cacheKey_('sponsorblock', videoId);
  return withCache_(cacheK, function () {
    try {
      const url = SPONSORBLOCK_API + '?videoID=' + encodeURIComponent(videoId) + '&category=sponsor';
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code = resp.getResponseCode();
      if (code !== 200) return []; // 404 = no submissions for this video, not an error
      const data = JSON.parse(resp.getContentText());
      if (!Array.isArray(data)) return [];
      return data
        .filter(function (seg) { return seg.segment && seg.segment.length === 2; })
        .map(function (seg) { return { start: seg.segment[0], end: seg.segment[1], votes: seg.votes || 0 }; })
        .sort(function (a, b) { return b.votes - a.votes; });
    } catch (e) {
      return [];
    }
  }, DEFAULTS.CACHE_TTL_SECONDS);
}

/** Best (highest-voted) segment's start time, formatted mm:ss / h:mm:ss: or null if no coverage. */
function getBestSponsorBlockTimestamp_(videoId) {
  const segments = getSponsorBlockSegments_(videoId);
  return segments.length ? formatSeconds_(segments[0].start) : null;
}
