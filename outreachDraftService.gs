/**
 * outreachDraftService.gs
 * Outreach draft generator (Batch 3) — one Channels row -> a short,
 * personalized cold-outreach email, hooked on a specific detail from one
 * of the creator's best-performing RECENT videos (by views, not just
 * whichever is newest — see pickBestPerformingVideos_) instead of generic
 * "love your content!" filler.
 *
 * Positioning matters here, stated explicitly since it changes the whole
 * email: this is an agency reaching out to OFFER a creator well-matched
 * sponsor opportunities and handle the relationship long-term — not a
 * brand cold-pitching a creator for a one-off promo. The email leads with
 * what's in it for the creator (a real pain point solved — inconsistent
 * sponsor income, generic deals that don't fit their content, time spent
 * chasing brands instead of making videos) rather than what's being asked
 * of them.
 *
 * Tone, revised after the first version still read as templated: the goal
 * isn't just "not salesy," it's that the email shouldn't read as
 * AI-written or as a research report on the creator. It should read like
 * it came from someone who actually watches this channel — the specific
 * detail woven in as familiarity, not cited as proof of research, and
 * with no explicit ask for a reply at the end (the specificity is what
 * earns the reply, not a "worth a quick reply?" nudge). See
 * draftOutreachEmailCopy_'s prompt for the full, explicit list of
 * AI-tell phrases/patterns this rejects.
 *
 * "Watching" a video here means the same thing it means everywhere else
 * in Koli: reading its public auto-caption transcript (captionsService.gs
 * — the same best-effort, unofficial endpoint already used for sponsor
 * timestamps) plus its description. Apps Script has no way to actually
 * decode video or audio. Falls back to the description alone when a
 * video has no captions available; a missing transcript never blocks a
 * draft, same fail-soft rule as everywhere else caption-fetching is used.
 *
 * Output lands in a new "Outreach Drafts" sheet, not a Doc — cells are
 * natively editable (the whole point: these are drafts, not a locked
 * export), and the Chars column is a live LEN() formula so it keeps
 * tracking the character limit as you hand-edit the draft afterward.
 */

const OUTREACH_EMAIL_MAX_CHARS = 500; // hard cap on the body — the part a recipient actually reads as "the email"
const OUTREACH_TRANSCRIPT_SAMPLE_CHARS = 900; // per video, prompt budget

