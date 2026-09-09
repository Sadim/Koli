/**
 * licenseService.gs
 * Premium-tier gate — a soft, honor-system check, stated plainly as
 * such rather than oversold, and currently **not connected to any way
 * to actually buy a code** (PREMIUM_ACCESS_CODE_HASHES is empty by
 * design — see below). A technical user could read this file in their
 * own copy and bypass it — that's an accepted, known limitation of
 * shipping v1 from an Apps Script project with no server, not a claim
 * this is real DRM. Codes are stored as SHA-256 hashes, not plaintext,
 * so casually opening this file doesn't hand out a working code —
 * friction, not security.
 *
 * Free tier: Channel/Video/Profile analysis, Discover, Sponsors,
 * Attention, Brand Targets — the core loop and the retention hook.
 * Premium: everything that turns collected data into leverage — Gap
 * Analysis, Brand Fit Score, Outreach Draft Generator, every Export
 * (Creator One-Pager, Draft Deal Memo, Performance Report), Campaigns,
 * Brand View, and Profile's Looker Studio export. One access code
 * unlocks all of it — no per-feature tiers, keeps this file (and the
 * mental model for anyone paying) simple.
 *
 * On payment collection (decided, not yet built): the local hardcoded-
 * array check below doesn't actually work post-launch — Koli is
 * distributed by "Make a copy," so every customer's Sheet becomes a
 * fully independent script the moment they copy it; nothing pushed to
 * this master template afterward reaches copies already in the wild,
 * and there's no way to grant a new customer access without asking them
 * to hand-edit this file. The real fix, when this gets built: swap
 * hasPremiumAccess_() for a runtime UrlFetchApp call to a small
 * Koli-controlled verification endpoint (no new OAuth scope needed —
 * script.external_request is already granted for Gemini/YouTube calls),
 * fed by Gumroad or Lemon Squeezy's built-in license-key API rather
 * than hand-rolling a Stripe webhook. Pricing is decided as a
 * **recurring subscription**, not one-time — so that endpoint needs to
 * re-verify periodically (a short CacheService TTL, not a permanent
 * cache), since access has to be able to lapse. Any future update here
 * should also update the extension's README "Trust & transparency"
 * section, since a live license check is a real exception to "no
 * outbound calls except your own Web App URL."
 */

// Real, distributed codes go here as SHA-256 hashes — see hashAccessCode_
// for how to generate one. Empty by default; nothing is unlockable until
// you add real hashes before launch.
const PREMIUM_ACCESS_CODE_HASHES = [];

function hashAccessCode_(code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(code || '').trim());
  return bytes.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}

function hasPremiumAccess_() {
  const code = getProp_(PROP_KEYS.ACCESS_CODE, '');
  if (!code) return false;
  return PREMIUM_ACCESS_CODE_HASHES.indexOf(hashAccessCode_(code)) !== -1;
}

/**
 * Call as the first line of any premium entry point. Menu items for
 * premium features stay visible either way — an invisible feature can't
 * make anyone want to upgrade, a visible-but-locked one can.
 */
function showUpgradeAlert_(featureName) {
  SpreadsheetApp.getUi().alert(
    'Premium feature',
    featureName + ' is part of Koli\'s premium tier — not for sale yet, so there\'s no access code to enter today. ' +
    'The free tier covers Channel/Video/Profile analysis, Discover, Sponsors, Attention, and Brand Targets.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
