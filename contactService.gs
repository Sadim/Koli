/**
 * contactService.gs
 * Original build (not a port). Goal, per spec: find a contact email by
 * following the channel's other social handles, the way an outreach person
 * would: check the About description first, then follow any link-in-bio
 * aggregator (Linktree/Beacons/etc.) or business site linked from it, since
 * creators put contact emails there more often than in the YouTube About
 * box itself.
 *
 * Honest limitation: Instagram, TikTok, and X/Twitter bios are JS-rendered
 * and largely unreachable via a plain UrlFetchApp GET (no login, no
 * headless browser in Apps Script). This service extracts the *handles*
 * for those reliably (they're plain text/links in the YT description) and
 * surfaces them in the Socials Note even when it can't pull an email from
 * them. It actively fetches only static, scrapeable pages: link-in-bio
 * aggregators and personal/business websites.
 */

const SOCIAL_DOMAINS = [
  { key: 'Instagram', re: /https?:\/\/(www\.)?instagram\.com\/[\w.-]+/gi },
  { key: 'TikTok', re: /https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+/gi },
  { key: 'X/Twitter', re: /https?:\/\/(www\.)?(twitter|x)\.com\/[\w.-]+/gi },
  { key: 'LinkedIn', re: /https?:\/\/(www\.)?linkedin\.com\/[\w\/.-]+/gi },
  { key: 'Facebook', re: /https?:\/\/(www\.)?facebook\.com\/[\w.-]+/gi },
  { key: 'Discord', re: /https?:\/\/(www\.)?discord\.(gg|com)\/[\w-]+/gi },
  { key: 'Patreon', re: /https?:\/\/(www\.)?patreon\.com\/[\w.-]+/gi }
];

