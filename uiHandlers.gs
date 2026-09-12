/**
 * uiHandlers.gs
 * Menu, sidebar/dialog entry points, and the orchestration functions the
 * client-side sidebar JS calls. Channel/Video/Profile each start with one
 * batched prefetch call (parallel network requests, warms the cache), then
 * loop one item at a time so the client can show live, resumable progress.
 */

// Custom add-on menus can't use Google's own colored Material icons (that's
// internal Workspace UI chrome, not exposed via SpreadsheetApp.getUi()); a
// prefixed character is the only icon mechanism the public Menu API
// actually supports, and there's no fixed-width "icon column" the way
// Google's own native menus have — each addItem() caption is just one
// plain-text string. A per-item glyph (◆ ⌕ ▦ ➤ ...) therefore renders at a
// different width per character and leaves every label starting at a
// different x-position ("ragged" alignment). Using the SAME glyph (•)
// everywhere makes the prefix-plus-space pixel-identical across every
// item, which is the only way to actually guarantee aligned labels here.
// ⚡ stays on Attention alone, as a deliberate one-item exception (it's
// the single "start here" entry, not part of the alignment set below it).
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Koli')
    .addItem('⚡ Attention', 'showAttentionView')
    .addSeparator()
    .addItem('• Profile', 'showProfileSidebar')
    .addItem('• Discover', 'showDiscoverSidebar')
    .addItem('• Dashboard', 'showDashboard')
    .addItem('• Campaigns (Premium)', 'showCampaigns')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('• Brand Intelligence')
      .addItem('• Brand Targets', 'showBrandTargets')
      .addItem('• Add Brand Target...', 'showAddBrandTargetDialog')
      .addItem('• Discover New Brands (Premium)', 'showBrandDiscoveryDialog')
      .addItem('• Add Selected Discoveries to Brand Targets', 'addBrandDiscoveriesToBrandTargets')
      .addItem('• Add Selected Sponsors to Brand Targets', 'addSponsorsToBrandTargets')
      .addItem('• Run Gap Analysis (selected Channels row) (Premium)', 'runGapAnalysisForActiveRow')
      .addItem('• Brand Fit Score (selected Channels row(s)) (Premium)', 'showBrandFitScoreDialog')
      .addItem('• Test About-Page Fetch (diagnostic)', 'testAboutPageFetch')
      .addItem('• Normalize Sponsor Names', 'normalizeExistingSponsors')
      .addItem('• Research Sponsor Contacts (selected Sponsors row(s)) (Premium)', 'researchSponsorContacts')
      .addItem('• Attach Brand Kit (selected Sponsors/Brand Targets row) (Premium)', 'showBrandKitUploadDialog')
      .addItem('• Guess Contact Email (name + domain) (Premium)', 'showContactFinderDialog')
      .addItem('• Set Up Brand View (for Looker Studio)', 'showBrandView'))
    .addSeparator()
    // Every item in this submenu is premium-gated: marked once on the
    // submenu header rather than repeated on each child. Set Up Brand View
    // used to live here too, but at 11 items this submenu was tall enough
    // to get clipped by the browser viewport on a shorter window with no
    // way to scroll to the last couple of items -- moved into Brand
    // Intelligence (a shorter, brand-facing-views-adjacent list) to fix
    // that rather than just shortening labels.
    .addSubMenu(SpreadsheetApp.getUi().createMenu('• Export (Premium)')
      .addItem('• Creator One-Pager (selected row)', 'exportCreatorOnePager')
      .addItem('• Creator Shortlist Report (selected rows -- sellable)', 'exportCreatorShortlistReport')
      .addItem('• Draft Deal Memo (selected row)', 'exportDealMemo')
      .addItem('• Performance Report (Channels or Profile row)', 'exportPerformanceReport')
      .addItem('• New Campaign (selected Channels row)', 'showCreateCampaignDialog')
      .addItem('• Draft Outreach Email (selected Channels row)', 'showDraftOutreachEmail')
      .addItem('• Edit Draft (selected Outreach Drafts row)', 'showEditOutreachDraft')
      .addItem('• Draft a Reply (selected Outreach Drafts row)', 'showReplyAssistant')
      .addItem('• Send Approved Drafts (selected Outreach Drafts rows)', 'sendApprovedOutreachDrafts')
      .addItem('• Send Selected Profile Rows to Profile View (for Looker Studio)', 'sendProfileSelectionToView')
      .addItem('• Publish Selected Channels as Page (Premium)', 'publishSelectedChannelsAsPage')
      .addItem('• Unpublish a Page...', 'unpublishPageDialog'))
    .addItem('• Refresh Tracked Profiles', 'runRefreshTrackedProfiles')
    .addItem('• Process Prospects', 'processInbox')
    .addSeparator()
    .addItem('• Settings', 'showSettingsDialog')
    .addItem('• Apply Default Formatting (all sheets)', 'runKoliDefaultFormatting')
    .addItem('• Run Diagnostics', 'runDiagnostics')
    .addItem('• Migrate Channels Sheet (v2)', 'migrateChannelsSheetV2')
    .addItem('• Help', 'showHelp')
    .addToUi();
}

