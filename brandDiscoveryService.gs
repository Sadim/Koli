/**
 * brandDiscoveryService.gs
 * The actual missing half of the "brand acquisition pipeline": until now, a
 * brand only entered Koli if you already knew its name (typed into Brand
 * Targets) or it happened to already sponsor a channel you'd analyzed (Gap
 * Analysis, itself bounded to brands already sitting in the Sponsors tab).
 * Neither finds a brand Koli has never seen before.
 *
 * This does: search YouTube directly for a niche/keyword (not a specific
 * seed channel -- "budget travel," "AI coding tools," whatever the agency
 * is actually trying to break into), scan the candidate videos' own
 * descriptions for sponsor mentions, and surface only the brands that
 * AREN'T already in Brand Targets or the Sponsors tab. That last filter is
 * the whole point: this is a "what's new" feed, not another sponsor list
 * duplicating Gap Analysis.
 *
 * Same cost shape and philosophy as Discover (discoverService.gs): one
 * search.list call, capped candidate pool, one merged Gemini call for the
 * whole batch rather than one per video -- and unlike enrichVideo_, this
 * skips comments and statistics entirely (authenticity/audience aren't
 * needed here, only title+description), a real, deliberate savings on top
 * of the batching itself.
 */

const BRAND_DISCOVERY_HEADERS = [
  'Brand', 'Niche Searched', 'Seen In N Channels', 'Sample Channel', 'Sample Video', 'Evidence', 'Run Date'
];

function showBrandDiscoveryDialog() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Discover New Brands'); return; }
  const ui = SpreadsheetApp.getUi();
  const nicheResp = ui.prompt(
    'Discover New Brands',
    'What niche or keyword should Koli search YouTube for? (e.g. "budget travel," "AI coding tools," "home espresso")\n\n' +
    'This searches YouTube directly for videos in this space and scans their descriptions for sponsor mentions -- ' +
    'it does not require you to already have a channel in this niche tracked.',
    ui.ButtonSet.OK_CANCEL
  );
  if (nicheResp.getSelectedButton() !== ui.Button.OK) return;
  const niche = nicheResp.getResponseText().trim();
  if (!niche) { ui.alert('Enter a niche or keyword first.'); return; }

  try {
    const result = runBrandDiscovery(niche, DEFAULTS.BRAND_DISCOVERY_MAX_CANDIDATES);
    if (result.count) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BRAND_DISCOVERY);
      SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
    }
    ui.alert('Discover New Brands', result.message, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Could not run brand discovery: ' + errMsg_(e));
  }
}

/**
 * @param {string} nicheQuery - free-text niche/keyword, e.g. "budget travel"
 * @param {number} maxCandidates - videos to scan, capped at DEFAULTS.BRAND_DISCOVERY_MAX_CANDIDATES
 */
function runBrandDiscovery(nicheQuery, maxCandidates) {
  const niche = String(nicheQuery || '').trim();
  if (!niche) throw new Error('A niche or keyword is required.');
  const cappedCount = Math.min(Number(maxCandidates) || DEFAULTS.BRAND_DISCOVERY_MAX_CANDIDATES, DEFAULTS.BRAND_DISCOVERY_MAX_CANDIDATES);

  const videoIds = searchByKeywords_([niche], 'video', cappedCount);
  if (!videoIds.length) return { count: 0, scanned: 0, message: 'No videos found for "' + niche + '".' };

  const videos = getVideoSnippetsBatch_(videoIds);
  if (!videos.length) return { count: 0, scanned: 0, message: 'Found candidates for "' + niche + '" but none were reachable.' };

  const batchInput = videos.map(function (v, i) { return { index: i, title: v.title, description: v.description }; });
  const extracted = deriveBrandsFromVideoBatch_(batchInput);

  const alreadyKnown = getBrandTargetSet_();
  getKnownSponsorBrandSet_().forEach(function (b) { alreadyKnown.add(b); });

  const brandMap = {}; // normalized -> { brand, channels: Set, sampleVideoId, sampleChannelId, sampleChannelTitle, evidence }
  extracted.forEach(function (r) {
    const v = videos[r.index];
    if (!v) return;
    (r.sponsors || []).forEach(function (s) {
      const normalized = normalizeBrandName_(s.brand).toLowerCase();
      if (!normalized || alreadyKnown.has(normalized)) return; // net-new only: the whole point of this feature
      if (!brandMap[normalized]) {
        brandMap[normalized] = {
          brand: canonicalBrandName_(s.brand), channels: new Set(),
          sampleVideoId: v.videoId, sampleChannelId: v.channelId, sampleChannelTitle: v.channelTitle,
          evidence: s.evidence || ''
        };
      }
      brandMap[normalized].channels.add(v.channelId);
    });
  });

  const results = Object.keys(brandMap).map(function (k) {
    const b = brandMap[k];
    return {
      brand: b.brand, channelCount: b.channels.size, sampleChannelId: b.sampleChannelId,
      sampleChannelTitle: b.sampleChannelTitle, sampleVideoId: b.sampleVideoId, evidence: b.evidence
    };
  }).sort(function (a, b) { return b.channelCount - a.channelCount; });

  writeBrandDiscoveryResults_(results, niche);

  return {
    count: results.length, scanned: videos.length,
    message: results.length
      ? results.length + ' new brand(s) found (scanned ' + videos.length + ' video(s) for "' + niche + '"), not already in your Sponsors or Brand Targets data. See the Brand Discovery tab.'
      : 'Scanned ' + videos.length + ' video(s) for "' + niche + '": no brand mentions found that aren\'t already in your Sponsors or Brand Targets data.'
  };
}

