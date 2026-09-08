/**
 * uiHandlers.gs
 * Menu, sidebar/dialog entry points, and the orchestration functions the
 * client-side sidebar JS calls. Channel/Video/Profile each start with one
 * batched prefetch call (parallel network requests, warms the cache), then
 * loop one item at a time so the client can show live, resumable progress.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Koli')
    .addItem('Profile', 'showProfileSidebar')
    .addItem('Discover', 'showDiscoverSidebar')
    .addItem('Dashboard', 'showDashboard')
    .addItem('Campaigns', 'showCampaigns')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Brand Intelligence')
      .addItem('Brand Targets', 'showBrandTargets')
      .addItem('Add Brand Target...', 'showAddBrandTargetDialog')
      .addItem('Run Gap Analysis (selected Channels row)', 'runGapAnalysisForActiveRow')
      .addItem('Normalize Sponsor Names', 'normalizeExistingSponsors'))
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Export')
      .addItem('Creator One-Pager (selected row)', 'exportCreatorOnePager')
      .addItem('Draft Deal Memo (selected row)', 'exportDealMemo')
      .addItem('Performance Report (Channels or Profile row)', 'exportPerformanceReport')
      .addItem('New Campaign (selected Channels row)', 'showCreateCampaignDialog')
      .addItem('Draft Outreach Email (selected Channels row)', 'showDraftOutreachEmail'))
    .addItem('Refresh Tracked Profiles', 'runRefreshTrackedProfiles')
    .addItem('Process Prospects', 'processInbox')
    .addSeparator()
    .addItem('Settings', 'showSettingsDialog')
    .addItem('Run Diagnostics', 'runDiagnostics')
    .addItem('Migrate Channels Sheet (v2)', 'migrateChannelsSheetV2')
    .addItem('Help', 'showHelp')
    .addToUi();
}

/** Returns the currently active sheet/tab's name — powers the sidebar's active-tab indicator. */
function getActiveSheetName() {
  return SpreadsheetApp.getActiveSheet().getName();
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
    results.push('✗ Drive/Docs permission: ' + e.message);
  }

  ui.alert('Koli Diagnostics', results.join('\n\n'), ui.ButtonSet.OK);
}

function showProfileSidebar() {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.mode = 'profile';
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('Koli — Profile'));
}

function showDiscoverSidebar() {
  const t = HtmlService.createTemplateFromFile('Sidebar');
  t.mode = 'discover';
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('Koli — Discover'));
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
    'Analyze Channels / Analyze Videos — bulk metadata enrichment.\n' +
    'Profile — full per-video history for one channel over a date range, trackable going forward.\n' +
    'Discover — find channels/videos similar to a seed link.\n' +
    'Refresh Tracked Profiles — pulls new videos for every channel you\'ve tagged as tracked.\n' +
    'Export > Creator One-Pager — pitch-ready PDF for the selected Channels row.\n' +
    'Export > Draft Outreach Email — personalized cold-email draft hooked on a specific ' +
    'detail from the creator\'s last 3 videos, editable in the Outreach Drafts sheet.\n' +
    'Assistant — plain-English command box, restricted to Koli\'s own actions.\n' +
    'Run Diagnostics — checks your API keys and Drive permissions in one click.\n' +
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
    return r.error ? (r.channel + ': error — ' + r.error) : (r.channel + ': ' + r.newVideos + ' new video(s)');
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
    logSponsorMentions: getBoolProp_(PROP_KEYS.LOG_SPONSOR_MENTIONS, false),
    attemptSponsorTimestamp: getBoolProp_(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, false),
    inboxSecretSet: !!props.getProperty(PROP_KEYS.INBOX_SHARED_SECRET),
    timezone: getTimezone_()
  };
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
  if (settings.timezone) props.setProperty(PROP_KEYS.TIMEZONE, settings.timezone.trim());
  props.setProperty(PROP_KEYS.SCAN_CHANNEL_SPONSORS, String(!!settings.scanChannelSponsors));
  props.setProperty(PROP_KEYS.LOG_SPONSOR_MENTIONS, String(!!settings.logSponsorMentions));
  props.setProperty(PROP_KEYS.ATTEMPT_SPONSOR_TIMESTAMP, String(!!settings.attemptSponsorTimestamp));
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

