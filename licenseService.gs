/**
 * licenseService.gs
 * Premium-tier gate — a soft, honor-system check, stated plainly as
 * such rather than oversold. Koli has no backend and no way to verify a
 * code server-side (see ROADMAP.md's proposed API-gateway architecture
 * for the real fix), so this checks a locally-entered code against a
 * locally-stored list of valid ones. A technical user could read this
 * file in their own copy and bypass it — that's an accepted, known
 * limitation of shipping v1 from an Apps Script project with no server,
 * not a claim this is real DRM. Codes are stored as SHA-256 hashes, not
 * plaintext, so casually opening this file doesn't hand out a working
 * code — friction, not security.
 *
 * Free tier: Channel/Video/Profile analysis, Discover, Sponsors,
 * Attention, Brand Targets — the core loop and the retention hook.
 * Premium: everything that turns collected data into leverage — Gap
 * Analysis, Brand Fit Score, Outreach Draft Generator, every Export
 * (Creator One-Pager, Draft Deal Memo, Performance Report), Campaigns,
 * Brand View, and Profile's Looker Studio export. One access code
 * unlocks all of it — no per-feature tiers, keeps this file (and the
 * mental model for anyone paying) simple.
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
    featureName + ' is part of Koli\'s premium tier. Enter a valid access code in Koli > Settings ' +
    'to unlock it — the free tier covers Channel/Video/Profile analysis, Discover, Sponsors, Attention, ' +
    'and Brand Targets.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