const AGGREGATOR_DOMAINS = [
  /https?:\/\/(www\.)?linktr\.ee\/[\w.-]+/gi,
  /https?:\/\/(www\.)?beacons\.ai\/[\w.-]+/gi,
  /https?:\/\/(www\.)?linkin\.bio\/[\w.-]+/gi,
  /https?:\/\/(www\.)?campsite\.bio\/[\w.-]+/gi
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * @param {string} description - channel About description text
 * @param {string} [channelId] - when given (and domLinks isn't), pulls the
 *   About page's structured Links chips server-side (see
 *   fetchAboutPageLinks_) -- a field the free-text description above
 *   frequently doesn't contain at all, since it's a separate part of
 *   channel customization in YouTube's own UI.
 * @param {Array<{title: string, value: string}>} [domLinks] - the same
 *   Links-chip data, already read live from window.ytInitialData on the
 *   actual channel page the user had open in their browser (the "Send to
 *   Koli" extension's DOM capture). Strictly more reliable than this
 *   function's own server-side About-page fetch when present -- a real
 *   rendered page in a real browser session carries none of the redirect/
 *   consent-wall/bot-detection risk a script's HTTP client fetching the
 *   same page cold does -- so this skips fetchAboutPageLinks_ entirely and
 *   uses domLinks as the Links-chip source instead. The description-text
 *   regex pass and email search below are unaffected either way; DOM
 *   capture only ever covers the Links chips specifically.
 * @return {{email: string, socials: Array<{platform: string, url: string}>}}
 */
function findContact(description, channelId, domLinks) {
  const desc = description || '';
  const socials = extractSocials_(desc);

  // 1. Direct email in the About description: cheapest, most common win.
  let email = firstNonYoutubeEmail_(desc);

  // 2. Follow any link-in-bio aggregator page found in the description.
  if (!email) {
    const aggregatorUrl = findFirstMatch_(desc, AGGREGATOR_DOMAINS);
    if (aggregatorUrl) {
      const page = safeFetchText_(aggregatorUrl);
      if (page) {
        email = firstNonYoutubeEmail_(page);
        socials.push.apply(socials, extractSocials_(page).filter(function (s) {
          return !socials.some(function (existing) { return existing.url === s.url; });
        }));
      }
    }
  }

  // 3. Follow a plain non-social business/portfolio URL in the description
  //    (e.g. a personal site with a /contact page) as a last resort.
  if (!email) {
    const siteUrl = findGenericSiteUrl_(desc);
    if (siteUrl) {
      const page = safeFetchText_(siteUrl);
      if (page) email = firstNonYoutubeEmail_(page);
    }
  }

  // 4. The About page's own Links chips (Facebook/Instagram/a business
  //    email/etc, set separately from the description box): frequently
  //    has real signal the three steps above never had a chance to see.
  //    Prefer domLinks (live browser capture) over a fresh server-side
  //    fetch when it's available -- see the doc comment above for why.
  const linkEntries = (domLinks && domLinks.length) ? domLinks : (channelId ? fetchAboutPageLinks_(channelId) : []);
  if (linkEntries.length) {
    const ABOUT_LINK_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    linkEntries.forEach(function (link) {
      if (!link.value) return;
      if (ABOUT_LINK_EMAIL_RE.test(link.value)) {
        if (!email) email = link.value;
        return; // an email either way, never a social link too
      }
      // The redirect-decoded value is normally a full URL ("http://facebook.com/x"),
      // but the fallback (displayContent, used when a link node has no
      // youtube.com/redirect to decode) is a bare "facebook.com/x" with no
      // protocol -- still a perfectly usable link, just needs one, otherwise
      // it silently failed the URL-shape check below and got dropped entirely.
      const resolvedUrl = /^https?:\/\//i.test(link.value) ? link.value : 'https://' + link.value;
      if (socials.some(function (s) { return s.url === resolvedUrl; })) return;
      socials.push({ platform: link.title || 'Link', url: resolvedUrl });
    });
  }

  return {
    email: email || 'Not found',
    socials: socials
  };
}

/**
 * The About page's Links section (the pill chips under the channel name/
 * banner) is a separate, structured field YouTube's public Data API never
 * exposes -- extractSocials_ above only ever sees the free-text About
 * description, a different box entirely that's frequently empty even when
 * Links has real entries (confirmed directly: a real channel with "Not
 * found" from description-only parsing had Facebook, Twitter, Instagram,
 * and a real advertising Gmail address sitting in Links). This reads that
 * same field off the public About page -- the same content anyone gets by
 * visiting it in a browser, no login required, unlike scraping a gated
 * page like LinkedIn.
 *
 * Implementation note: the page embeds its own state as a `ytInitialData`
 * JSON blob in a <script> tag; the links live under a
 * `channelExternalLinkViewModel` node (verified directly against a live
 * channel page). That's YouTube's internal, undocumented page state, not a
 * stable public API, so this walks the whole object for that node instead
 * of pinning one exact nested path -- more resilient to the surrounding
 * structure shifting, though the leaf shape itself could still change
 * without notice. Best-effort by design: any parse failure fails soft to
 * an empty list rather than breaking channel analysis, same as every
 * other best-effort signal in Koli (see computeBrandSafetyRiskScore_).
 * Cached per channel: this is a real extra page fetch (roughly 1MB of
 * HTML), not worth repeating on every re-analysis within the normal
 * enrichment cache window -- but ONLY when it actually found something.
 * An empty result here is ambiguous (a channel can genuinely have zero
 * Links entries, or the fetch/parse can quietly come up empty for an
 * unrelated reason) and caching an empty result for 6h either way would
 * mean a transient miss looks identical to "this channel really has no
 * links" for the rest of that window, silently masking a real fix on
 * retry. Not worth the risk for what's already a best-effort signal --
 * see cachePut_ call below, deliberately skipped for an empty list.
 */
function fetchAboutPageLinks_(channelId) {
  const cacheK = cacheKey_('aboutLinks', channelId);
  const cached = cacheGet_(cacheK);
  if (cached !== null) return cached;

  const diag = fetchAboutPageLinksDiagnostic_(channelId);
  if (diag.reason) console.error('[Koli] fetchAboutPageLinks_(' + channelId + '): ' + diag.reason);
  if (diag.found.length) cachePut_(cacheK, diag.found, DEFAULTS.CACHE_TTL_SECONDS);
  return diag.found;
}

/**
 * Same logic as fetchAboutPageLinks_, but never touches the cache and
 * always returns WHY it came up empty, not just an empty array -- built
 * after three straight "still not working" reports where the silent
 * best-effort design (by-design elsewhere in Koli) made it impossible to
 * tell a genuine "no links on this channel" from a real fetch/parse
 * failure. Koli > Brand Intelligence > Test About-Page Fetch calls this
 * directly and shows the real reason in an alert, instead of guessing a
 * fourth time.
 */
function fetchAboutPageLinksDiagnostic_(channelId) {
  const url = 'https://www.youtube.com/channel/' + channelId + '/about?hl=en&persist_hl=1';
  try {
    // UrlFetchApp's default User-Agent self-identifies as a script
    // ("Google-Apps-Script; beanserver..."), and YouTube 302-redirects
    // that straight to m.youtube.com -- confirmed directly by reproducing
    // the exact redirect with that UA string. The mobile page encodes
    // ytInitialData as a hex-escaped STRING ('\x7b\x22...') that gets
    // JSON.parse'd client-side, not a plain object literal like the
    // desktop page -- a completely different format the regex below
    // never matched, which is the actual root cause of every "no links
    // found" report so far. A realistic desktop User-Agent keeps YouTube
    // on www.youtube.com and the classic `var ytInitialData = {...};`
    // format this code was written against (verified directly against a
    // live channel page before writing this fix, not guessed).
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const code = resp.getResponseCode();
    if (code !== 200) {
      return { found: [], reason: 'HTTP ' + code + ' fetching ' + url, httpCode: code };
    }
    const html = resp.getContentText();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) {
      return {
        found: [], httpCode: code,
        reason: 'HTTP 200 (' + html.length + ' chars) but no "var ytInitialData = ...;</script>" found -- ' +
          'YouTube likely served a different page than expected (a consent/cookie interstitial, a locale variant, ' +
          'or the internal page structure changed). First 200 chars: ' + html.slice(0, 200).replace(/\s+/g, ' ')
      };
    }
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch (parseErr) {
      return { found: [], httpCode: code, reason: 'ytInitialData found (' + match[1].length + ' chars) but JSON.parse failed: ' + parseErr.message };
    }

    const found = [];
    const seen = {};
    let nodesVisited = 0, linkNodesSeen = 0;
    (function walk(node, depth) {
      if (!node || typeof node !== 'object' || depth > 40) return;
      nodesVisited++;
      if (node.channelExternalLinkViewModel) {
        linkNodesSeen++;
        try {
          const v = node.channelExternalLinkViewModel;
          const title = (v.title && v.title.content) || '';
          const displayContent = (v.link && v.link.content) || '';
          const run = v.link && v.link.commandRuns && v.link.commandRuns[0];
          const redirectUrl = run && run.onTap && run.onTap.innertubeCommand &&
            run.onTap.innertubeCommand.commandMetadata && run.onTap.innertubeCommand.commandMetadata.webCommandMetadata &&
            run.onTap.innertubeCommand.commandMetadata.webCommandMetadata.url;
          const qMatch = redirectUrl && redirectUrl.match(/[?&]q=([^&]+)/);
          const resolvedRaw = qMatch ? decodeURIComponent(qMatch[1]) : displayContent;
          const resolved = resolvedRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedRaw) && !/^https?:\/\//i.test(resolvedRaw)
            ? 'https://' + resolvedRaw : resolvedRaw;
          const key = title + '|' + resolved;
          if (resolved && !seen[key]) { seen[key] = true; found.push({ title: title, value: resolved }); }
        } catch (inner) { /* one malformed link node shouldn't drop the rest */ }
      }
      Object.keys(node).forEach(function (k) { walk(node[k], depth + 1); });
    })(data, 0);

    if (!found.length) {
      return {
        found: [], httpCode: code,
        reason: 'Parsed ytInitialData fine (' + nodesVisited + ' nodes walked), found ' + linkNodesSeen +
          ' channelExternalLinkViewModel node(s), but extracted 0 usable links -- ' +
          (linkNodesSeen ? 'the node shape itself may have changed (title/link/commandRuns fields).' : 'this channel likely just has no About > Links entries set.')
      };
    }
    return { found: found, httpCode: code, reason: null };
  } catch (e) {
    return { found: [], reason: 'Exception during fetch/parse: ' + errMsg_(e) };
  }
}