function showDraftOutreachEmail() {
  if (!hasPremiumAccess_()) { showUpgradeAlert_('Draft Outreach Email'); return; }
  const row = getActiveChannelRow_();
  if (!row) {
    SpreadsheetApp.getUi().alert('Select a row on the Channels sheet first (click any cell in that row), then run this again.');
    return;
  }
  try {
    const result = buildOutreachDraft_(row);
    showLinkDialog_(
      'Outreach draft ready',
      result.channelName + ' — hook: "' + result.hookVideoTitle + '"\n\n' +
      'Subject: ' + result.subject + '\n\n' + result.body +
      '\n\n(' + result.bodyChars + '/' + OUTREACH_EMAIL_MAX_CHARS + ' characters' +
      (result.truncated ? ', trimmed to fit — edit freely in the sheet' : '') + ')',
      result.link, 'Open draft'
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Could not draft an outreach email: ' + e.message);
  }
}

function buildOutreachDraft_(row) {
  const channelsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CHANNELS);
  const rowData = getChannelRowData_(channelsSheet, row);
  if (!rowData.channelId) throw new Error('This row has no Channel ID — run Channel Analysis on it first.');

  const channel = getChannelData(rowData.channelId); // cache-first, cheap if already analyzed
  const topVideos = pickBestPerformingVideos_(channel.recentVideos || [], 3);
  if (!topVideos.length) throw new Error('No recent videos found for this channel.');

  const aboutSummary = getChannelAboutSummaryCached_(rowData.channelId, channel.description, channel.recentVideos);
  const videoExcerpts = topVideos.map(function (v) {
    const lines = fetchCaptionLines_(v.videoId);
    const excerpt = lines.length
      ? sampleTranscriptExcerpt_(lines, OUTREACH_TRANSCRIPT_SAMPLE_CHARS)
      : (v.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    return { videoId: v.videoId, title: v.title, excerpt: excerpt, fromCaptions: lines.length > 0, views: v.views };
  });

  const draft = draftOutreachEmailCopy_(rowData, aboutSummary, videoExcerpts);
  const enforced = enforceEmailCharLimit_(draft.body);
  const hookVideo = videoExcerpts[draft.referencedVideoIndex] || videoExcerpts[0];

  const sheet = getOrCreateSheet_(SHEET_NAMES.OUTREACH_DRAFTS, OUTREACH_DRAFT_HEADERS);
  ensureOutreachDraftStatusColumn_(sheet);

  const newRow = sheet.getLastRow() + 1;
  const values = [
    '', rowData.channelId, '', sanitizeCellText_(draft.subject), sanitizeCellText_(enforced.body),
    '', 'Draft', new Date()
  ];
  sheet.getRange(newRow, 1, 1, values.length).setValues([values]);
  sheet.getRange(newRow, 1).setFormula(hyperlinkFormula_(channelUrl_(rowData.channelId), rowData.name));
  sheet.getRange(newRow, 3).setFormula(hyperlinkFormula_(videoUrl_(hookVideo.videoId), hookVideo.title));
  sheet.getRange(newRow, 5).setWrap(true);
  sheet.getRange(newRow, 6).setFormula('=LEN(E' + newRow + ')'); // live count — keeps tracking the limit as you hand-edit the draft
  sheet.getRange(newRow, 8).setNumberFormat('yyyy-mm-dd hh:mm');

  const link = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + newRow;
  return {
    channelName: rowData.name, subject: draft.subject, body: enforced.body,
    bodyChars: enforced.body.length, truncated: enforced.truncated,
    hookVideoTitle: hookVideo.title, link: link
  };
}

/**
 * Evenly-spaced sampling instead of just the first N characters — video
 * intros are almost always generic ("hey guys, welcome back"), so reading
 * only the start would starve Gemini of anything actually specific to
 * hook the email on.
 */
function sampleTranscriptExcerpt_(lines, maxChars) {
  const full = lines.map(function (l) { return l.text; }).join(' ').replace(/\s+/g, ' ').trim();
  if (full.length <= maxChars) return full;
  const windowSize = Math.floor(maxChars / 3);
  return [0.1, 0.45, 0.8]
    .map(function (p) {
      const start = Math.floor(full.length * p);
      return full.slice(start, start + windowSize);
    })
    .join(' ... ');
}

/**
 * Best-performing, not just most-recent — a creator's newest upload might
 * be an off week; the video that actually landed with their audience is
 * better proof the hook came from real familiarity, and more likely to
 * be something worth referencing at all. Sampled from up to
 * RECENT_VIDEOS_FOR_METRICS (channelMetricsService.gs) recent uploads,
 * not their whole catalog — recent enough that referencing it doesn't
 * feel like digging up something old. Fails soft to most-recent if the
 * stats fetch comes back empty (API hiccup) rather than blocking the
 * whole draft over it.
 */
function pickBestPerformingVideos_(recentVideos, count) {
  const stats = fetchRecentVideoStats_(recentVideos);
  if (!stats.length) return recentVideos.slice(0, count);
  return stats.slice().sort(function (a, b) { return b.views - a.views; }).slice(0, count);
}

function draftOutreachEmailCopy_(rowData, aboutSummary, videoExcerpts) {
  const videoBlock = videoExcerpts.map(function (v, i) {
    const performanceNote = typeof v.views === 'number' ? ' — one of their best-performing recent uploads' : '';
    return (i + 1) + '. "' + v.title + '"' + performanceNote + ' (' +
      (v.fromCaptions ? 'transcript excerpt' : 'description only, no captions available') + '):\n' + v.excerpt;
  }).join('\n\n');

  const prompt =
    'You work at a boutique creator-partnerships agency. Draft a short outreach email to a YouTube ' +
    'creator. You are NOT a brand cold-pitching for a promo, and this is NOT a generic sponsorship ' +
    'request — you represent brands and bring the creator well-matched sponsor opportunities, handling ' +
    'the vetting and negotiation so they don\'t have to chase deals themselves. You\'re offering to build ' +
    'an ongoing relationship, not close a one-off transaction.\n\n' +
    'The single most important thing: write like someone who actually watches this creator\'s videos, ' +
    'not like someone who researched them for this email. Do not narrate that you watched or noticed ' +
    'something — never "I noticed...", "I saw...", "I came across...", "I was watching...", or any ' +
    'variant. Reference the specific detail the way you\'d bring it up mid-conversation with someone ' +
    'whose work you already know, not the way you\'d cite a source. The detail should feel incidental to ' +
    'the email, not the reason you\'re allowed to send it.\n\n' +
    'This draft will be rejected if it uses any of these — they\'re the tells that make an email read as ' +
    'AI-written or templated: em dashes used as sentence connectors; "I hope this email finds you well"; ' +
    '"I wanted to reach out" or any "reaching out" phrasing; "resonate(s/d)"; "elevate"; "unlock"; ' +
    '"seamless"; "delve"; "leverage"; "in today\'s [landscape/world/climate]"; "not only... but also" ' +
    'constructions; opening with "As a [creator/YouTuber/content creator]..."; superlatives like ' +
    '"incredible/amazing/phenomenal/huge"; a neatly parallel three-item list; exclamation points; or a ' +
    'closing line that explicitly asks for a reply ("worth a quick reply?", "let me know your thoughts", ' +
    '"would love to hear from you", "interested in chatting?"). Use contractions. Vary sentence length — ' +
    'a real email doesn\'t have uniform, polished rhythm; a short blunt sentence next to a longer one ' +
    'reads more human than three sentences of the same shape in a row.\n\n' +
    'Mandatory tone rules:\n' +
    '- Open on the specific detail itself — no greeting, no "great video" framing, no compliment first.\n' +
    '- Frame this as the start of a long-term relationship, not a single deal.\n' +
    '- Name ONE real, specific pain point this creator likely has — inconsistent sponsor income, generic ' +
    'brand deals that don\'t fit their content, time spent pitching brands instead of making videos, or ' +
    'negotiating alone with no agent — and speak directly to that one, not a list of several.\n' +
    '- Do not end with a direct ask for a reply (see the rejected list above). End on something specific ' +
    'enough that replying is the obvious next move without asking for it — trail off on the offer itself, ' +
    'or a genuine, specific observation about their work. Never a scheduling or "are you interested" ' +
    'question.\n' +
    '- No corporate jargon, no "synergy," no filler.\n\n' +
    'Creator: ' + rowData.name + '\nNiche: ' + (rowData.niche || 'unknown') + '\n' +
    'About: ' + (aboutSummary || 'n/a') + '\n\n' +
    'Below are excerpts from ' + videoExcerpts.length + ' of this creator\'s best-performing RECENT videos ' +
    '(by views, not just whichever is newest). Pick exactly ONE specific, concrete detail — a moment, ' +
    'technique, opinion, choice, or result — from ONE excerpt to build the email around. Ignore generic ' +
    'intro greetings and generic subscribe/outro requests. If an excerpt is description-only (no ' +
    'transcript), you may reference its stated topic, just don\'t claim to quote a specific line from it. ' +
    'Never state or imply a view count or any statistic in the email itself — knowing it performed well is ' +
    'context for you to pick a good hook, not something to mention; stating it would read as a research ' +
    'report, not familiarity.\n\n' +
    videoBlock + '\n\n' +
    'Respond as JSON: {"subject": "...", "body": "...", "referencedVideoIndex": <0-based index into the ' +
    'excerpts above>}\n' +
    '- "subject": references the specific detail, understated. Under 70 characters. Reads like a real ' +
    'subject line from a person, not a pitch headline.\n' +
    '- "body": opens on the specific detail (no "I noticed" framing), one beat naming the pain point and ' +
    'what you\'re offering to solve it (well-matched, long-term sponsor opportunities you\'d bring and ' +
    'manage — not "we want to sponsor you"), closes without an explicit ask for a reply. Signs off with ' +
    '"[Your name]" on its own line. HARD LIMIT ' + OUTREACH_EMAIL_MAX_CHARS + ' characters total, no ' +
    'exceptions — count as you write and stop well under the limit rather than padding to it.\n' +
    '- "referencedVideoIndex": which excerpt the hook came from.';

  const result = geminiCallJson_(prompt);
  const idx = Number(result.referencedVideoIndex);
  const validIdx = Number.isInteger(idx) && idx >= 0 && idx < videoExcerpts.length;
  return {
    subject: String(result.subject || '').trim(),
    body: String(result.body || '').trim(),
    referencedVideoIndex: validIdx ? idx : 0
  };
}

/**
 * Backstop, not the primary control — the prompt already asks Gemini to
 * self-limit, but nothing on its end enforces that (same reasoning as
 * clampAuthenticityScore_ in geminiService.gs: never trust an LLM's stated
 * constraint without checking it). Trims at the last whole word inside the
 * budget rather than a mid-word cut.
 */
function enforceEmailCharLimit_(body) {
  if (body.length <= OUTREACH_EMAIL_MAX_CHARS) return { body: body, truncated: false };
  const cut = body.slice(0, OUTREACH_EMAIL_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
  return { body: trimmed, truncated: true };
}

/** Native dropdown for Status, same pattern as Outreach's and Campaigns' Stage column. */
function ensureOutreachDraftStatusColumn_(sheet) {
  const statusCol = OUTREACH_DRAFT_HEADERS.indexOf('Status') + 1;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(OUTREACH_DRAFT_STATUSES, true).setAllowInvalid(false).build();
  sheet.getRange(2, statusCol, 1000, 1).setDataValidation(rule);
}
