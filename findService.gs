/**
 * findService.gs
 * "Find" -- a keyword+tier+location influencer search, distinct in SHAPE
 * from both existing search features: runDiscover (discoverService.gs)
 * needs a seed channel/video and margin-scores similarity; Topic Research
 * (topicResearchService.gs) searches a bare topic across VIDEOS with
 * aggregate analytics, no tier/location filtering at all. This is the
 * third shape: no seed, a real keyword, and hard filters on influencer
 * size tier and country -- modeled on a reference screenshot (SocialiQ)
 * the founder shared for inspiration, not copied from any code.
 *
 * Reuses searchByKeywords_ (youtubeService.gs, the same keyword-search
 * primitive Discover's own keyword derivation and Topic Research both
 * already use) and writeDiscoverResults (sheetWriter.gs) -- results land
 * in the SAME Discover Results sheet, not a fourth candidates table,
 * since this is the same underlying job (surface new candidate creators)
 * with a different search shape, not a different destination.
 *
 * Served through the Web App (`?find=1`), same convention as Kolindar/
 * Topic Research: the page itself is open, the actual search action costs
 * real YouTube quota (search.list, 100 units) so it's gated by the shared
 * secret via a `k=` param, same as Topic Research.
 */

// Standard industry tier convention (Nano/Micro/Macro/Mega) -- NOT the exact
// numbers shown in the reference screenshot, which oddly labeled every tier
// as a bare "10K+"/"100K+"/"500K+"/"1M+" minimum with no upper bound (so a
// 2M-subscriber channel would satisfy all four checkboxes at once). Real
// [min,max) ranges here instead, so a channel lands in exactly one tier --
// what filtering by tier actually needs to mean something. Micro/Nano
// specifically called out by the founder as increasingly the right tier
// for UGC-style brand deals, not just an afterthought below Macro/Mega.
const INFLUENCER_TIERS = [
  { key: 'Nano', min: 1000, max: 10000 },
  { key: 'Micro', min: 10000, max: 100000 },
  { key: 'Macro', min: 100000, max: 1000000 },
  { key: 'Mega', min: 1000000, max: Infinity }
];

function classifyInfluencerTier_(subCount) {
  if (typeof subCount !== 'number') return null;
  const tier = INFLUENCER_TIERS.filter(function (t) { return subCount >= t.min && subCount < t.max; })[0];
  return tier ? tier.key : null;
}

/**
 * @param {string} keywords - free text, e.g. "sustainable fashion"
 * @param {string[]} [tiers] - subset of INFLUENCER_TIERS keys; empty/omitted = no tier filter
 * @param {string[]} [countries] - ISO country codes or names; empty/omitted = no location filter.
 *   Country-level only: YouTube's public Data API never exposes anything
 *   finer than a channel's own (self-declared, often unset) country field --
 *   there's no city-level location data to filter on for this platform,
 *   unlike the reference screenshot's "New York" example.
 */