function analyzeChannelOne(rawInput) {
  try {
    const channelId = resolveChannelId(rawInput);
    const data = getChannelData(channelId);

    const lookback = Number(getProp_(PROP_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS));
    const avgPosts = computeAvgPostsPerMonth_(data.recentVideos, lookback);
    const contact = findContact(data.description);
    const commentSample = getChannelCommentSample_(data.recentVideos);
    // Enrichment is the slowest single step (the one Gemini call) — cache
    // it per channel so resending the same channel within the cache
    // window (a very normal thing to do while testing, or if a link
    // gets captured twice) skips it entirely instead of re-running a
    // full Gemini call for an answer that hasn't changed.
    const enrichment = withCache_(cacheKey_('enrichment', channelId), function () {
      return enrichChannel_(data.description, data.recentVideos, commentSample);
    }, 21600); // 6h — matches the existing raw-data cache TTL
    const aggregates = computeChannelAggregates_(data.recentVideos);
    const cpm = estimateCPM(enrichment.mainNiche, data.subCount, aggregates.engagementRatio);

    writeChannelRow({
      channelId: channelId, name: data.name, mainNiche: enrichment.mainNiche, subNiches: enrichment.subNiches,
      avgPostsPerMonth: avgPosts, contact: contact, subCount: data.subCount, cpm: cpm,
      aboutSummary: enrichment.aboutSummary, avgViews: aggregates.avgViews, avgLikes: aggregates.avgLikes,
      avgComments: aggregates.avgComments, engagementRatio: aggregates.engagementRatio,
      postingPattern: aggregates.postingPattern, growthScore: aggregates.growthScore,
      authenticity: enrichment.authenticity, audience: enrichment.audience, recentVideos: data.recentVideos
    });

    if (getBoolProp_(PROP_KEYS.SCAN_CHANNEL_SPONSORS, true)) {
      const sponsorVideos = data.recentVideos.slice(0, 5);
      enrichment.sponsorsByVideo.forEach(function (entry) {
        const v = sponsorVideos[entry.index];
        if (v && entry.sponsors && entry.sponsors.length) {
          recordSponsorMentions(channelId, data.name, { videoId: v.videoId, title: v.title, publishedAt: v.publishedAt }, entry.sponsors);
        }
      });
    }

    return { ok: true, name: data.name };
  } catch (e) {
    if (e.skip) {
      writeChannelError_(rawInput, STATUS.SKIPPED + ': ' + e.message);
      return { ok: false, skipped: true, message: e.message };
    }
    writeChannelError_(rawInput, e.message);
    return { ok: false, message: e.message };
  }
}

// ---------- Video analysis ----------

function analyzeVideoOne(rawInput) {
  try {
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

    writeVideoRow({
      videoId: videoId, title: video.title, channelId: video.channelId, channelTitle: video.channelTitle,
      publishedAt: video.publishedAt, views: video.views, likes: video.likes, commentCount: video.commentCount,
      authenticity: enrichment.authenticity, audience: enrichment.audience, newSubscribers: newSubs,
      channelAboutSummary: aboutSummary
    });

    if (enrichment.sponsors.length) {
      recordSponsorMentions(video.channelId, video.channelTitle, video, enrichment.sponsors);
    }

    return { ok: true, title: video.title };
  } catch (e) {
    if (e.skip) {
      writeVideoError_(rawInput, STATUS.SKIPPED + ': ' + e.message);
      return { ok: false, skipped: true, message: e.message };
    }
    writeVideoError_(rawInput, e.message);
    return { ok: false, message: e.message };
  }
}

// ---------- Profile ----------

function runProfileOne(rawInput, startDate, endDate, mode, track) {
  try {
    const result = runProfile(rawInput, startDate, endDate, mode, track);
    const stopNote = result.stoppedEarly ? ' — stopped early (approaching Apps Script\'s time limit); re-run the same request to continue from here' : '';
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
