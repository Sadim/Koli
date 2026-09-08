/**
 * constants.gs
 * All magic strings, sheet layout, and tunable defaults live here so
 * nothing else in the codebase hardcodes a header name or property key.
 */

const SHEET_NAMES = {
  CHANNELS: 'Channels',
  VIDEOS: 'Videos',
  SPONSORS: 'Sponsors',
  SPONSOR_MENTIONS: 'Sponsor Mentions',
  DASHBOARD: 'Dashboard',
  PROFILE: 'Profile',
  DISCOVER: 'Discover Results',
  INBOX: 'Prospects',
  CAMPAIGNS: 'Campaigns',
  BRAND_TARGETS: 'Brand Targets',
  GAP_ANALYSIS: 'Gap Analysis',
  OUTREACH_DRAFTS: 'Outreach Drafts',
  SNAPSHOTS: '_SubscriberSnapshots',       // hidden — sub-count log for New Subscribers diffing
  TRACKED_PROFILES: '_TrackedProfiles'      // hidden — control sheet for Profile tracking
};

const INBOX_HEADERS = ['Status', 'Type', 'Value', 'Page Title', 'Source URL', 'Captured'];

// "Manage": one row per active deal. Stage is a dropdown, same pattern as
// Outreach — Sheets has no native Kanban view, so a staged-status column
// is the closest fit; a real drag-and-drop board is a natural fit for
// the extension sidebar later, not attempted here.
const CAMPAIGN_HEADERS = ['Channel', 'Channel ID', 'Brand', 'Stage', 'Deliverables', 'Value', 'Deadline', 'Notes', 'Created', 'Updated'];
const CAMPAIGN_STAGES = ['Briefed', 'In Production', 'Delivered', 'Payment Pending', 'Paid', 'Complete', 'Cancelled'];

// Outreach draft generator (Batch 3) — one row per generated draft, not
// one row per channel, since re-drafting a channel (new videos since last
// time) should add a new attempt rather than overwrite the last one.
const OUTREACH_DRAFT_HEADERS = ['Channel', 'Channel ID', 'Video Referenced', 'Subject', 'Email Body', 'Chars', 'Status', 'Generated'];
const OUTREACH_DRAFT_STATUSES = ['Draft', 'Reviewed', 'Sent'];

// Column index (1-based) of the hidden ID key column, per sheet — used by
// findRowByKey_ and by hideColumns() calls in sheetWriter.gs.
const KEY_COL = {
  CHANNELS: 3,
  VIDEOS: 3,
  PROFILE: 3 // Video ID; Channel ID lives in col 4 there
};

const CHANNEL_HEADERS = [
  'Status', 'Channel', 'ID', 'Niche', 'Posts/Mo', 'Contact', 'Subs', 'Avg Views',
  'Post Times', 'Grade', 'Outreach', 'Last Contact', 'Notes', 'Report'
];

// Grade weighting — growth matters most (rewards small channels with real
// momentum), quality/authenticity second, Tier-1 English-market audience
// a smaller bonus. Documented here since it's a judgment call, not a
// standard metric — tune these weights directly if the balance feels off.
// Grade v2 — 7-component framework (Audience fit, Content fit, Engagement
// quality, Momentum, Commercial fit, Reliability, Risk), each 0-100,
// combined by these weights. 5 of 7 are real signals computed from data
// Koli already collects; 2 (Content fit, and Risk to a lesser extent) are
// honestly-flagged placeholders until their proper inputs exist — see
// channelMetricsService.gs for exactly which is which and why.
const GRADE_WEIGHTS = {
  momentum: 0.25, engagementQuality: 0.20, commercialFit: 0.15,
  reliability: 0.15, risk: 0.10, audienceFit: 0.10, contentFit: 0.05
};
const GRADE_BANDS = [
  { min: 85, letter: 'A' }, { min: 70, letter: 'B' }, { min: 55, letter: 'C' },
  { min: 40, letter: 'D' }, { min: 0, letter: 'F' }
];
// Rank is Koli's own relative ranking across channels you've analyzed, not
// a global YouTube figure — no public API exposes that. Grows more useful
// as more channels get analyzed, by design.
const TIER1_COUNTRY_HINTS = ['united states', 'u.s.', 'usa', 'america', 'united kingdom', 'u.k.', 'britain',
  'australia', 'canada'];