/** Returns the currently active sheet/tab's name: powers the sidebar's active-tab indicator. */
function getActiveSheetName() {
  return SpreadsheetApp.getActiveSheet().getName();
}

const SELECTED_ROW_CACHE_KEY = 'koli_selected_row';

/**
 * Simple trigger: fires automatically on any selection change, no
 * authorization prompt needed (Apps Script runs onSelectionChange with
 * restricted permissions, same class as onOpen/onEdit). Kept
 * intentionally minimal -- just caches WHICH sheet and row, if either
 * Channels or Videos, is currently selected. The sidebar has no way to
 * receive a live push into its sandboxed iframe, so it polls
 * getSelectedRowMarker() instead (a plain cache read, no sheet access)
 * and only calls the heavier getSelectedChannelSummary()/
 * getSelectedVideoSummary() when that marker actually changed.
 */
function onSelectionChange(e) {
  try {
    const range = e.range;
    const sheetName = range.getSheet().getName();
    const cache = CacheService.getUserCache();
    if ((sheetName === SHEET_NAMES.CHANNELS || sheetName === SHEET_NAMES.VIDEOS) && range.getRow() >= 2) {
      cache.put(SELECTED_ROW_CACHE_KEY, sheetName + ':' + range.getRow(), 600);
    } else {
      cache.remove(SELECTED_ROW_CACHE_KEY);
    }
  } catch (err) { /* simple triggers must never throw visibly */ }
}

/** Cheap poll target for the sidebar's selection-reactive card: no sheet access, just a cache read. Returns "" (nothing selected), "Channels:N", or "Videos:N". */
function getSelectedRowMarker() {
  return CacheService.getUserCache().get(SELECTED_ROW_CACHE_KEY) || '';
}

/**
 * Full read for the sidebar's channel-summary card -- pure read of
 * already-computed cells (Grade, Engagement %, Suggested Rate, etc.),
 * no YouTube/Gemini calls. Re-derives the row from the actual current
 * selection rather than trusting the cached marker, so it can't go
 * stale between a selection change and this call.
 */
function getSelectedChannelSummary() {
  const row = getActiveChannelRow_();
  if (!row) return { ok: false };
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = getChannelRowData_(sheet, row);
  if (!data.channelId) return { ok: false };
  // Sparse by design (see getChannelSnapshotHistory_): a real point per
  // past analysis run, not a daily-polled series -- recalibrates every
  // time this card loads, off whatever history actually exists so far.
  const history = getChannelSnapshotHistory_(data.channelId);
  return { ok: true, row: row, data: data, history: history };
}

/**
 * Video-sheet counterpart to getSelectedChannelSummary. Sponsor is a
 * live SponsorBlock check (cached), not a stored column -- Koli's own
 * sponsor tracking only rolls up to the channel/brand level today (see
 * sponsorService.gs), so there's no per-video "was this sponsored" cell
 * to read; this asks the community SponsorBlock database about this one
 * specific video instead, which is honest and cheap either way.
 */
