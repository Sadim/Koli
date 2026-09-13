/**
 * topicResearchService.gs
 * Free-text TOPIC search across public YouTube -- distinct from Discover
 * (discoverService.gs), which needs a seed channel or video and margin-
 * scores similar results. This searches a bare topic with nothing to seed
 * from: "how to bake bread," not "channels like X."
 *
 * Modeled on the "Research" feature of github.com/AgriciDaniel/youtubepro
 * (Apache-2.0, checked via GitHub's API before treating as a real
 * reference -- 387 stars, 138 forks, ~3 weeks old, plausible growth): read
 * its README for the feature's SHAPE (topic query -> up to 50 videos ->
 * aggregate momentum/publication/duration analytics -> a coverage note),
 * no code borrowed -- this is a from-scratch Apps-Script-native
 * implementation, same as every other externally-inspired feature in this
 * project. Deliberately narrower than that tool's full product: this
 * covers only the Research/analytics piece the user actually asked for,
 * not its separate AI-Insights/Script-Writer/Thumbnail-Creator features.
 *
 * Served through the Web App (`?research=1`), not the Sheet -- the user's
 * explicit ask was "part of webapp." A search costs real YouTube quota
 * (search.list is 100 units vs. 1 for videos.list), so the SEARCH action
 * requires the same shared secret the extension already uses
 * (INBOX_SHARED_SECRET) as a `k=` query param -- viewing the page itself
 * needs no secret, only running an actual search does, so a random visitor
 * who finds the bare URL can't burn the account's daily quota.
 */

const TOPIC_RESEARCH_MAX_RESULTS = 50;

/** Runs a topic search + full analytics. Called from doGet after the shared-secret check. */
function runTopicResearch_(query, maxResults) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) return { ok: false, error: 'Enter a topic to search.' };
  if (trimmedQuery.length > 200) return { ok: false, error: 'Topic is too long (200 characters max).' };
  const capped = Math.max(1, Math.min(Number(maxResults) || TOPIC_RESEARCH_MAX_RESULTS, TOPIC_RESEARCH_MAX_RESULTS));

  let videoIds;
  try {
    videoIds = searchByKeywords_([trimmedQuery], 'video', capped);
  } catch (e) {
    return { ok: false, error: 'YouTube search failed: ' + errMsg_(e) };
  }
  if (!videoIds.length) return { ok: false, error: 'No videos found for that topic.' };

  const videos = fetchTopicVideoDetails_(videoIds);
  if (!videos.length) return { ok: false, error: 'Found matching videos, but could not fetch their details.' };

  return {
    ok: true,
    query: trimmedQuery,
    requested: capped,
    videos: videos,
    analytics: computeTopicAnalytics_(videos),
    coverage: buildTopicCoverageNote_(videos.length, videoIds.length)
  };
}

/** Batch-fetches snippet+statistics+contentDetails for up to 50 video IDs per call -- one search's worth of IDs always fits in one call, no chunking loop needed beyond the single batch. */
function fetchTopicVideoDetails_(videoIds) {
  const key = ytApiKey_();
  const url = YT_API_BASE + '/videos?part=snippet,statistics,contentDetails&id=' + videoIds.join(',') + '&key=' + key;
  let data;
  try { data = ytFetch_(url); } catch (e) { return []; }
  if (!data.items) return [];
  return data.items.map(function (item) {
    const stats = item.statistics || {};
    const thumbs = item.snippet.thumbnails || {};
    const thumb = thumbs.medium || thumbs.default || {};
    return {
      videoId: item.id,
      title: item.snippet.title,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnail: thumb.url || '',
      views: Number(stats.viewCount || 0),
      likes: Number(stats.likeCount || 0),
      comments: Number(stats.commentCount || 0),
      durationSeconds: parseIso8601DurationSeconds_(item.contentDetails && item.contentDetails.duration)
    };
  });
}

/**
 * Aggregate analytics over the returned snapshot. "Momentum" is views per
 * day-since-published, not raw views -- a fairer way to compare a video
 * from today against one from two years ago than a raw view-count
 * leaderboard would be (which just rewards age). Publication pattern is a
 * plain day-of-week histogram: enough to show "this topic's top videos
 * mostly post midweek" without overclaiming a causal pattern from a
 * sample this small.
 */
