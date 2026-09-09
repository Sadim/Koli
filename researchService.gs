/**
 * researchService.gs
 * Free, no-API-key cross-platform research signal: currently just
 * Reddit. Conceptually borrowed from last30days-skill's approach: the
 * plain reddit.com/search.json endpoint is unreliable for scripted
 * access, so this uses old.reddit.com's RSS search feed with a real
 * User-Agent instead. Same honesty rule as the captions endpoint: this
 * is an unofficial access path that can degrade or stop working without
 * notice, so every caller treats an empty result as "no signal found,"
 * not "no controversy exists."
 */

function searchRedditMentions_(query, limit) {
  const cacheK = cacheKey_('reddit', query + ':' + (limit || 10));
  return withCache_(cacheK, function () {
    try {
      const url = 'https://old.reddit.com/search.rss?q=' + encodeURIComponent(query) +
        '&sort=new&limit=' + (limit || 10);
      const resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'KoliBrandSafetyCheck/1.0 (internal research tool)' }
      });
      if (resp.getResponseCode() !== 200) return [];

      const xml = resp.getContentText();
      const doc = XmlService.parse(xml);
      const atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
      const entries = doc.getRootElement().getChildren('entry', atomNs);

      return entries.slice(0, limit || 10).map(function (e) {
        const linkEl = e.getChild('link', atomNs);
        const publishedEl = e.getChild('published', atomNs);
        return {
          title: e.getChild('title', atomNs).getText(),
          link: linkEl ? linkEl.getAttribute('href').getValue() : '',
          published: publishedEl ? publishedEl.getText() : ''
        };
      });
    } catch (e) {
      return [];
    }
  }, 3600); // 1 hour: this is a point-in-time signal, don't cache as long as YouTube data
}

/**
 * Brand-safety signal check: recent Reddit mentions of a creator/brand
 * name, scanned by Gemini for controversy/scandal/scam-accusation
 * language. Accepts either a plain name or a channel link (resolves the
 * channel name first).
 */
function checkBrandSafety(nameOrChannelInput) {
  let queryName = nameOrChannelInput;
  try {
    const channelId = resolveChannelId(nameOrChannelInput);
    queryName = getChannelData(channelId).name;
  } catch (e) {
    // Not a resolvable channel link: treat the input as a literal name.
  }

  const mentions = searchRedditMentions_(queryName, 10);
  if (!mentions.length) {
    return {
      name: queryName, mentionCount: 0, flagged: false,
      summary: 'No recent Reddit mentions found for "' + queryName + '": could mean no controversy, ' +
        'or just low Reddit visibility. Not proof either way.'
    };
  }

  const titles = mentions.map(function (m) { return m.title; }).join('\n');
  const prompt =
    'Below are recent Reddit post titles mentioning "' + queryName + '". Flag whether any suggest ' +
    'controversy, scandal, scam accusations, or reputational risk relevant to a brand considering ' +
    'sponsoring this creator or brand. Do not flag neutral or positive mentions. Respond as JSON: ' +
    '{"flagged": <bool>, "reason": "<one sentence, empty string if not flagged>"}.\n\n' + titles;

  const result = geminiCallJson_(prompt);

  return {
    name: queryName,
    mentionCount: mentions.length,
    flagged: !!result.flagged,
    summary: result.flagged
      ? ('Possible concern (' + mentions.length + ' recent mention(s) reviewed): ' + result.reason)
      : ('No obvious red flags in ' + mentions.length + ' recent Reddit mention(s) reviewed.'),
    topMentions: mentions.slice(0, 3)
  };
}