function getSelectedVideoSummary() {
  const row = getActiveVideoRow_();
  if (!row) return { ok: false };
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = getVideoRowData_(sheet, row);
  if (!data.videoId) return { ok: false };
  const sponsorSegments = getSponsorBlockSegments_(data.videoId);
  data.sponsorDetected = sponsorSegments.length > 0;
  data.sponsorTimestamp = sponsorSegments.length ? formatSeconds_(sponsorSegments[0].start) : null;
  return { ok: true, row: row, data: data };
}

function showAddBrandTargetDialog() {
  const html = HtmlService.createHtmlOutputFromFile('AddBrandTargetDialog').setWidth(420).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, 'Add Brand Target');
}

/** One-click check of everything that commonly breaks: API keys and Drive/Docs access. */
function runDiagnostics() {
  const ui = SpreadsheetApp.getUi();
  const results = ['Koli v' + KOLI_VERSION];

  try {
    const key = getProp_(PROP_KEYS.YOUTUBE_API_KEY, '');
    if (!key) throw new Error('not set');
    ytFetch_(YT_API_BASE + '/videos?part=id&id=dQw4w9WgXcQ&key=' + key);
    results.push('✓ YouTube API key: working');
  } catch (e) {
    results.push('✗ YouTube API key: ' + e.message);
  }

  try {
    const key = getProp_(PROP_KEYS.GEMINI_API_KEY, '');
    if (!key) throw new Error('not set');
    geminiCallJson_('Respond with exactly this JSON and nothing else: {"ok": true}');
    results.push('✓ Gemini API key: working');
  } catch (e) {
    results.push('✗ Gemini API key: ' + e.message);
  }

  try {
    getOrCreateReportsFolder_();
    results.push('✓ Drive/Docs permission: granted (Koli Reports folder reachable)');
  } catch (e) {
    // e.message alone is often just "You do not have permission to perform
    // that action" (Apps Script's generic wrapper); e.toString() sometimes
    // carries the real underlying reason (e.g. "Drive API has not been used
    // in project ... or it is disabled") which is what actually points at a
    // fix, so surface both rather than the generic text alone.
    results.push('✗ Drive/Docs permission: ' + e.message + '\n   Raw: ' + e.toString());
  }

  try {
    const effectiveUser = Session.getEffectiveUser().getEmail() || '(unknown -- email not shared with this script)';
    results.push('Running as: ' + effectiveUser);
  } catch (e) {
    results.push('Running as: (could not read -- ' + e.message + ')');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lockedSheets = [];
    ss.getSheets().forEach(function (sh) {
      const sheetProts = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      const rangeProts = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE);
      sheetProts.concat(rangeProts).forEach(function (p) {
        if (!p.canEdit()) {
          lockedSheets.push(sh.getName() + (p.getRange ? ' (' + p.getRange().getA1Notation() + ')' : ''));
        }
      });
    });
    results.push(lockedSheets.length
      ? '✗ Protected ranges blocking edits: ' + lockedSheets.join(', ') + ' -- remove or add yourself as an editor via Data > Protected sheets and ranges'
      : '✓ Sheet protections: none block the current user');
  } catch (e) {
    results.push('Sheet protection check: ' + e.message);
  }

  ui.alert('Koli Diagnostics', results.join('\n\n'), ui.ButtonSet.OK);
}

function showProfileSidebar() {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.mode = 'profile';
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('Koli: Profile'));
}

function showDiscoverSidebar() {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.mode = 'discover';
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('Koli: Discover'));
}

function showSettingsDialog() {
  const html = HtmlService.createHtmlOutputFromFile('SettingsDialog').setWidth(420).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, 'Koli Settings');
}

function showDashboard() {
  const sheet = ensureDashboardSheet_();
  refreshAuthenticityAverage_(sheet);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}