function computeTopicAnalytics_(videos) {
  const now = Date.now();
  const withAge = videos.map(function (v) {
    const publishedMs = new Date(v.publishedAt).getTime();
    const ageDays = isNaN(publishedMs) ? null : Math.max(0.5, (now - publishedMs) / 86400000);
    return { v: v, ageDays: ageDays };
  });

  const totalViews = videos.reduce(function (s, v) { return s + v.views; }, 0);
  const avgViews = Math.round(totalViews / videos.length);
  const avgEngagementPct = Math.round(
    (videos.reduce(function (s, v) { return s + (v.views > 0 ? (v.likes + v.comments) / v.views : 0); }, 0) / videos.length) * 1000
  ) / 10;

  const withMomentum = withAge.filter(function (x) { return x.ageDays !== null; });
  const byMomentum = withMomentum.slice().sort(function (a, b) { return (b.v.views / b.ageDays) - (a.v.views / a.ageDays); });
  const topByMomentum = byMomentum.slice(0, 5).map(function (x) {
    return { videoId: x.v.videoId, title: x.v.title, viewsPerDay: Math.round(x.v.views / x.ageDays) };
  });

  const shorts = videos.filter(function (v) { return isLikelyShort_(v.durationSeconds); });

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
  videos.forEach(function (v) {
    const d = new Date(v.publishedAt);
    if (!isNaN(d.getTime())) dayOfWeekCounts[d.getDay()]++;
  });

  return {
    totalViews: totalViews,
    avgViews: avgViews,
    avgEngagementPct: avgEngagementPct,
    shortsCount: shorts.length,
    longFormCount: videos.length - shorts.length,
    topByMomentum: topByMomentum,
    dayOfWeek: DAY_LABELS.map(function (label, i) { return { label: label, count: dayOfWeekCounts[i] }; })
  };
}

/** Honest data-quality note -- YouTube's own search result count is approximate and never guaranteed to fully enrich (private/deleted videos, transient API errors), so this says plainly when the returned set is smaller than what search reported. */
function buildTopicCoverageNote_(enrichedCount, searchResultCount) {
  const missing = searchResultCount - enrichedCount;
  return missing > 0
    ? missing + ' of ' + searchResultCount + ' matching video(s) could not be enriched (private, deleted, or a transient API error) and are excluded below.'
    : 'All ' + enrichedCount + ' matching video(s) were successfully enriched.';
}

function showTopicResearchLinkDialog() {
  const url = getProp_(PROP_KEYS.WEB_APP_URL, '');
  const secret = getProp_(PROP_KEYS.INBOX_SHARED_SECRET, '');
  const ui = SpreadsheetApp.getUi();
  if (!url || !secret) {
    ui.alert('Topic Research', 'Set both the Web App URL and a shared secret in Settings first (Koli menu > Settings) -- both are reused here, same as the extension\'s connection code.', ui.ButtonSet.OK);
    return;
  }
  const link = url + '?research=1&k=' + encodeURIComponent(secret);
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:\'Albert Sans\',sans-serif;padding:16px;font-size:13px;">' +
    '<p style="margin:0 0 10px;">Your Topic Research link (bookmark this -- it includes your secret so searches work without typing it each time):</p>' +
    '<textarea readonly rows="3" style="width:100%;font-family:monospace;font-size:11px;padding:8px;border:1px solid #ccc;border-radius:8px;" onclick="this.select()">' + link + '</textarea>' +
    '</div>'
  ).setWidth(420).setHeight(180);
  ui.showModalDialog(html, 'Topic Research Link');
}

/**
 * The public page itself: a template string, same convention
 * renderKolindarPage_/publishService.gs's page-renderer already use for
 * anything doGet serves directly. This session's Impeccable tokens, for
 * consistency with everything else built tonight.
 */