function runFindInfluencers_(keywords, tiers, countries, resultCount) {
  const kw = String(keywords || '').trim();
  if (!kw) return { ok: false, error: 'Enter a keyword, hashtag, or topic to search for.' };
  const cappedCount = Math.max(1, Math.min(Number(resultCount) || DEFAULTS.DISCOVER_MAX_RESULTS, DEFAULTS.DISCOVER_MAX_RESULTS));

  const excluded = getExcludedChannelIds_();
  let candidateIds;
  try {
    candidateIds = searchByKeywords_([kw], 'channel', DEFAULTS.DISCOVER_CANDIDATE_POOL)
      .filter(function (id) { return !excluded.has(id); });
  } catch (e) {
    return { ok: false, error: 'YouTube search failed: ' + errMsg_(e) };
  }
  if (!candidateIds.length) {
    return { ok: false, error: 'No candidates found for "' + kw + '".' };
  }

  const tierSet = (tiers && tiers.length) ? tiers : null;
  const countrySet = (countries && countries.length) ? countries.map(function (c) { return String(c).toUpperCase(); }) : null;

  const withTier = candidateIds.map(function (id) {
    try { return getChannelData(id); } catch (e) { return null; }
  }).filter(Boolean)
    .map(function (c) { return { c: c, tier: classifyInfluencerTier_(c.subCount) }; });

  const filtered = withTier
    .filter(function (entry) { return !tierSet || (entry.tier && tierSet.indexOf(entry.tier) !== -1); })
    .filter(function (entry) { return !countrySet || (entry.c.country && countrySet.indexOf(String(entry.c.country).toUpperCase()) !== -1); });

  if (!filtered.length) {
    return { ok: false, error: 'Found ' + withTier.length + ' channel(s) for "' + kw + '", but none matched the selected tier/location filters.' };
  }

  const lookback = Number(getProp_(PROP_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS));
  const seedWords = normalizeWords_(kw);
  const results = filtered.map(function (entry) {
    const c = entry.c;
    const postsPerMonth = computeAvgPostsPerMonth_(c.recentVideos, lookback);
    const candidateWords = normalizeWords_(c.name + ' ' + (c.description || ''));
    // Text-overlap relevance only -- deliberately NOT fetching per-video
    // engagement stats here (an extra API call per candidate) the way
    // Discover's own scoring does: Find is meant to be the LIGHTER, faster
    // search, not a second Discover with the same cost.
    const overlap = seedWords.length ? seedWords.filter(function (w) { return candidateWords.indexOf(w) !== -1; }).length / seedWords.length : 0.5;
    return {
      type: 'Channel', name: c.name, url: channelUrl_(c.channelId), channel: '',
      subsOrViews: c.subCount, postsPerMonth: postsPerMonth, engagement: '',
      score: overlap, tier: entry.tier, country: c.country || ''
    };
  });

  results.sort(function (a, b) { return b.score - a.score; });
  const top = results.slice(0, cappedCount);

  writeDiscoverResults(top, 'Find: ' + kw);
  return { ok: true, count: top.length, results: top };
}

function showFindLinkDialog() {
  const url = getProp_(PROP_KEYS.WEB_APP_URL, '');
  const secret = firstConnectionSecret_();
  const ui = SpreadsheetApp.getUi();
  if (!url || !secret) {
    ui.alert('Find', 'Set the Web App URL and add a connection in Settings first (Koli menu > Settings > Connections) -- both are reused here, same as the extension\'s connection code.', ui.ButtonSet.OK);
    return;
  }
  const link = url + '?find=1&k=' + encodeURIComponent(secret);
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:\'Albert Sans\',sans-serif;padding:16px;font-size:13px;">' +
    '<p style="margin:0 0 10px;">Your Find link (bookmark this -- it includes your secret so searches work without typing it each time):</p>' +
    '<textarea readonly rows="3" style="width:100%;font-family:monospace;font-size:11px;padding:8px;border:1px solid #ccc;border-radius:8px;" onclick="this.select()">' + link + '</textarea>' +
    '</div>'
  ).setWidth(420).setHeight(180);
  ui.showModalDialog(html, 'Find Link');
}