function showHelp() {
  SpreadsheetApp.getUi().alert(
    'Koli',
    'Attention: start here. Stale Outreach follow-ups, recent sponsor activity, and high-grade ' +
    'channels with no sponsor history yet: what actually needs you today, not another table to skim.\n' +
    'Analyze Channels / Analyze Videos: bulk metadata enrichment.\n' +
    'Profile: full per-video history for one channel over a date range, trackable going forward.\n' +
    'Discover: find channels/videos similar to a seed link.\n' +
    'Refresh Tracked Profiles: pulls new videos for every channel you\'ve tagged as tracked.\n' +
    'Export > Creator One-Pager: pitch-ready PDF for the selected Channels row.\n' +
    'Export > Draft Outreach Email: personalized cold-email draft hooked on a specific ' +
    'detail from the creator\'s last 3 videos, editable in the Outreach Drafts sheet.\n' +
    'Brand Intelligence > Discover New Brands: search YouTube directly for a niche/keyword and ' +
    'surface brands you don\'t already know about, not just ones that already sponsor a tracked channel.\n' +
    'Brand Intelligence > Brand Fit Score: score one or more selected Channels rows against ' +
    'a specific brand brief (niche, audience, budget), not just Grade\'s general quality score.\n' +
    'Export > Set Up Brand View: a live, brand-safe Channels view for connecting Looker Studio ' +
    'and sharing a presentation link with a brand, without giving them access to this spreadsheet.\n' +
    'Export > Send Selected Profile Rows to Profile View: same idea, for whichever Profile rows ' +
    'you\'ve selected.\n' +
    'Run Diagnostics: checks your API keys and Drive permissions in one click.\n' +
    'Set your YouTube and Gemini API keys first under Settings.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function runRefreshTrackedProfiles() {
  const results = refreshTrackedProfiles();
  const ui = SpreadsheetApp.getUi();
  if (!results.length) {
    ui.alert('No tracked profiles yet. Tag a channel as tracked from the Profile sidebar first.');
    return;
  }
  const lines = results.map(function (r) {
    return r.error ? (r.channel + ': error: ' + r.error) : (r.channel + ': ' + r.newVideos + ' new video(s)');
  });
  ui.alert('Refresh Tracked Profiles', lines.join('\n'), ui.ButtonSet.OK);
}

// ---------- Settings ----------

function getSettings() {
  const props = PropertiesService.getDocumentProperties();
  const mask = function (v) { return v ? '••••••••' + v.slice(-4) : ''; };
  return {
    version: KOLI_VERSION,
    youtubeKeySet: !!props.getProperty(PROP_KEYS.YOUTUBE_API_KEY),
    youtubeKeyMasked: mask(props.getProperty(PROP_KEYS.YOUTUBE_API_KEY)),
    geminiKeySet: !!props.getProperty(PROP_KEYS.GEMINI_API_KEY),
    geminiKeyMasked: mask(props.getProperty(PROP_KEYS.GEMINI_API_KEY)),
    mistralKeySet: !!props.getProperty(PROP_KEYS.MISTRAL_API_KEY),
    mistralKeyMasked: mask(props.getProperty(PROP_KEYS.MISTRAL_API_KEY)),
    groqKeySet: !!props.getProperty(PROP_KEYS.GROQ_API_KEY),
    groqKeyMasked: mask(props.getProperty(PROP_KEYS.GROQ_API_KEY)),
    lookbackDays: Number(getProp_(PROP_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS)),
    commentSampleSize: Number(getProp_(PROP_KEYS.COMMENT_SAMPLE_SIZE, DEFAULTS.COMMENT_SAMPLE_SIZE)),
    scanChannelSponsors: getBoolProp_(PROP_KEYS.SCAN_CHANNEL_SPONSORS, true),
    attemptSponsorTimestamp: getBoolProp_(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, false),
    inboxSecretSet: !!props.getProperty(PROP_KEYS.INBOX_SHARED_SECRET),
    webAppUrl: getProp_(PROP_KEYS.WEB_APP_URL, ''),
    accessCodeSet: !!props.getProperty(PROP_KEYS.ACCESS_CODE),
    premiumUnlocked: hasPremiumAccess_(),
    timezone: getTimezone_(),
    defaultTargetRegions: getProp_(PROP_KEYS.DEFAULT_TARGET_REGIONS, '')
  };
}

/**
 * One paste instead of two: bundles the deployed Web App URL and the
 * shared secret into a single opaque string the extension can decode
 * client-side (plain base64, not encryption: the secret inside is
 * still the real security boundary, this just saves a second copy-paste
 * round trip and a chance to mismatch the wrong URL with the wrong
 * secret). The URL comes from the WEB_APP_URL property, set explicitly
 * in Settings, rather than ScriptApp.getService().getUrl() — that call
 * is ambiguous the moment a second Web App deployment exists for this
 * script (e.g. the auto-created @HEAD one from `clasp create`), and can
 * silently resolve to a stale, unconfigured deployment instead of the
 * one actually meant to serve the extension.
 */
function getConnectionCode_() {
  const secret = getProp_(PROP_KEYS.INBOX_SHARED_SECRET, '');
  if (!secret) throw new Error('Set a shared secret above first, then generate a connection code.');
  const url = getProp_(PROP_KEYS.WEB_APP_URL, '');
  if (!url) throw new Error('Set the Web App URL above first (paste it from Deploy > Manage deployments > the "Web app" one, ending in /exec), then generate a connection code.');
  return Utilities.base64Encode(JSON.stringify({ u: url, s: secret }));
}

function generateConnectionCode() {
  try { return { ok: true, code: getConnectionCode_() }; }
  catch (e) { return { ok: false, message: e.message }; }
}

function saveSettings(settings) {
  const props = PropertiesService.getDocumentProperties();
  if (settings.youtubeApiKey) props.setProperty(PROP_KEYS.YOUTUBE_API_KEY, settings.youtubeApiKey.trim());
  if (settings.geminiApiKey) props.setProperty(PROP_KEYS.GEMINI_API_KEY, settings.geminiApiKey.trim());
  if (settings.mistralApiKey) props.setProperty(PROP_KEYS.MISTRAL_API_KEY, settings.mistralApiKey.trim());
  if (settings.groqApiKey) props.setProperty(PROP_KEYS.GROQ_API_KEY, settings.groqApiKey.trim());
  if (settings.lookbackDays) props.setProperty(PROP_KEYS.LOOKBACK_DAYS, String(settings.lookbackDays));
  if (settings.commentSampleSize) props.setProperty(PROP_KEYS.COMMENT_SAMPLE_SIZE, String(settings.commentSampleSize));
  if (settings.inboxSecret) props.setProperty(PROP_KEYS.INBOX_SHARED_SECRET, settings.inboxSecret.trim());
  if (settings.webAppUrl) props.setProperty(PROP_KEYS.WEB_APP_URL, settings.webAppUrl.trim());
  if (settings.accessCode) props.setProperty(PROP_KEYS.ACCESS_CODE, settings.accessCode.trim());
  if (settings.timezone) props.setProperty(PROP_KEYS.TIMEZONE, settings.timezone.trim());
  props.setProperty(PROP_KEYS.SCAN_CHANNEL_SPONSORS, String(!!settings.scanChannelSponsors));
  props.setProperty(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, String(!!settings.attemptSponsorTimestamp));
  // Unconditional (unlike the API-key fields above): this is a normal
  // editable value, not a write-only masked secret, so clearing every
  // checkbox and the custom field must actually clear the stored default,
  // not silently keep whatever was set last time.
  props.setProperty(PROP_KEYS.DEFAULT_TARGET_REGIONS, String(settings.defaultTargetRegions || '').toUpperCase());
  return { ok: true };
}

// ---------- Prefetch (call once before the per-item loop) ----------

function prefetchChannelBatch(rawInputs) {
  try { return prefetchChannels(rawInputs); }
  catch (e) { return { resolved: {}, errors: {}, fatalError: e.message }; }
}

function prefetchVideoBatch(rawInputs) {
  try {
    const sampleSize = Number(getProp_(PROP_KEYS.COMMENT_SAMPLE_SIZE, DEFAULTS.COMMENT_SAMPLE_SIZE));
    return prefetchVideos(rawInputs, sampleSize);
  } catch (e) { return { resolved: {}, errors: {}, fatalError: e.message }; }
}

// ---------- Channel analysis (one input line per call; cache already warmed by prefetch) ----------

/**
 * Pure analysis: fetches + computes everything a channel row needs, but
 * writes nothing. Returns a bundle carrying both the display-ready
 * `preview` object and everything commitChannelAnalysis_ needs to write
 * the real row later, without re-fetching or re-running Gemini. Split out
 * of analyzeChannelOne specifically so the extension's Home tab can offer
 * a real "pull stats first, decide, then add to sheet" flow — Koli's
 * pipeline never had a preview-without-committing mode before this.
 */
function analyzeChannelCore_(channelId) {
  const data = getChannelData(channelId);

  const lookback = Number(getProp_(PROP_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS));
  const avgPosts = computeAvgPostsPerMonth_(data.recentVideos, lookback);
  const contact = findContact(data.description, channelId);
  const commentSample = getChannelCommentSample_(data.recentVideos);
  // Enrichment is the slowest single step (the one Gemini call): cache
  // it per channel so resending the same channel within the cache
  // window (a very normal thing to do while testing, or if a link
  // gets captured twice) skips it entirely instead of re-running a
  // full Gemini call for an answer that hasn't changed.
  const enrichment = withCache_(cacheKey_('enrichment', channelId), function () {
    return enrichChannel_(data.description, data.recentVideos, commentSample);
  }, 21600); // 6h: matches the existing raw-data cache TTL
  const aggregates = computeChannelAggregates_(data.recentVideos);
  const cpm = estimateCPM(enrichment.mainNiche, data.subCount, aggregates.engagementRatio);

  const grade = computeGrade_(channelId, aggregates.growthScore, enrichment.authenticity,
    aggregates.engagementRatio, enrichment.audience.location, data.recentVideos);
  const cpmRaw = estimateCPMRaw_(enrichment.mainNiche, data.subCount, aggregates.engagementRatio);
  const preview = {
    subCount: data.subCount, avgViews: aggregates.avgViews, engagementRatio: aggregates.engagementRatio,
    avgPostsPerMonth: avgPosts, mainNiche: enrichment.mainNiche,
    gradeLetter: grade.letter, gradeScore: grade.score, gradeConfidence: grade.confidence,
    suggestedRateLow: Math.round(cpmRaw.low * aggregates.avgViews / 1000),
    suggestedRateHigh: Math.round(cpmRaw.high * aggregates.avgViews / 1000),
    contactEmail: (contact && contact.email) || ''
  };

  return {
    channelId: channelId, name: data.name, data: data, avgPosts: avgPosts, contact: contact,
    enrichment: enrichment, aggregates: aggregates, cpm: cpm, preview: preview
  };
}

/** The actual sheet-mutating half of what analyzeChannelOne used to do in one step — writes the Channels row and records any sponsor mentions found. */
function commitChannelAnalysis_(bundle) {
  const data = bundle.data, enrichment = bundle.enrichment, aggregates = bundle.aggregates;

  writeChannelRow({
    channelId: bundle.channelId, name: data.name, mainNiche: enrichment.mainNiche, subNiches: enrichment.subNiches,
    avgPostsPerMonth: bundle.avgPosts, contact: bundle.contact, subCount: data.subCount, cpm: bundle.cpm,
    aboutSummary: enrichment.aboutSummary, avgViews: aggregates.avgViews, avgLikes: aggregates.avgLikes,
    avgComments: aggregates.avgComments, engagementRatio: aggregates.engagementRatio,
    postingPattern: aggregates.postingPattern, growthScore: aggregates.growthScore,
    authenticity: enrichment.authenticity, audience: enrichment.audience, recentVideos: data.recentVideos,
    suggestedRateLow: bundle.preview.suggestedRateLow, suggestedRateHigh: bundle.preview.suggestedRateHigh
  });

  if (getBoolProp_(PROP_KEYS.SCAN_CHANNEL_SPONSORS, true)) {
    const sponsorVideos = data.recentVideos.slice(0, 5);
    enrichment.sponsorsByVideo.forEach(function (entry) {
      const v = sponsorVideos[entry.index];
      if (v && entry.sponsors && entry.sponsors.length) {
        recordSponsorMentions(bundle.channelId, data.name, { videoId: v.videoId, title: v.title, publishedAt: v.publishedAt }, entry.sponsors);
      }
    });
  }
}

/** Unchanged public behavior: analyze AND commit in one step — used by bulk Channel Analysis, Process Prospects, and anything that doesn't need a look-first-decide-later flow. */
function analyzeChannelOne(rawInput) {
  try {
    const channelId = resolveChannelId(rawInput);
    const bundle = analyzeChannelCore_(channelId);
    commitChannelAnalysis_(bundle);
    return { ok: true, name: bundle.name, preview: bundle.preview };
  } catch (e) {
    if (e.skip) {
      writeChannelError_(rawInput, STATUS.SKIPPED + ': ' + e.message);
      return { ok: false, skipped: true, message: e.message };
    }
    writeChannelError_(rawInput, e.message);
    return { ok: false, message: e.message };
  }
}

/**
 * Analyzes without writing anything to the sheet — the actual "pull
 * stats first" half of the extension's Home-tab flow. Caches the full
 * bundle (30 min: long enough to look at the card and decide, short
 * enough not to go stale) so a follow-up commitChannelOne can write the
 * exact thing that was previewed without re-fetching YouTube or
 * re-running the Gemini call. If the bundle is too large for
 * CacheService's per-key limit, cachePut_ already fails silently by
 * design (see cache.gs) — commitChannelOne falls back to a fresh
 * analysis rather than erroring, so this never blocks the flow, it just
 * occasionally costs a re-fetch.
 */
function previewChannelOne(rawInput) {
  try {
    const channelId = resolveChannelId(rawInput);
    const bundle = analyzeChannelCore_(channelId);
    cachePut_(cacheKey_('pendingCommit', channelId), bundle, 1800);
    return { ok: true, channelId: channelId, name: bundle.name, preview: bundle.preview };
  } catch (e) {
    console.error('[Koli] previewChannelOne failed for "' + rawInput + '": ' + errMsg_(e));
    return { ok: false, error: errMsg_(e) };
  }
}

/** Commits a previously-previewed channel — reuses the cached bundle when it's still there, otherwise re-analyzes fresh (fail-soft, not an error) so a slow decision never just breaks. */
function commitChannelOne(channelId) {
  try {
    const cached = cacheGet_(cacheKey_('pendingCommit', channelId));
    const bundle = cached || analyzeChannelCore_(channelId);
    commitChannelAnalysis_(bundle);
    const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS).getSheetId();
    return { ok: true, name: bundle.name, link: link };
  } catch (e) {
    writeChannelError_(channelId, errMsg_(e));
    return { ok: false, error: errMsg_(e) };
  }
}

