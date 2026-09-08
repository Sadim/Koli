/**
 * contactService.gs
 * Original build (not a port). Goal, per spec: find a contact email by
 * following the channel's other social handles, the way an outreach person
 * would — check the About description first, then follow any link-in-bio
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
 * @return {{email: string, socials: Array<{platform: string, url: string}>}}
 */
function findContact(description) {
  const desc = description || '';
  const socials = extractSocials_(desc);

  // 1. Direct email in the About description — cheapest, most common win.
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

  return {
    email: email || 'Not found',
    socials: socials
  };
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
 * Grabs the first plausible non-YouTube, non-aggregator http(s) URL —
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
 * Fetches a page's text with a short timeout and no throw on failure —
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
