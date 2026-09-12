/**
 * inboxService.gs
 * Receiving side for the "Send to Koli" browser extension. Deploy this
 * project as a Web App (Deploy > New deployment > Web app) to get a URL
 * the extension POSTs to: see README for the deployment steps, they're
 * different from anything else in Koli so far.
 *
 * Channel/video captures run full analysis inline now (a deliberate
 * choice: fewer steps to get from "found it" to "it's analyzed," at
 * the cost of each capture waiting on real YouTube+Gemini calls instead
 * of being instant). A 'note' capture (plain link, text selection, or a
 * non-YouTube platform) has nothing to analyze, so those still just
 * queue to the Prospects sheet, picked up later by "Process Prospects"
 * or the sidebar's batch tabs, same as before.
 */

/**
 * Web App entry point. Expects JSON body:
 * { secret, action, ...action-specific fields }
 *
 * `action` defaults to 'capture' (the original "Send to Koli" extension
 * behavior: {type, value, pageTitle, sourceUrl}), so the existing
 * extension keeps working unchanged. Everything else here is a vetted,
 * fixed set of Koli's own functions reachable over HTTP for whatever
 * calls this Web App outside the Sheet: never arbitrary code.
 *
 * This is Koli's only genuinely internet-facing surface: anyone with the
 * URL can send a request, gated only by the shared secret. Two defenses
 * beyond the secret itself: constant-time comparison (a naive !== check
 * leaks timing information about how many leading characters matched,
 * which is a real if narrow attack surface), and a short lockout after
 * repeated failures (blunt: it can't tell attackers from someone who
 * mistyped their secret, so it trades a small self-inflicted delay for
 * raising the cost of brute-forcing a weak secret).
 */
function doPost(e) {
  try {
    if (isLockedOut_()) {
      return jsonResponse_({ ok: false, error: 'Too many failed attempts. Try again in a few minutes.' });
    }

    const body = JSON.parse(e.postData.contents);
    const expectedSecret = getProp_(PROP_KEYS.INBOX_SHARED_SECRET, '');

    if (!expectedSecret) {
      return jsonResponse_({ ok: false, error: 'No shared secret set in Koli yet: set one in Settings first.' });
    }
    if (!constantTimeEquals_(String(body.secret || ''), expectedSecret)) {
      recordFailedAttempt_();
      return jsonResponse_({ ok: false, error: 'Invalid secret.' });
    }

    return jsonResponse_(routeWebAppAction_(body.action || 'capture', body));
  } catch (err) {
    console.error('[Koli] doPost failed: ' + errMsg_(err));
    return jsonResponse_({ ok: false, error: errMsg_(err) });
  }
}