// ---------- Video analysis ----------

/** The analyze-without-writing half — everything analyzeVideoOne used to do in one step, minus the sheet write. Shared by the preview/commit split (extension's "Pull Stats" on a video page) and the one-step path bulk callers still use. */
function analyzeVideoCore_(rawInput) {
  const videoId = parseVideoInput_(rawInput);
  if (!videoId) throw new Error('Could not parse a video ID from "' + rawInput + '"');

  const sampleSize = Number(getProp_(PROP_KEYS.COMMENT_SAMPLE_SIZE, DEFAULTS.COMMENT_SAMPLE_SIZE));
  const video = getVideoData(videoId, sampleSize);
  const enrichment = enrichVideo_(video);

  let newSubs = 'n/a', aboutSummary = '';
  try {
    const channelData = getChannelData(video.channelId);
    recordSubscriberSnapshot_(video.channelId, channelData.subCount);
    newSubs = getNewSubscribersSince_(video.channelId, channelData.subCount);
    aboutSummary = getChannelAboutSummaryCached_(video.channelId, channelData.description, channelData.recentVideos);
  } catch (e) {
    newSubs = 'Channel unavailable';
  }

  const engagementRatio = video.views > 0 ? Math.round(((video.likes + video.commentCount) / video.views) * 1000) / 10 : 0;
  const preview = {
    title: video.title, views: video.views, likes: video.likes, commentCount: video.commentCount,
    engagementRatio: engagementRatio,
    authScore: (enrichment.authenticity.score === null || enrichment.authenticity.score === undefined) ? null : enrichment.authenticity.score,
    publishedAt: video.publishedAt, newSubscribers: newSubs,
    location: enrichment.audience.location, age: enrichment.audience.age, gender: enrichment.audience.gender
  };

  return { videoId: videoId, video: video, enrichment: enrichment, newSubs: newSubs, aboutSummary: aboutSummary, preview: preview };
}