/** Every brand already sitting in the Sponsors tab, normalized -- the other half of "already known" alongside getBrandTargetSet_ (Brand Targets). */
function getKnownSponsorBrandSet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SPONSORS);
  if (!sheet || sheet.getLastRow() < 2) return new Set();
  const brandCol = SPONSOR_HEADERS.indexOf('Brand') + 1;
  const brands = sheet.getRange(2, brandCol, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return normalizeBrandName_(r[0]).toLowerCase(); });
  return new Set(brands.filter(Boolean));
}

/**
 * Batch snippet fetch, deliberately lighter than getVideoData: no
 * commentThreads call, no statistics -- brand discovery only ever reads
 * title+description, so fetching either would be a real, avoidable cost
 * for zero benefit to this specific feature.
 */
function getVideoSnippetsBatch_(videoIds) {
  const key = ytApiKey_();
  const unique = Array.from(new Set(videoIds));
  const chunks = chunk_(unique, DEFAULTS.MAX_BATCH_ITEMS);
  const urls = chunks.map(function (c) { return YT_API_BASE + '/videos?part=snippet&id=' + c.join(',') + '&key=' + key; });
  const results = ytFetchAll_(urls);
  const out = [];
  results.forEach(function (data) {
    if (!data || !data.items) return;
    data.items.forEach(function (item) {
      out.push({
        videoId: item.id, title: item.snippet.title, description: item.snippet.description || '',
        channelId: item.snippet.channelId, channelTitle: item.snippet.channelTitle
      });
    });
  });
  return out;
}

/**
 * ONE Gemini call for the whole candidate batch (same "merge it into one
 * call" rule as everywhere else in Koli -- see geminiService.gs): N
 * separate per-video calls would be N times the cost for the same answer.
 * Text-based guess only, same honest limitation the existing sponsor
 * fallback (enrichVideo_'s sponsors field) already carries: a real
 * sponsorship with no textual trace in the description won't be caught.
 */
function deriveBrandsFromVideoBatch_(videos) {
  if (!videos.length) return [];
  const prompt =
    'You are scanning several YouTube video descriptions for brand sponsorships, paid promotions, ' +
    'affiliate deals, or discount codes (#ad, "sponsored by," "use code," "thanks to our sponsor," etc). ' +
    'For each video below, list any brands found. If a video has no sponsor mentions, omit it entirely ' +
    'from your response rather than including it with an empty list.\n\n' +
    'Respond as JSON: {"results": [{"index": <int>, "sponsors": [{"brand": "...", "evidence": "short quote or paraphrase"}]}]}\n\n' +
    videos.map(function (v) {
      return 'Video ' + v.index + '\nTitle: ' + v.title + '\nDescription:\n' + (v.description || '').slice(0, 1000);
    }).join('\n---\n');

  const result = geminiCallJson_(prompt);
  return Array.isArray(result.results) ? result.results : [];
}

function writeBrandDiscoveryResults_(results, niche) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.BRAND_DISCOVERY, BRAND_DISCOVERY_HEADERS);
  const now = new Date();
  results.forEach(function (r) {
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, BRAND_DISCOVERY_HEADERS.length).setValues([[
      sanitizeCellText_(r.brand), sanitizeCellText_(niche), r.channelCount, '', '', sanitizeCellText_(r.evidence || ''), now
    ]]);
    if (r.sampleChannelId) sheet.getRange(row, 4).setFormula(hyperlinkFormula_(channelUrl_(r.sampleChannelId), r.sampleChannelTitle || r.sampleChannelId));
    if (r.sampleVideoId) sheet.getRange(row, 5).setFormula(hyperlinkFormula_(videoUrl_(r.sampleVideoId), 'Sample video'));
    sheet.getRange(row, 7).setNumberFormat('yyyy-mm-dd hh:mm');
  });
}

/**
 * The Brand Discovery equivalent of addSponsorsToBrandTargets: picks up
 * selected rows from the Brand Discovery tab instead of requiring the
 * niche/brand to be re-typed by hand. Already-targeted brands are skipped,
 * not duplicated, same rule as the Sponsors version.
 */
function addBrandDiscoveriesToBrandTargets() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAMES.BRAND_DISCOVERY) {
    ui.alert('Select one or more rows on the Brand Discovery sheet first, then run this again.');
    return;
  }
  const ranges = getActiveRangesSafe_();
  const rows = new Set();
  ranges.forEach(function (range) {
    if (!range) return;
    for (let r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) { if (r >= 2) rows.add(r); }
  });
  if (!rows.size) {
    ui.alert('Select one or more data rows on Brand Discovery first, then run this again.');
    return;
  }

  const already = getBrandTargetSet_();
  let added = 0, skipped = 0;

  [...rows].forEach(function (row) {
    const brand = sheet.getRange(row, 1).getValue();
    const niche = sheet.getRange(row, 2).getValue();
    if (!brand) { skipped++; return; }
    if (already.has(normalizeBrandName_(brand).toLowerCase())) { skipped++; return; }
    addBrandTarget(brand, niche, 'Medium', 'Auto-added: found via Discover New Brands.');
    already.add(normalizeBrandName_(brand).toLowerCase());
    added++;
  });

  ui.alert('Added ' + added + ' brand(s) to Brand Targets' + (skipped ? ', skipped ' + skipped + ' (already targeted or missing a brand name)' : '') + '.');
}