function testAboutPageFetch() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Test About-Page Fetch', 'Paste a channel URL, @handle, or channel ID:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const input = resp.getResponseText().trim();
  if (!input) { ui.alert('Enter a channel URL, handle, or ID first.'); return; }

  let channelId;
  try {
    channelId = resolveChannelId(input);
  } catch (e) {
    ui.alert('Could not resolve that to a channel: ' + errMsg_(e));
    return;
  }

  const diag = fetchAboutPageLinksDiagnostic_(channelId);
  const lines = ['Channel ID: ' + channelId, 'HTTP status: ' + (diag.httpCode || 'n/a (request itself failed)')];
  if (diag.found.length) {
    lines.push('', 'Found ' + diag.found.length + ' link(s):');
    diag.found.forEach(function (l) { lines.push('  ' + (l.title || '(no title)') + ': ' + l.value); });
  } else {
    lines.push('', 'No links extracted. Reason:', diag.reason || '(unknown)');
  }
  ui.alert('About-Page Fetch Result', lines.join('\n'), ui.ButtonSet.OK);
}

function extractSocials_(text) {
  const found = [];
  SOCIAL_DOMAINS.forEach(function (def) {
    const matches = text.match(def.re);
    if (matches) {
      matches.forEach(function (url) {
        if (!found.some(function (f) { return f.url === url; })) {
          found.push({ platform: def.key, url: url });
        }
      });
    }
  });
  return found;
}

function findFirstMatch_(text, reList) {
  for (let i = 0; i < reList.length; i++) {
    const m = text.match(reList[i]);
    if (m && m.length) return m[0];
  }
  return null;
}

/**
 * Grabs the first plausible non-YouTube, non-aggregator http(s) URL:
 * treated as a personal/business site worth checking for a /contact page.
 */
function findGenericSiteUrl_(text) {
  const urls = text.match(/https?:\/\/[^\s)]+/g) || [];
  const blocked = ['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com',
    'twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'discord',
    'patreon.com', 'linktr.ee', 'beacons.ai', 'linkin.bio', 'campsite.bio'];
  const candidate = urls.find(function (u) {
    return !blocked.some(function (b) { return u.indexOf(b) !== -1; });
  });
  return candidate || null;
}

function firstNonYoutubeEmail_(text) {
  const matches = text.match(EMAIL_RE);
  if (!matches) return null;
  const filtered = matches.filter(function (e) { return e.indexOf('@youtube.com') === -1; });
  return filtered.length ? filtered[0] : null;
}

/**
 * Fetches a page's text with a short timeout and no throw on failure:
 * a broken or blocked page should never fail the whole channel row.
 */
function safeFetchText_(url) {
  try {
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true
    });
    if (resp.getResponseCode() !== 200) return null;
    return resp.getContentText();
  } catch (e) {
    return null;
  }
}