/** The actual sheet-mutating half — writes the Videos row and records any sponsor mentions found. */
function commitVideoAnalysis_(bundle) {
  const video = bundle.video, enrichment = bundle.enrichment;

  writeVideoRow({
    videoId: bundle.videoId, title: video.title, channelId: video.channelId, channelTitle: video.channelTitle,
    publishedAt: video.publishedAt, views: video.views, likes: video.likes, commentCount: video.commentCount,
    authenticity: enrichment.authenticity, audience: enrichment.audience, newSubscribers: bundle.newSubs,
    channelAboutSummary: bundle.aboutSummary
  });

  if (enrichment.sponsors.length) {
    recordSponsorMentions(video.channelId, video.channelTitle, video, enrichment.sponsors);
  }
}

/** Unchanged public behavior: analyze AND commit in one step — used by bulk Video Analysis and anything that doesn't need a look-first-decide-later flow. */
function analyzeVideoOne(rawInput) {
  try {
    const bundle = analyzeVideoCore_(rawInput);
    commitVideoAnalysis_(bundle);
    return { ok: true, title: bundle.video.title };
  } catch (e) {
    if (e.skip) {
      writeVideoError_(rawInput, STATUS.SKIPPED + ': ' + e.message);
      return { ok: false, skipped: true, message: e.message };
    }
    writeVideoError_(rawInput, e.message);
    return { ok: false, message: e.message };
  }
}