function routeWebAppAction_(action, body) {
  switch (action) {
    case 'capture': {
      if (!body.value) return { ok: false, error: 'Missing value.' };
      // Channel/video links go straight to full analysis: no Prospects
      // detour. This trades speed (each capture now waits on real
      // YouTube+Gemini calls, seconds not instant) for one less step to
      // get from "found it" to "it's analyzed." A 'note' capture (a
      // plain link, selection, or a non-YouTube platform) has nothing to
      // analyze, so it still queues to Prospects as before.
      if (body.type === 'channel') {
        const result = analyzeChannelOne(body.value);
        return result.ok
          ? {
              ok: true,
              link: SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS).getSheetId(),
              name: result.name, preview: result.preview
            }
          : { ok: false, error: result.message };
      }
      if (body.type === 'video') {
        const result = analyzeVideoOne(body.value);
        return result.ok
          ? { ok: true, link: SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.VIDEOS).getSheetId() }
          : { ok: false, error: result.message };
      }
      const captured = addToInbox_(body.type || 'note', body.value, body.pageTitle || '', body.sourceUrl || '', body.targetTab || '');
      return { ok: true, link: captured.link };
    }

    case 'preview_channel': {
      // "Pull stats" — the extension's Home-tab flow when the person wants
      // to look at a channel before deciding whether it's worth adding.
      // Writes nothing; see commit_channel for the follow-up that does.
      if (!body.value) return { ok: false, error: 'Missing value.' };
      return previewChannelOne(body.value);
    }

    case 'commit_channel': {
      // The other half of preview_channel — actually writes the row,
      // reusing the cached analysis from the preview so nothing gets
      // re-fetched or re-run through Gemini a second time.
      if (!body.channelId) return { ok: false, error: 'Missing channelId.' };
      return commitChannelOne(body.channelId);
    }

    case 'preview_video': {
      // "Pull stats" for a video page — same look-first-decide-later flow
      // as preview_channel. Writes nothing; see commit_video.
      if (!body.value) return { ok: false, error: 'Missing value.' };
      return previewVideoOne(body.value);
    }

    case 'commit_video': {
      if (!body.videoId) return { ok: false, error: 'Missing videoId.' };
      return commitVideoOne(body.videoId);
    }

    case 'analyze_channel':
      return analyzeChannelOne(body.value);

    case 'analyze_video':
      return analyzeVideoOne(body.value);

    case 'discover': {
      const filters = body.filters || { matchKeywords: true, matchNiche: true, matchEngagement: false, matchPostsPerMonth: false, matchViews: false };
      const result = runDiscoverOne(body.seedInput, body.searchType || 'channel', body.resultCount || 5, filters);
      return result;
    }

    case 'profile': {
      // Same runProfile() the Sidebar's own Profile tab uses: including
      // its built-in 4.5-minute time budget (PROFILE_TIME_BUDGET_MS,
      // profileService.gs), safely under the Web App's ~6-minute execution
      // ceiling. A wide date range on a high-upload-frequency channel can
      // still come back with stoppedEarly: true: that's not a bug, it's
      // the same "re-run to continue where it left off" behavior the
      // Sidebar has always had, just now reachable from one call instead
      // of a client-side loop.
      if (!body.channelInput) return { ok: false, error: 'Missing channelInput.' };
      try {
        const result = runProfile(body.channelInput, body.startDate, body.endDate, body.mode || 'append', !!body.track);
        return Object.assign({ ok: true }, result);
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case 'apply_profile_columns': {
      if (!Array.isArray(body.columns) || !body.columns.length) return { ok: false, error: 'No column list provided.' };
      return applyColumnLayout_(SHEET_NAMES.PROFILE, body.columns);
    }

    case 'apply_discover_columns': {
      if (!Array.isArray(body.columns) || !body.columns.length) return { ok: false, error: 'No column list provided.' };
      return applyColumnLayout_(SHEET_NAMES.DISCOVER, body.columns);
    }

    case 'workspace_info':
      // Lets the sidebar label a saved connection with the actual sheet
      // name instead of forcing the user to type their own nickname.
      return { ok: true, name: SpreadsheetApp.getActiveSpreadsheet().getName() };

    case 'list_tabs':
      // Powers the extension's destination-tab picker: real tab names,
      // not a hand-typed one that could typo into creating a stray sheet.
      return { ok: true, tabs: SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) { return s.getName(); }) };

    case 'apply_channel_columns': {
      // Reorders and hides real Channels columns to match what the
      // extension's Channels column editor has saved: a genuinely
      // worksheet-modifying action, not the cosmetic local-only reference
      // this used to be. See applyColumnLayout_ for why hide, not delete.
      if (!Array.isArray(body.columns) || !body.columns.length) return { ok: false, error: 'No column list provided.' };
      return applyColumnLayout_(SHEET_NAMES.CHANNELS, body.columns);
    }

    case 'apply_video_columns': {
      // Same operation, the Videos sheet's own (different) header set:
      // kept as its own action rather than a flag on apply_channel_columns
      // since Channels and Videos have never been interchangeable here.
      if (!Array.isArray(body.columns) || !body.columns.length) return { ok: false, error: 'No column list provided.' };
      return applyColumnLayout_(SHEET_NAMES.VIDEOS, body.columns);
    }

    default:
      return { ok: false, error: 'Unknown action: ' + action };
  }
}

/**
 * Three things share this one GET endpoint, checked in order:
 * 1. `track=<token>`: an email-open tracking pixel (emailTrackingService.gs) --
 *    returns a real 1x1 GIF, not JSON, so it has to be checked before
 *    anything else tries to respond with text.
 * 2. `p=<token>`: a published page (publishService.gs) -- a brand-safe
 *    static snapshot, served without exposing this spreadsheet at all.
 * 3. Neither: the original reachability check (also returns the
 *    spreadsheet's name/URL, useful once there's more than one saved
 *    connection to tell apart).
 */
