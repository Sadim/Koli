/**
 * constants.gs
 * All magic strings, sheet layout, and tunable defaults live here so
 * nothing else in the codebase hardcodes a header name or property key.
 */

/**
 * Every catch block in Koli assumes e.message is a real, non-empty string
 * and surfaces it straight to the user (an alert, a Web App JSON response,
 * a sheet error cell). That assumption breaks for a thrown non-Error value
 * (a string, a plain object, a Google API error body re-thrown as-is) --
 * e.message is then undefined, JSON.stringify drops the key entirely, and
 * an extension card ends up showing a hardcoded generic fallback instead
 * of anything that points at the real cause. This is the one place that
 * guarantees a real string either way.
 */
function errMsg_(e) {
  if (e && e.message) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch (ignored) { return String(e); }
}

/**
 * SpreadsheetApp.getActiveRangeList() has been observed to throw "You do
 * not have permission to perform that action" for a plain row-header
 * click (a full-row selection) even for a user who genuinely has edit
 * rights -- confirmed via a real Apps Script stack trace. getActiveRange()
 * alone (a single range, not a list) reliably succeeds for the same
 * selection, so every selected-row feature (Brand Fit Score, Add Selected
 * Sponsors to Brand Targets, Research Sponsor Contacts, ...) should read
 * the active selection through this instead of calling
 * getActiveRangeList() directly.
 */
function getActiveRangesSafe_() {
  try {
    const list = SpreadsheetApp.getActiveRangeList();
    return list ? list.getRanges() : [SpreadsheetApp.getActiveRange()];
  } catch (e) {
    const single = SpreadsheetApp.getActiveRange();
    return single ? [single] : [];
  }
}

const SHEET_NAMES = {
  CHANNELS: 'Channels',
  VIDEOS: 'Videos',
  SPONSORS: 'Sponsors',
  // Retired: Posted/Timestamp/Evidence moved into SPONSORS itself (see
  // SPONSOR_HEADERS). Kept only as a name to recognize a pre-existing
  // "Sponsor Mentions" tab from before this change; Koli never writes to
  // it again and never deletes it: safe to archive/delete by hand.
  SPONSOR_MENTIONS: 'Sponsor Mentions',
  DASHBOARD: 'Dashboard',
  PROFILE: 'Profile',
  DISCOVER: 'Discover Results',
  INBOX: 'Prospects',
  CAMPAIGNS: 'Campaigns',
  BRAND_TARGETS: 'Brand Targets',
  GAP_ANALYSIS: 'Gap Analysis',
  BRAND_DISCOVERY: 'Brand Discovery',
  OUTREACH_DRAFTS: 'Outreach Drafts',
  BRAND_FIT_SCORES: 'Brand Fit Scores',
  BRAND_VIEW: 'Brand View',
  PROFILE_VIEW: 'Profile View',
  ATTENTION: 'Attention',
  SNAPSHOTS: '_SubscriberSnapshots',       // hidden: sub-count log for New Subscribers diffing
  TRACKED_PROFILES: '_TrackedProfiles',      // hidden: control sheet for Profile tracking
  PUBLISHED_PAGES: '_PublishedPages',        // hidden: token -> Drive file lookup for publishService.gs
  EMAIL_OPENS: '_EmailOpens'                // hidden: tracking-pixel token -> open log
};

const INBOX_HEADERS = ['Status', 'Type', 'Value', 'Page Title', 'Source URL', 'Captured'];

// "Manage": one row per active deal. Stage is a dropdown, same pattern as
// Outreach: Sheets has no native Kanban view, so a staged-status column
// is the closest fit; a real drag-and-drop board is a natural fit for
// the extension sidebar later, not attempted here.
const CAMPAIGN_HEADERS = ['Channel', 'Channel ID', 'Brand', 'Stage', 'Deliverables', 'Value', 'Deadline', 'Notes', 'Created', 'Updated'];
const CAMPAIGN_STAGES = ['Briefed', 'In Production', 'Delivered', 'Payment Pending', 'Paid', 'Complete', 'Cancelled'];

// Outreach draft generator (Batch 3): one row per generated draft, not
// one row per channel, since re-drafting a channel (new videos since last
// time) should add a new attempt rather than overwrite the last one.
const OUTREACH_DRAFT_HEADERS = ['Channel', 'Channel ID', 'Video Referenced', 'Subject', 'Email Body', 'Chars', 'Status', 'Generated', 'Sent Date', 'Last Reply', 'Reply Category', 'Reply Draft'];
const OUTREACH_DRAFT_STATUSES = ['Draft', 'Reviewed', 'Sent'];