/** "Pull stats" for a video page — analyzes WITHOUT writing anything to the Sheet, mirroring previewChannelOne. Caches the full bundle (30 min) so a follow-up commitVideoOne writes the exact thing that was previewed without re-fetching YouTube or re-running Gemini. */
function previewVideoOne(rawInput) {
  try {
    const bundle = analyzeVideoCore_(rawInput);
    cachePut_(cacheKey_('pendingCommitVideo', bundle.videoId), bundle, 1800);
    return { ok: true, videoId: bundle.videoId, title: bundle.video.title, preview: bundle.preview };
  } catch (e) {
    console.error('[Koli] previewVideoOne failed for "' + rawInput + '": ' + errMsg_(e));
    return { ok: false, error: errMsg_(e) };
  }
}

/** Commits a previously-previewed video — reuses the cached bundle when it's still there, otherwise re-analyzes fresh (fail-soft, same pattern as commitChannelOne). */
function commitVideoOne(videoId) {
  try {
    const cached = cacheGet_(cacheKey_('pendingCommitVideo', videoId));
    const bundle = cached || analyzeVideoCore_(videoId);
    commitVideoAnalysis_(bundle);
    const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.VIDEOS).getSheetId();
    return { ok: true, title: bundle.video.title, link: link };
  } catch (e) {
    writeVideoError_(videoId, errMsg_(e));
    return { ok: false, error: errMsg_(e) };
  }
}

// ---------- Profile ----------

function runProfileOne(rawInput, startDate, endDate, mode, track) {
  try {
    const result = runProfile(rawInput, startDate, endDate, mode, track);
    const stopNote = result.stoppedEarly ? ': stopped early (approaching Apps Script\'s time limit); re-run the same request to continue from here' : '';
    return {
      ok: true, name: result.channelName + stopNote,
      written: result.written, errors: result.errors, total: result.total,
      skippedAlreadyDone: result.skippedAlreadyDone
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ---------- Discover ----------

function runDiscoverOne(seedInput, searchType, resultCount, filters) {
  try {
    const result = runDiscover(seedInput, searchType, resultCount, filters);
    return { ok: true, message: result.message, count: result.count };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ---------- Input gathering ----------

function getSelectedRangeValues() {
  const range = SpreadsheetApp.getActiveRange();
  if (!range) return [];
  return range.getValues()
    .reduce(function (acc, row) { return acc.concat(row); }, [])
    .map(function (v) { return String(v).trim(); })
    .filter(function (v) { return v.length > 0; });
}