/** The public page itself: same template-string convention as renderKolindarPage_/renderTopicResearchPage_. */
function renderFindPage_() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Find</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    ':root{--ink:oklch(13% 0 0);--text:oklch(22% 0 0);--mut:oklch(46% 0 0);--bg:oklch(97.8% 0 0);--surface:oklch(99.5% 0 0);' +
    '--border:oklch(13% 0 0 / .08);--patina-deep:oklch(45% .1 190);--patina:oklch(70% .12 188);--kinpaku-deep:oklch(61% .085 78);--error:oklch(52% .16 35);--green-bg:oklch(94% .06 155);}' +
    '*{box-sizing:border-box;}body{font-family:"Albert Sans","Avenir Next","Helvetica Neue",Arial,system-ui,sans-serif;background:var(--bg);color:var(--ink);margin:0;padding:28px 16px;}' +
    '.wrap{max-width:820px;margin:0 auto;}' +
    'h1{font-size:20px;margin:0 0 4px;}.sub{color:var(--mut);font-size:12.5px;margin-bottom:20px;}' +
    '.panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:20px;}' +
    'label{display:block;font-weight:700;font-size:12px;margin-bottom:7px;}' +
    '#q{width:100%;padding:11px 14px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;background:var(--surface);margin-bottom:16px;}' +
    '.tier-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;}' +
    '.tier-box{position:relative;border:1px solid var(--border);border-radius:10px;padding:10px;cursor:pointer;text-align:center;user-select:none;}' +
    '.tier-box.active{border-color:var(--patina-deep);background:var(--green-bg);}' +
    // Real gap caught by actually looking at the rendered page (2026-09-14):
    // "selected" was color/border only -- clearly visible, but a smaller
    // state-indicator than the reference screenshot's own checkmark icon.
    // A real checkmark badge, not just a color shift.
    '.tier-box.active::after{content:"\\2713";position:absolute;top:4px;right:6px;width:14px;height:14px;line-height:14px;font-size:9px;font-weight:700;border-radius:50%;background:var(--patina-deep);color:#fff;}' +
    '.tier-box b{display:block;font-size:13px;}.tier-box span{font-size:10px;color:var(--mut);}' +
    '#countries{width:100%;padding:11px 14px;border:1px solid var(--border);border-radius:10px;font-size:13px;font-family:inherit;background:var(--surface);margin-bottom:6px;}' +
    '.hint{font-size:10.5px;color:var(--mut);margin-bottom:16px;}' +
    '.btn-row{display:flex;gap:8px;}' +
    '#searchBtn{flex:1;padding:12px;border:none;border-radius:10px;background:var(--patina-deep);color:#fff;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;}' +
    '#searchBtn:disabled{opacity:.55;}' +
    '#clearBtn{padding:12px 18px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--ink);font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;}' +
    '.msg{font-size:12.5px;margin-bottom:14px;}.msg.err{color:var(--error);}' +
    '.result-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;}' +
    '.result-card a{color:var(--ink);text-decoration:none;font-weight:700;font-size:13.5px;}' +
    '.result-meta{font-size:11px;color:var(--mut);margin-top:3px;}' +
    '.tier-pill{font-size:10px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--green-bg);color:var(--patina-deep);white-space:nowrap;}' +
    '.empty{color:var(--mut);font-size:12.5px;text-align:center;padding:30px 0;}' +
    '.foot{margin-top:26px;font-size:10.5px;color:var(--mut);text-align:center;}' +
    '</style></head><body><div class="wrap">' +
    '<h1>Find</h1>' +
    '<div class="sub">Search influencers by keyword, hashtag, or topic -- filter by size tier and country. Results also land in your Discover Results sheet.</div>' +
    '<div class="panel">' +
    '<label for="q">Search Influencers</label>' +
    '<input type="text" id="q" placeholder="e.g. sustainable fashion" maxlength="200" />' +
    '<label>Influencer Type</label>' +
    '<div class="tier-grid" id="tierGrid"></div>' +
    '<label for="countries">Countries (optional)</label>' +
    '<input type="text" id="countries" placeholder="e.g. US, GB, CA" />' +
    '<div class="hint">Country only -- YouTube never exposes city-level creator location, only a channel’s own (often unset) declared country.</div>' +
    '<div class="btn-row"><button type="button" id="clearBtn">Clear</button><button type="button" id="searchBtn">Search</button></div>' +
    '</div>' +
    '<div id="results"></div>' +
    '<div class="foot">Powered by Koli</div></div>' +
    '<script>' +
    'const BASE=window.location.href.split("?")[0];' +
    'const PARAMS=new URLSearchParams(window.location.search);' +
    'const K=PARAMS.get("k")||"";' +
    'const TIERS=[["Nano","1K+"],["Micro","10K+"],["Macro","100K+"],["Mega","1M+"]];' +
    'const activeTiers=new Set();' +
    'function compactNumber(n){return typeof n!=="number"?"N/A":n>=1000000?(n/1000000).toFixed(1)+"M":n>=1000?(n/1000).toFixed(1)+"K":String(n);}' +
    'function el(tag,attrs,children){const e=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){if(k==="text")e.textContent=attrs[k];else if(k==="html")e.innerHTML=attrs[k];else e.setAttribute(k,attrs[k]);});(children||[]).forEach(function(c){e.appendChild(c);});return e;}' +
    'const tierGrid=document.getElementById("tierGrid");' +
    'TIERS.forEach(function(pair){' +
    'const box=el("div",{class:"tier-box"});' +
    'const b=el("b",{text:pair[0]});const span=el("span",{text:pair[1]+" Followers"});' +
    'box.appendChild(b);box.appendChild(span);' +
    'box.onclick=function(){' +
    'if(activeTiers.has(pair[0])){activeTiers.delete(pair[0]);box.classList.remove("active");}' +
    'else{activeTiers.add(pair[0]);box.classList.add("active");}' +
    '};' +
    'tierGrid.appendChild(box);' +
    '});' +
    'function runSearch(){' +
    'const q=document.getElementById("q").value.trim();' +
    'const countries=document.getElementById("countries").value.trim();' +
    'const results=document.getElementById("results");' +
    'const btn=document.getElementById("searchBtn");' +
    'if(!q){results.innerHTML="";results.appendChild(el("div",{class:"msg err",text:"Enter a keyword first."}));return;}' +
    'btn.disabled=true;btn.textContent="Searching…";' +
    'results.innerHTML="<div class=\\"empty\\">Searching…</div>";' +
    'const params=new URLSearchParams();params.set("find","1");params.set("action","search");params.set("q",q);params.set("k",K);' +
    'if(activeTiers.size)params.set("tiers",Array.from(activeTiers).join(","));' +
    'if(countries)params.set("countries",countries);' +
    'fetch(BASE+"?"+params.toString())' +
    '.then(function(r){return r.json();}).then(function(resp){' +
    'btn.disabled=false;btn.textContent="Search";' +
    'results.innerHTML="";' +
    'if(!resp.ok){results.appendChild(el("div",{class:"msg err",text:resp.error}));return;}' +
    'renderResults(resp);' +
    '}).catch(function(){' +
    'btn.disabled=false;btn.textContent="Search";' +
    'results.innerHTML="";results.appendChild(el("div",{class:"msg err",text:"Something went wrong -- please try again."}));' +
    '});' +
    '}' +
    'function renderResults(resp){' +
    'const results=document.getElementById("results");' +
    'results.appendChild(el("div",{class:"msg",text:resp.count+" result(s), also written to Discover Results."}));' +
    'resp.results.forEach(function(r){' +
    'const card=el("div",{class:"result-card"});' +
    'const left=el("div",{});' +
    'const link=el("a",{href:r.url,target:"_blank",text:r.name});' +
    'const meta=el("div",{class:"result-meta",text:compactNumber(r.subsOrViews)+" subscribers · "+(typeof r.postsPerMonth==="number"?r.postsPerMonth.toFixed(1):"N/A")+" posts/mo"+(r.country?" · "+r.country:"")});' +
    'left.appendChild(link);left.appendChild(meta);' +
    'card.appendChild(left);' +
    'if(r.tier)card.appendChild(el("div",{class:"tier-pill",text:r.tier}));' +
    'results.appendChild(card);' +
    '});' +
    '}' +
    'document.getElementById("clearBtn").onclick=function(){' +
    'document.getElementById("q").value="";document.getElementById("countries").value="";' +
    'activeTiers.clear();tierGrid.querySelectorAll(".tier-box").forEach(function(b){b.classList.remove("active");});' +
    'document.getElementById("results").innerHTML="";' +
    '};' +
    'document.getElementById("searchBtn").onclick=runSearch;' +
    'document.getElementById("q").addEventListener("keydown",function(e){if(e.key==="Enter")runSearch();});' +
    '</script></body></html>';
}