// One row per (channel, brand) scoring event, not one row per channel:
// the same channel scored against two different brands are two different
// answers, both worth keeping (same reasoning as Outreach Drafts).
const BRAND_FIT_HEADERS = ['Channel', 'Channel ID', 'Brand', 'Score', 'Grade', 'Notes', 'Scored'];

// Column index (1-based) of the hidden ID key column, per sheet: used by
// findRowByKey_ and by hideColumns() calls in sheetWriter.gs.
const KEY_COL = {
  CHANNELS: 3,
  VIDEOS: 3,
  PROFILE: 3 // Video ID; Channel ID lives in col 4 there
};

const CHANNEL_HEADERS = [
  'Status', 'Channel', 'ID', 'Niche', 'Posts/Mo', 'Contact', 'Subs', 'Avg Views',
  'Post Times', 'Grade', 'Outreach', 'Last Contact', 'Notes', 'Report',
  // Appended, not inserted: writeChannelRow looks columns up by name against
  // each sheet's actual header row, so these are additive for both brand-new
  // sheets (created with this full list) and already-populated ones (backfilled
  // by ensureChannelsExtraColumns_ in sheetWriter.gs) without reordering
  // anything existing callers already depend on by position.
  'Engagement %', 'Suggested Rate'
];

// Grade weighting: growth matters most (rewards small channels with real
// momentum), quality/authenticity second, Tier-1 English-market audience
// a smaller bonus. Documented here since it's a judgment call, not a
// standard metric: tune these weights directly if the balance feels off.
// Grade v2: 7-component framework (Audience fit, Content fit, Engagement
// quality, Momentum, Commercial fit, Reliability, Risk), each 0-100,
// combined by these weights. 5 of 7 are real signals computed from data
// Koli already collects; 2 (Content fit, and Risk to a lesser extent) are
// honestly-flagged placeholders until their proper inputs exist: see
// channelMetricsService.gs for exactly which is which and why.
const GRADE_WEIGHTS = {
  momentum: 0.25, engagementQuality: 0.20, commercialFit: 0.15,
  reliability: 0.15, risk: 0.10, audienceFit: 0.10, contentFit: 0.05
};
const GRADE_BANDS = [
  { min: 85, letter: 'A' }, { min: 70, letter: 'B' }, { min: 55, letter: 'C' },
  { min: 40, letter: 'D' }, { min: 0, letter: 'F' }
];

// Evidence-coverage confidence tiers for Grade v2 and Brand Fit Score:
// same idea as a source-grounded-audit tool grading its own evidence
// coverage before trusting a score: a composite built partly on honestly-
// flagged placeholders (Grade's contentFit, a blank Brand Fit brief field
// auto-satisfied instead of scored) can still look like a full-confidence
// number with no way to tell from the letter/score alone. Thresholds are
// a judgment call, not a standard: tune here if they feel wrong once
// there's real usage to judge against. See channelMetricsService.gs's
// computeEvidenceCoverage_/classifyEvidenceCoverage_ for how this is used.
const EVIDENCE_COVERAGE_BANDS = [
  { min: 0.8, label: 'graded' },
  { min: 0.6, label: 'provisional' },
  { min: 0, label: 'insufficient evidence' }
];

// Brand Fit Score: the "not a Grade rewrite" item from ROADMAP.md's queued
// list: Grade is channel-intrinsic (same for every brand); this is
// channel-vs-a-specific-campaign-brief. It exists specifically to replace
// two things Grade's own comments already flag as placeholders once a real
// target exists: see channelMetricsService.gs's computeGrade_: contentFit
// was a flat neutral 50 ("inherently relative to a specific target niche/
// campaign... genuinely meaningless to fake a real number here"), and
// audienceFit was a binary Tier-1-country check, not a real audience match.
// The other 4 components are reused as-is from Grade: momentum,
// engagement quality, and reliability don't change per brief, so
// recomputing a second opinion on them would be noise, not signal.
// budgetFit is new: brief's stated per-video budget vs. this channel's
// estimated CPM cost (cpmService.gs) at its typical view count. risk here
// uses a live checkBrandSafety() Reddit check instead of Grade's
// authenticity-only proxy: worth the extra API call when you're about to
// make a real spend decision on one specific creator, not worth running on
// every bulk Channel analysis pass. Weights are Koli's own judgment call,
// same as GRADE_WEIGHTS: tune here once real outcomes justify it.
const BRAND_FIT_WEIGHTS = {
  contentFit: 0.20, audienceFit: 0.20, engagementQuality: 0.15, momentum: 0.15,
  budgetFit: 0.15, reliability: 0.10, risk: 0.05
};
// Rank is Koli's own relative ranking across channels you've analyzed, not
// a global YouTube figure: no public API exposes that. Grows more useful
// as more channels get analyzed, by design.
const TIER1_COUNTRY_HINTS = ['united states', 'u.s.', 'usa', 'america', 'united kingdom', 'u.k.', 'britain',
  'australia', 'canada'];
