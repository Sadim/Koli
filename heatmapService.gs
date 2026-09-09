/**
 * heatmapService.gs
 * Best-effort "Most Replayed" heatmap: the graph YouTube draws under the
 * seek bar showing which moments got rewatched most. Not the official
 * Data API (no endpoint exposes this); the watch page's server-rendered
 * HTML embeds it directly as a markersList / "MARKER_TYPE_HEATMAP" JSON
 * blob, reachable with a plain HTTP GET: same unofficial, always-fails-
 * soft category as captionsService.gs's timedtext calls, and verified
 * against a live watch page before writing this (older writeups reference
 * a "heatMarkerRenderer" key; that's moved: it's markersList now).
 *
 * Not every video has one: YouTube only draws it once a video has enough
 * views. No heatmap is a normal, expected result, not an error.
 */
function fetchVideoHeatmap_(videoId) {
  const cacheK = cacheKey_('heatmap', videoId);
  return withCache_(cacheK, function () {
    try {
      const url = 'https://www.youtube.com/watch?v=' + videoId;
      const resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' }
      });
      if (resp.getResponseCode() !== 200) return [];
      const html = resp.getContentText();

      const key = '"markersList":{"markerType":"MARKER_TYPE_HEATMAP","markers":';
      const idx = html.indexOf(key);
      if (idx === -1) return []; // no heatmap for this video: normal, not an error

      // The page isn't valid JSON as a whole, so bracket-match just the
      // markers array rather than trying to parse anything wider.
      const arrStart = idx + key.length;
      let depth = 0, i = arrStart;
      for (; i < html.length && depth >= 0; i++) {
        if (html[i] === '[') depth++;
        else if (html[i] === ']') { depth--; if (depth === 0) { i++; break; } }
      }
      const markers = JSON.parse(html.slice(arrStart, i));
      return markers.map(function (m) {
        return {
          startMillis: Number(m.startMillis || 0),
          durationMillis: Number(m.durationMillis || 0),
          intensity: Number(m.intensityScoreNormalized || 0)
        };
      });
    } catch (e) {
      return []; // wrong page shape, endpoint hiccup, YouTube changed the key again: fail soft, same as captions
    }
  }, DEFAULTS.CACHE_TTL_SECONDS);
}

/**
 * The very first marker is almost always the single highest-intensity
 * point on the whole graph: every viewer starts there, so it's not a
 * real signal about what specifically hooked people mid-video. Skipped
 * by default so the "peak" returned reflects an actual replay spike, not
 * just the intro everyone technically watched.
 */
function findHeatmapPeak_(markers, skipIntroMarkers) {
  const skip = skipIntroMarkers === undefined ? 1 : skipIntroMarkers;
  const candidates = markers.slice(skip);
  if (!candidates.length) return null;
  return candidates.reduce(function (best, m) { return m.intensity > best.intensity ? m : best; });
}
