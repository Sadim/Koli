/**
 * licenseService.gs
 * Premium-tier gate: a soft, honor-system check, stated plainly as
 * such rather than oversold, and currently **not connected to any way
 * to actually buy a code** (PREMIUM_ACCESS_CODE_HASHES is empty by
 * design: see below). A technical user could read this file in their
 * own copy and bypass it: that's an accepted, known limitation of
 * shipping v1 from an Apps Script project with no server, not a claim
 * this is real DRM. Codes are stored as SHA-256 hashes, not plaintext,
 * so casually opening this file doesn't hand out a working code:
 * friction, not security.
 *
 * Free tier: Channel/Video/Profile analysis, Discover, Sponsors,
 * Attention, Brand Targets: the core loop and the retention hook.
 * Premium: everything that turns collected data into leverage: Gap
 * Analysis, Brand Fit Score, Outreach Draft Generator, every Export
 * (Creator One-Pager, Draft Deal Memo, Performance Report), Campaigns,
 * Brand View, and Profile's Looker Studio export. One access code
 * unlocks all of it: no per-feature tiers, keeps this file (and the
 * mental model for anyone paying) simple.
 *
 * On payment collection (decided, not yet built): the local hardcoded-
 * array check below doesn't actually work post-launch: Koli is
 * distributed by "Make a copy," so every customer's Sheet becomes a
 * fully independent script the moment they copy it; nothing pushed to
 * this master template afterward reaches copies already in the wild,
 * and there's no way to grant a new customer access without asking them
 * to hand-edit this file. The real fix, when this gets built: swap
 * hasPremiumAccess_() for a runtime UrlFetchApp call to a small
 * Koli-controlled verification endpoint (no new OAuth scope needed:
 * script.external_request is already granted for Gemini/YouTube calls),
 * fed by Gumroad or Lemon Squeezy's built-in license-key API rather
 * than hand-rolling a Stripe webhook. Pricing is decided as a
 * **recurring subscription**, not one-time: so that endpoint needs to
 * re-verify periodically (a short CacheService TTL, not a permanent
 * cache), since access has to be able to lapse. Any future update here
 * should also update the extension's README "Trust & transparency"
 * section, since a live license check is a real exception to "no
 * outbound calls except your own Web App URL."
 */

// Real, distributed codes go here as SHA-256 hashes: see hashAccessCode_
// for how to generate one. `trialDays: null` means it never expires (the
// founder's own code); a number means access lapses that many days after
// the code is FIRST entered on a given Sheet (tracked in that Sheet's own
// Document Properties, under a key derived from the hash below -- so the
// clock starts on first use, not on whenever this file happened to be
// written). None of these are real, distributed codes yet: they exist so
// premium features can be tested (and demoed on a time-boxed basis)
// before any purchase flow exists. Remove them before real codes go out,
// so none of them are a live backdoor.
const PREMIUM_ACCESS_CODES = {
  '6be17b5ff03b3a756407a515a5f0143b67b7f3d4fb8021747935d203a340a772': { trialDays: null }, // koli-founder-2026
  '32690f272a9aebdae5b7ce87a9e6c3e251df4bc69ba1091d31699b04a54d4799': { trialDays: 15 },   // koli-trial-15
  'c18ac3a73affa5cedab34c235b82373259663fef6a92de7e8088e4e9b38e2cc6': { trialDays: 30 },   // koli-trial-30
  '24976d1fbedf9135f79fd88ec0b25e579b604c819cda654faada0b6adbc3672d': { trialDays: 60 },   // koli-trial-60
  'dd1d98bc9818b2646ff7fd6ddbd8a16934657a530174b204cb5f7a9b674a2baf': { trialDays: 180 }    // koli-trial-180 (~6 months)
};

function hashAccessCode_(code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(code || '').trim());
  return bytes.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}

function hasPremiumAccess_() {
  const code = getProp_(PROP_KEYS.ACCESS_CODE, '');
  if (!code) return false;

  if (PAYMENT_VERIFICATION_ENABLED) {
    return verifyGumroadLicense_(code);
  }

  const entry = PREMIUM_ACCESS_CODES[hashAccessCode_(code)];
  if (!entry) return false;
  if (entry.trialDays == null) return true;

  const props = PropertiesService.getDocumentProperties();
  const startKey = 'TRIAL_START_' + hashAccessCode_(code);
  let startedAt = props.getProperty(startKey);
  if (!startedAt) {
    startedAt = String(Date.now());
    props.setProperty(startKey, startedAt);
  }
  const elapsedDays = (Date.now() - Number(startedAt)) / (24 * 60 * 60 * 1000);
  return elapsedDays <= entry.trialDays;
}

/**
 * Payment collection: built now, dormant until activated. Flip
 * PAYMENT_VERIFICATION_ENABLED to true once a real Gumroad product
 * exists and GUMROAD_PRODUCT_ID is set to its real ID -- until then
 * hasPremiumAccess_() never reaches this code at all, so nothing about
 * today's working trial-code system changes by this being here.
 *
 * Gumroad chosen over Lemon Squeezy per the note above: same idea,
 * either works, Gumroad's license-key API is a plain POST with no new
 * OAuth scope needed (script.external_request already covers it).
 *
 * A subscription needs periodic re-verification, not a permanent grant
 * (access has to be able to lapse on cancellation) -- a successful
 * check is cached for GUMROAD_CACHE_HOURS so a cancelled subscription
 * is caught within a day, and a transient Gumroad outage mid-session
 * doesn't lock out someone who was already verified. A key that has
 * NEVER been successfully verified fails closed on a network error
 * (not silently granted) -- only an already-cached valid key survives
 * an outage.
 */
const PAYMENT_VERIFICATION_ENABLED = false; // flip to true once GUMROAD_PRODUCT_ID below is real
const GUMROAD_PRODUCT_ID = 'REPLACE_WITH_REAL_GUMROAD_PRODUCT_ID';
const GUMROAD_CACHE_HOURS = 24;

function verifyGumroadLicense_(licenseKey) {
  const digestKey = 'gumroad_license_' + hashAccessCode_(licenseKey);
  const cache = CacheService.getDocumentCache();
  const cached = cache.get(digestKey);
  if (cached === 'valid') return true;
  if (cached === 'invalid') return false;

  try {
    const resp = UrlFetchApp.fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'post', muteHttpExceptions: true,
      payload: { product_id: GUMROAD_PRODUCT_ID, license_key: licenseKey, increment_uses_count: 'false' }
    });
    const data = JSON.parse(resp.getContentText());
    const purchase = data.purchase || {};
    const valid = !!(data.success && !purchase.refunded && !purchase.chargebacked && !purchase.subscription_cancelled_at && !purchase.subscription_failed_at);
    cache.put(digestKey, valid ? 'valid' : 'invalid', GUMROAD_CACHE_HOURS * 3600);
    return valid;
  } catch (e) {
    return false; // never-verified key + unreachable Gumroad = denied, not granted
  }
}

/**
 * Call as the first line of any premium entry point. Menu items for
 * premium features stay visible either way: an invisible feature can't
 * make anyone want to upgrade, a visible-but-locked one can.
 */
function showUpgradeAlert_(featureName) {
  SpreadsheetApp.getUi().alert(
    'Premium feature',
    featureName + ' is part of Koli\'s premium tier: not for sale yet, so there\'s no access code to enter today. ' +
    'The free tier covers Channel/Video/Profile analysis, Discover, Sponsors, Attention, and Brand Targets.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