const RECENT_VIDEOS_FOR_METRICS = 20; // batched videos.list costs 1 unit regardless of count: this isn't quota-constrained, it's a recency-vs-noise tradeoff (see channelMetricsService.gs)
const GROWTH_RECENT_WINDOW_DAYS = 45; // "recent" window for growth comparison; compared against the same-length window immediately before it

// Outreach column (Channels col 10): native dropdown, same pattern as the
// Data Validation reference image from the original spec.
const OUTREACH_STATUSES = [
  'Not Contacted', 'Contacted', 'Replied', 'Negotiating',
  'Closed - Won', 'Closed - Lost', 'Passed', 'Do Not Contact'
];
// Discover skips candidates already marked with one of these.
const OUTREACH_EXCLUDE_FROM_DISCOVER = ['Passed', 'Do Not Contact'];

const VIDEO_HEADERS = [
  'Status', 'Video', 'ID', 'Channel', 'Views', 'Likes', 'Comments', 'Auth',
  'Eng %', 'Posted', 'Day', 'New Subs', 'Location', 'Age', 'Gender', 'Updated'
];

// Sponsor Mentions (per-mention detail log) retired: Posted/Timestamp/
// Evidence folded directly into the Sponsors rollup instead of living in
// a second, near-identical sheet. Each of the 3 borrowed columns reflects
// the MOST RECENT mention for that (channel, brand) pair, same "latest
// known state" semantics Last Seen already had: this is a deliberate
// simplification (full mention-by-mention history is no longer kept),
// not an oversight. See sponsorService.gs.
const SPONSOR_HEADERS = [
  'Channel', 'Channel ID', 'Brand', 'First Seen', 'Last Seen', 'Mentions', 'Sample Video',
  'Posted', 'Timestamp', 'Evidence'
];
const BRAND_TARGET_HEADERS = ['Brand', 'Niche/Category', 'Priority', 'Notes', 'Added'];
const BRAND_TARGET_PRIORITIES = ['High', 'Medium', 'Low'];

const PROFILE_HEADERS = [
  'Status', 'Channel', 'Video ID', 'Channel ID', 'Video', 'Posted', 'Views',
  'Likes', 'Comments', 'Auth', 'Eng %', 'CPM', 'Sponsor', 'Mention TS',
  'Location', 'Age', 'Gender', 'Sub Δ', 'Updated'
];
// Profile keying: Video ID at col 3, Channel ID at col 4.

const DISCOVER_HEADERS = [
  'Type', 'Name', 'Channel', 'Subs/Views', 'Posts/Mo', 'Eng %', 'Match Score', 'Found Via'
];

const SNAPSHOT_HEADERS = ['Channel ID', 'Date', 'Sub Count', 'Avg Views', 'Avg Likes', 'Avg Comments'];

const TRACKED_PROFILE_HEADERS = ['Channel ID', 'Channel Name', 'Tracked', 'Start Date', 'Last Run'];

const PROP_KEYS = {
  YOUTUBE_API_KEY: 'YOUTUBE_API_KEY',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  OMNIROUTE_API_KEY: 'OMNIROUTE_API_KEY', // reserved, not wired up yet
  LOOKBACK_DAYS: 'LOOKBACK_DAYS',
  COMMENT_SAMPLE_SIZE: 'COMMENT_SAMPLE_SIZE',
  CPM_NICHE_OVERRIDE: 'CPM_NICHE_OVERRIDE',
  SCAN_CHANNEL_SPONSORS: 'SCAN_CHANNEL_SPONSORS',       // checkbox, default on
  // LOG_SPONSOR_MENTIONS retired along with the Sponsor Mentions sheet:
  // Posted/Timestamp/Evidence are now core Sponsors columns, always on,
  // nothing left to toggle.
  ATTEMPT_SPONSOR_TIMESTAMP: 'ATTEMPT_SPONSOR_TIMESTAMP', // checkbox, default off: gates the caption-fuzzy-match fallback only; SponsorBlock-verified timestamps are free and always attempted
  INBOX_SHARED_SECRET: 'INBOX_SHARED_SECRET', // checked against the browser extension's POSTs
  REPORTS_FOLDER_ID: 'REPORTS_FOLDER_ID', // remembered once created: avoids needing to search Drive (see reportService.gs)
  BRAND_KITS_FOLDER_ID: 'BRAND_KITS_FOLDER_ID', // same pattern, separate folder (see brandKitService.gs)
  PUBLISHED_PAGES_FOLDER_ID: 'PUBLISHED_PAGES_FOLDER_ID', // same pattern, separate folder (see publishService.gs)
  MISTRAL_API_KEY: 'MISTRAL_API_KEY', // optional fallback when Gemini's own retries are exhausted
  GROQ_API_KEY: 'GROQ_API_KEY', // optional fallback, tried after Mistral
  TIMEZONE: 'TIMEZONE', // e.g. 'America/New_York', 'Etc/UTC': user-set, never assumed
  ACCESS_CODE: 'ACCESS_CODE', // premium-tier unlock: see licenseService.gs
  DEFAULT_TARGET_REGIONS: 'DEFAULT_TARGET_REGIONS', // comma-joined ISO 3166-1 alpha-2 codes (e.g. "US,GB,CA,AU"): see discoverService.gs
  WEB_APP_URL: 'WEB_APP_URL' // exec URL of the Web App deployment to use for the connection code; set explicitly because ScriptApp.getService().getUrl() is ambiguous once more than one deployment exists (see getConnectionCode_ in uiHandlers.gs)
};