const RECENT_VIDEOS_FOR_METRICS = 20; // batched videos.list costs 1 unit regardless of count — this isn't quota-constrained, it's a recency-vs-noise tradeoff (see channelMetricsService.gs)
const GROWTH_RECENT_WINDOW_DAYS = 45; // "recent" window for growth comparison; compared against the same-length window immediately before it

// Outreach column (Channels col 10) — native dropdown, same pattern as the
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

const SPONSOR_HEADERS = ['Channel', 'Channel ID', 'Brand', 'First Seen', 'Last Seen', 'Mentions', 'Sample Video'];
const BRAND_TARGET_HEADERS = ['Brand', 'Niche/Category', 'Priority', 'Notes', 'Added'];
const BRAND_TARGET_PRIORITIES = ['High', 'Medium', 'Low'];

const SPONSOR_MENTION_HEADERS = ['Channel', 'Video', 'Brand', 'Posted', 'Timestamp', 'Evidence'];

const PROFILE_HEADERS = [
  'Status', 'Channel', 'Video ID', 'Channel ID', 'Video', 'Posted', 'Views',
  'Likes', 'Comments', 'Auth', 'Eng %', 'CPM', 'Sponsor', 'Mention TS',
  'Location', 'Age', 'Gender', 'Sub Δ', 'Updated'
];
// Profile keying: Video ID at col 3, Channel ID at col 4.

const DISCOVER_HEADERS = [
  'Type', 'Name', 'Channel', 'Subs/Views', 'Posts/Mo', 'Eng %', 'Match Score', 'Found Via'
];

const SNAPSHOT_HEADERS = ['Channel ID', 'Date', 'Sub Count'];

const TRACKED_PROFILE_HEADERS = ['Channel ID', 'Channel Name', 'Tracked', 'Start Date', 'Last Run'];

const PROP_KEYS = {
  YOUTUBE_API_KEY: 'YOUTUBE_API_KEY',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  OMNIROUTE_API_KEY: 'OMNIROUTE_API_KEY', // reserved, not wired up yet
  LOOKBACK_DAYS: 'LOOKBACK_DAYS',
  COMMENT_SAMPLE_SIZE: 'COMMENT_SAMPLE_SIZE',
  CPM_NICHE_OVERRIDE: 'CPM_NICHE_OVERRIDE',
  SCAN_CHANNEL_SPONSORS: 'SCAN_CHANNEL_SPONSORS',       // checkbox, default on
  LOG_SPONSOR_MENTIONS: 'LOG_SPONSOR_MENTIONS',         // checkbox, default off
  ATTEMPT_SPONSOR_TIMESTAMP: 'ATTEMPT_SPONSOR_TIMESTAMP', // checkbox, default off
  INBOX_SHARED_SECRET: 'INBOX_SHARED_SECRET', // checked against the browser extension's POSTs
  REPORTS_FOLDER_ID: 'REPORTS_FOLDER_ID', // remembered once created — avoids needing to search Drive (see reportService.gs)
  MISTRAL_API_KEY: 'MISTRAL_API_KEY', // optional fallback when Gemini's own retries are exhausted
  GROQ_API_KEY: 'GROQ_API_KEY', // optional fallback, tried after Mistral
  TIMEZONE: 'TIMEZONE' // e.g. 'America/New_York', 'Etc/UTC' — user-set, never assumed
};

// Bump with every shipped round — matches ROADMAP.md's "round N" numbering.
// Shown in Settings and Run Diagnostics so it's always clear which build is live.
// Neutral default — was previously hardcoded to Africa/Lagos, inferred from
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
  MATCH_MARGIN: 0.25 // +/-25% tolerance band on numeric filters, "not too strict"
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
 * across every spreadsheet a published Add-on ever runs against — every
 * installer would share the same stored API keys and settings, which
 * defeats BYOK entirely the moment this is published rather than just
 * copy-pasted per customer. getDocumentProperties() is isolated per
 * bound spreadsheet automatically, with no manual multi-tenancy logic
 * needed — Apps Script scopes it based on which document the script is
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
