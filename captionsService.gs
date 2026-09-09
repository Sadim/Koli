/**
 * captionsService.gs
 * Best-effort in-video timestamps for sponsor mentions. Uses YouTube's
 * public timedtext endpoint — no video download, no transcription model,
 * just an HTTP GET. This endpoint is unofficial/undocumented: it can
 * return nothing (no captions available) or change behavior without
 * notice. Always fails soft — a missing timestamp never blocks a row.
 * Gated behind Settings > "Attempt in-video timestamp" since it adds a
 * network round trip and a text-matching pass per sponsor mention found.
 */

/**
 * Returns [{startSeconds, text}] or [] if no captions are available.
 */
function fetchCaptionLines_(videoId) {
  const cacheK = cacheKey_('captions', videoId);
  return withCache_(cacheK, function () {
    try {
      const url = 'https://www.youtube.com/api/timedtext?lang=en&v=' + videoId;
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return [];
      const xml = resp.getContentText();
      if (!xml || xml.indexOf('<text') === -1) return [];

      const doc = XmlService.parse(xml);
      const textElements = doc.getRootElement().getChildren('text');
      return textElements.map(function (el) {
        const start = Number(el.getAttribute('start') ? el.getAttribute('start').getValue() : 0);
        const raw = el.getText() || '';
        const decoded = raw.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&').replace(/<[^>]+>/g, '');
        return { startSeconds: start, text: decoded };
      });
    } catch (e) {
      return []; // no captions, wrong format, or endpoint hiccup — fail soft
    }
  }, DEFAULTS.CACHE_TTL_SECONDS);
}

/**
 * Best-effort match: finds the caption line with the most word overlap
 * against the sponsor evidence text, and returns its timestamp formatted
 * as mm:ss (or h:mm:ss for long videos). Returns null if no captions or
 * no reasonable match found.
 */
function findSponsorTimestamp_(videoId, evidenceText) {
  const lines = fetchCaptionLines_(videoId);
  if (!lines.length || !evidenceText) return null;

  const evidenceWords = normalizeWords_(evidenceText);
  if (!evidenceWords.length) return null;

  let bestScore = 0, bestLine = null;
  lines.forEach(function (line) {
    const lineWords = normalizeWords_(line.text);
    const overlap = evidenceWords.filter(function (w) { return lineWords.indexOf(w) !== -1; }).length;
    const score = overlap / evidenceWords.length;
    if (score > bestScore) { bestScore = score; bestLine = line; }
  });

  // Require at least a third of the evidence words to show up in one
  // caption line — below that, it's noise, not a real match.
  if (!bestLine || bestScore < 0.34) return null;
  return formatSeconds_(bestLine.startSeconds);
}

/**
 * Caption text from around one specific moment, not a generic sample of
 * the whole video — used to build an outreach hook on the exact segment a
 * heatmap identified as a replay spike (heatmapService.gs), where the
 * point is "what happens right here," not "what's this video about."
 * Falls back to the nearest available lines if nothing falls inside the
 * window (auto-caption timing can drift a few seconds from the real
 * heatmap timestamp).
 */
function excerptAroundTimestamp_(lines, centerSeconds, windowSeconds, maxChars) {
  if (!lines.length) return '';
  const nearby = lines.filter(function (l) { return Math.abs(l.startSeconds - centerSeconds) <= windowSeconds; });
  const chosen = nearby.length ? nearby : lines.slice().sort(function (a, b) {
    return Math.abs(a.startSeconds - centerSeconds) - Math.abs(b.startSeconds - centerSeconds);
  }).slice(0, 5);
  const text = chosen.map(function (l) { return l.text; }).join(' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, maxChars);
}

function normalizeWords_(text) {
  return (text || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
    .filter(function (w) { return w.length > 3; }); // skip short/common words
}

function formatSeconds_(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return h > 0 ? (h + ':' + pad(m) + ':' + pad(sec)) : (m + ':' + pad(sec));
}