// Bump with every shipped round: matches ROADMAP.md's "round N" numbering.
// Shown in Settings and Run Diagnostics so it's always clear which build is live.
// Neutral default: was previously hardcoded to Africa/Lagos, inferred from
// unrelated ventures and never confirmed. Fixed to a real Settings field
// instead of swapping one unilateral guess for another.
const DEFAULT_TIMEZONE = 'Etc/UTC';

function getTimezone_() {
  return getProp_(PROP_KEYS.TIMEZONE, DEFAULT_TIMEZONE);
}

const KOLI_VERSION = '1.9.0-deploy-check';

const DEFAULTS = {
  LOOKBACK_DAYS: 90,
  COMMENT_SAMPLE_SIZE: 40,
  MAX_BATCH_ITEMS: 50, // YouTube API max IDs per list call
  CACHE_TTL_SECONDS: 21600,
  GEMINI_MODEL: 'gemini-3.6-flash',
  GEMINI_MAX_RETRIES: 3,
  YOUTUBE_MAX_RETRIES: 4,
  DISCOVER_MAX_RESULTS: 5,
  DISCOVER_CANDIDATE_POOL: 15, // candidates scored before top N are kept
  MATCH_MARGIN: 0.25, // +/-25% tolerance band on numeric filters, "not too strict"
  BRAND_DISCOVERY_MAX_CANDIDATES: 15 // videos scanned per run: one search.list call plus one merged Gemini call, same cost shape as Discover
};

const STATUS = {
  DONE: 'Done',
  ERROR: 'Error',
  SKIPPED: 'Skipped (private/deleted)'
};

const CPM_NICHE_TABLE = {
  'maker': [8, 20], 'diy': [8, 20], 'electronics': [10, 25], '3d print': [9, 22],
  'fintech': [15, 40], 'finance': [15, 40], 'ai': [12, 30], 'automation': [12, 30],
  'football': [6, 15], 'sports': [6, 15], 'default': [7, 18]
};

const SUBCOUNT_MULTIPLIER_TIERS = [
  { max: 10000, mult: 0.7 }, { max: 100000, mult: 1.0 }, { max: 500000, mult: 1.2 },
  { max: 1000000, mult: 1.35 }, { max: Infinity, mult: 1.5 }
];

/**
 * Document-scoped, not script-scoped: getScriptProperties() is shared
 * across every spreadsheet a published Add-on ever runs against: every
 * installer would share the same stored API keys and settings, which
 * defeats BYOK entirely the moment this is published rather than just
 * copy-pasted per customer. getDocumentProperties() is isolated per
 * bound spreadsheet automatically, with no manual multi-tenancy logic
 * needed: Apps Script scopes it based on which document the script is
 * bound to, including when triggered via the Web App.
 */
function getProp_(key, fallback) {
  const v = PropertiesService.getDocumentProperties().getProperty(key);
  return (v === null || v === undefined || v === '') ? fallback : v;
}

function getBoolProp_(key, fallback) {
  const v = PropertiesService.getDocumentProperties().getProperty(key);
  if (v === null || v === undefined || v === '') return fallback;
  return v === 'true';
}

function channelUrl_(channelId) { return 'https://www.youtube.com/channel/' + channelId; }
function videoUrl_(videoId) { return 'https://www.youtube.com/watch?v=' + videoId; }