function renderTopicResearchPage_() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Topic Research</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    ':root{--ink:oklch(13% 0 0);--text:oklch(22% 0 0);--mut:oklch(46% 0 0);--bg:oklch(97.8% 0 0);--surface:oklch(99.5% 0 0);' +
    '--border:oklch(13% 0 0 / .08);--patina-deep:oklch(45% .1 190);--patina:oklch(70% .12 188);--kinpaku-deep:oklch(61% .085 78);--error:oklch(52% .16 35);}' +
    '*{box-sizing:border-box;}body{font-family:"Albert Sans","Avenir Next","Helvetica Neue",Arial,system-ui,sans-serif;background:var(--bg);color:var(--ink);margin:0;padding:28px 16px;}' +
    '.wrap{max-width:900px;margin:0 auto;}' +
    'h1{font-size:20px;margin:0 0 4px;}.sub{color:var(--mut);font-size:12.5px;margin-bottom:18px;}' +
    '.search-row{display:flex;gap:8px;margin-bottom:20px;}' +
    '#q{flex:1;padding:11px 14px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;background:var(--surface);}' +
    '#searchBtn{padding:11px 20px;border:none;border-radius:10px;background:var(--patina-deep);color:#fff;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;}' +
    '#searchBtn:disabled{opacity:.55;}' +
    '.msg{font-size:12.5px;margin-bottom:14px;}.msg.err{color:var(--error);}.msg.coverage{color:var(--mut);}' +
    '.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;}' +
    '.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center;}' +
    '.stat-card b{display:block;font-size:18px;}.stat-card span{font-size:10.5px;color:var(--mut);}' +
    '.section-title{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--mut);margin:18px 0 8px;}' +
    '.momentum-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px;}' +
    '.momentum-row a{color:var(--ink);text-decoration:none;font-weight:600;}' +
    '.momentum-row span{color:var(--mut);white-space:nowrap;}' +
    '.day-bars{display:flex;gap:6px;align-items:flex-end;height:60px;}' +
    '.day-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;}' +
    '.day-bar i{display:block;width:100%;background:var(--patina);border-radius:3px 3px 0 0;min-height:2px;}' +
    '.day-bar span{font-size:9.5px;color:var(--mut);}' +
    '.video-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:8px;}' +
    '.video-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;}' +
    '.video-card img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;background:var(--bg);}' +
    '.video-card-body{padding:10px 11px;}' +
    '.video-card-title{font-size:12.5px;font-weight:700;line-height:1.3;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}' +
    '.video-card-channel{font-size:11px;color:var(--mut);margin-bottom:6px;}' +
    '.video-card-stats{font-size:10.5px;color:var(--mut);}' +
    '.empty{color:var(--mut);font-size:12.5px;text-align:center;padding:30px 0;}' +
    '.foot{margin-top:26px;font-size:10.5px;color:var(--mut);text-align:center;}' +
    '</style></head><body><div class="wrap">' +
    '<h1>Topic Research</h1>' +
    '<div class="sub">Search a topic across public YouTube -- up to 50 videos, momentum, publication pattern, and coverage in one snapshot.</div>' +
    '<div class="search-row"><input type="text" id="q" placeholder="e.g. sourdough bread for beginners" maxlength="200" /><button type="button" id="searchBtn">Search</button></div>' +
    '<div id="results"></div>' +
    '<div class="foot">Powered by Koli</div></div>' +
    '<script>' +
    'const BASE=window.location.href.split("?")[0];' +
    'const PARAMS=new URLSearchParams(window.location.search);' +
    'const K=PARAMS.get("k")||"";' +
    'function el(tag,attrs,children){const e=document.createElement(tag);Object.keys(attrs||{}).forEach(function(k){if(k==="text")e.textContent=attrs[k];else if(k==="html")e.innerHTML=attrs[k];else e.setAttribute(k,attrs[k]);});(children||[]).forEach(function(c){e.appendChild(c);});return e;}' +
    'function compactNumber(n){return n>=1000000?(n/1000000).toFixed(1)+"M":n>=1000?(n/1000).toFixed(1)+"K":String(n);}' +
    'function runSearch(){' +
    'const q=document.getElementById("q").value.trim();' +
    'const results=document.getElementById("results");' +
    'const btn=document.getElementById("searchBtn");' +
    'if(!q){results.innerHTML="";results.appendChild(el("div",{class:"msg err",text:"Enter a topic first."}));return;}' +
    'btn.disabled=true;btn.textContent="Searching…";' +
    'results.innerHTML="<div class=\\"empty\\">Searching…</div>";' +
    'fetch(BASE+"?research=1&action=search&q="+encodeURIComponent(q)+"&k="+encodeURIComponent(K))' +
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
    'const a=resp.analytics;' +
    'results.appendChild(el("div",{class:"msg coverage",text:resp.coverage}));' +
    'const grid=el("div",{class:"stat-grid"});' +
    '[["Videos found",String(resp.videos.length)],["Avg views",compactNumber(a.avgViews)],["Avg engagement",a.avgEngagementPct+"%"],["Shorts / Long-form",a.shortsCount+" / "+a.longFormCount]].forEach(function(pair){' +
    'const card=el("div",{class:"stat-card"});' +
    'const b=el("b",{text:pair[1]});const span=el("span",{text:pair[0]});' +
    'card.appendChild(b);card.appendChild(span);grid.appendChild(card);' +
    '});' +
    'results.appendChild(grid);' +
    'results.appendChild(el("div",{class:"section-title",text:"Top by momentum (views per day since published)"}));' +
    'if(!a.topByMomentum.length){results.appendChild(el("div",{class:"empty",text:"Not enough dated videos to rank by momentum."}));}' +
    'a.topByMomentum.forEach(function(m){' +
    'const row=el("div",{class:"momentum-row"});' +
    'const link=el("a",{href:"https://www.youtube.com/watch?v="+m.videoId,target:"_blank",text:m.title});' +
    'const vpd=el("span",{text:compactNumber(m.viewsPerDay)+"/day"});' +
    'row.appendChild(link);row.appendChild(vpd);results.appendChild(row);' +
    '});' +
    'results.appendChild(el("div",{class:"section-title",text:"Publication pattern (day of week)"}));' +
    'const bars=el("div",{class:"day-bars"});' +
    'const maxCount=Math.max.apply(null,a.dayOfWeek.map(function(d){return d.count;}))||1;' +
    'a.dayOfWeek.forEach(function(d){' +
    'const bar=el("div",{class:"day-bar"});' +
    'const i=el("i",{style:"height:"+Math.max(2,Math.round((d.count/maxCount)*52))+"px"});' +
    'const label=el("span",{text:d.label});' +
    'bar.appendChild(i);bar.appendChild(label);bars.appendChild(bar);' +
    '});' +
    'results.appendChild(bars);' +
    'results.appendChild(el("div",{class:"section-title",text:"Every video in this snapshot"}));' +
    'const videoGrid=el("div",{class:"video-grid"});' +
    'resp.videos.forEach(function(v){' +
    'const card=el("div",{class:"video-card"});' +
    'const img=el("img",{src:v.thumbnail||"",alt:""});' +
    'const body=el("div",{class:"video-card-body"});' +
    'const title=el("div",{class:"video-card-title",text:v.title});' +
    'const channel=el("div",{class:"video-card-channel",text:v.channelTitle});' +
    'const stats=el("div",{class:"video-card-stats",text:compactNumber(v.views)+" views · "+compactNumber(v.likes)+" likes · "+compactNumber(v.comments)+" comments"});' +
    'body.appendChild(title);body.appendChild(channel);body.appendChild(stats);' +
    'const link=el("a",{href:"https://www.youtube.com/watch?v="+v.videoId,target:"_blank"});' +
    'link.appendChild(img);' +
    'card.appendChild(link);card.appendChild(body);videoGrid.appendChild(card);' +
    '});' +
    'results.appendChild(videoGrid);' +
    '}' +
    'document.getElementById("searchBtn").onclick=runSearch;' +
    'document.getElementById("q").addEventListener("keydown",function(e){if(e.key==="Enter")runSearch();});' +
    '</script></body></html>';
}