function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.track) {
    try { recordEmailOpen_(params.track); } catch (err) { /* a broken tracking log must never break the pixel itself */ }
    return trackingPixelResponse_();
  }

  if (params.p) {
    try {
      const page = lookupPublishedPage_(params.p);
      if (!page) return HtmlService.createHtmlOutput('<p>This page is no longer available.</p>');
      const file = DriveApp.getFileById(page.fileId);
      return HtmlService.createHtmlOutput(file.getBlob().getDataAsString('UTF-8'));
    } catch (err) {
      return HtmlService.createHtmlOutput('<p>This page is no longer available.</p>');
    }
  }

  let name = '', url = '';
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    name = ss.getName();
    url = ss.getUrl();
  } catch (err) { /* non-fatal */ }
  return jsonResponse_({ ok: true, message: 'Koli endpoint is reachable.', version: KOLI_VERSION, name: name, url: url });
}

function constantTimeEquals_(a, b) {
  // Compare full length regardless of where they first differ, so timing
  // doesn't reveal how many leading characters were correct.
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

const FAILED_ATTEMPT_LIMIT = 8;
const LOCKOUT_SECONDS = 300; // 5 minutes

// Document-scoped, not script-scoped: on script-level cache, someone
// brute-forcing one customer's webhook would lock out every other
// customer's webhook at the same time in a shared multi-tenant
// deployment. getDocumentCache() keeps the lockout isolated to the
// specific spreadsheet being targeted.
function isLockedOut_() {
  const count = Number(CacheService.getDocumentCache().get('inbox_fail_count') || 0);
  return count >= FAILED_ATTEMPT_LIMIT;
}

function recordFailedAttempt_() {
  const cache = CacheService.getDocumentCache();
  const count = Number(cache.get('inbox_fail_count') || 0) + 1;
  cache.put('inbox_fail_count', String(count), LOCKOUT_SECONDS);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function addToInbox_(type, value, pageTitle, sourceUrl, targetTab) {
  const sheet = getOrCreateSheet_(targetTab || SHEET_NAMES.INBOX, INBOX_HEADERS);
  sheet.appendRow(['', type, value, pageTitle, sourceUrl, new Date()]);
  const row = sheet.getLastRow();
  formatStatusCell_(sheet.getRange(row, 1), 'New');
  // #gid=<tab id>&range=A<row> jumps straight to the target tab AND
  // the exact row just written, not just the spreadsheet in general.
  const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + row;
  return { row: row, link: link };
}

/**
 * Koli menu action: runs Channel/Video analysis on every "New" Inbox row,
 * marks each Done/Error, and leaves plain "note" captures alone (nothing
 * to auto-analyze: those are just your own reminders).
 */
function processInbox() {
  const sheet = getOrCreateSheet_(SHEET_NAMES.INBOX, INBOX_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Prospects tab is empty.');
    return;
  }

  const data = sheet.getRange(2, 1, lastRow - 1, INBOX_HEADERS.length).getValues();
  let processed = 0, errors = 0, skipped = 0;

  data.forEach(function (row, i) {
    const sheetRow = i + 2;
    const status = String(row[0] || ''), type = row[1], value = row[2];
    if (status.indexOf('New') === -1) return; // glyph-prefixed ("○ New"), not an exact match

    try {
      if (type === 'channel') {
        const result = analyzeChannelOne(value);
        formatStatusCell_(sheet.getRange(sheetRow, 1), result.ok ? 'Done' : 'Error: ' + result.message);
        result.ok ? processed++ : errors++;
      } else if (type === 'video') {
        const result = analyzeVideoOne(value);
        formatStatusCell_(sheet.getRange(sheetRow, 1), result.ok ? 'Done' : 'Error: ' + result.message);
        result.ok ? processed++ : errors++;
      } else {
        skipped++; // 'note' type: nothing to auto-analyze
      }
    } catch (err) {
      formatStatusCell_(sheet.getRange(sheetRow, 1), 'Error: ' + err.message);
      errors++;
    }
  });

  SpreadsheetApp.getUi().alert('Process Prospects', processed + ' analyzed, ' + errors + ' error(s), ' + skipped + ' note(s) left as-is.', SpreadsheetApp.getUi().ButtonSet.OK);
}
